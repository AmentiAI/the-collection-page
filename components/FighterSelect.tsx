'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useLaserEyes } from '@omnisat/lasereyes'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletFighter {
  inscription_id: string
  inscription_number: number
  content_type: string | null
  content_url: string
  collection_slug: string | null
  collection_name: string | null
  collection_image: string | null
  floor_price_sats: number | null
  meta_name: string | null
  sat_rarity: string | null
  output: string | null
  output_value: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFloor(sats: number | null): string {
  if (sats === null) return '—'
  return `${(sats / 100_000_000).toFixed(8).replace(/\.?0+$/, '')} BTC`
}

function displayName(f: WalletFighter): string {
  if (f.meta_name) return f.meta_name
  if (f.collection_name) return `${f.collection_name} #${f.inscription_number.toLocaleString()}`
  return `#${f.inscription_number.toLocaleString()}`
}

const FLOOR_FILTERS = [
  { label: 'All', max: Infinity },
  { label: '<10k', max: 10_000 },
  { label: '<100k', max: 100_000 },
  { label: '<500k', max: 500_000 },
  { label: '<1M', max: 1_000_000 },
]

// ─── Inscription art preview ──────────────────────────────────────────────────

function InscriptionArt({
  fighter,
  size = 'md',
  float = false,
}: {
  fighter: WalletFighter
  size?: 'sm' | 'md' | 'lg'
  float?: boolean
}) {
  const [imgErr, setImgErr] = useState(false)
  const sizeClass = { sm: 'w-20 h-20', md: 'w-32 h-32 lg:w-40 lg:h-40', lg: 'w-44 h-44 lg:w-56 lg:h-56' }[size]
  const isImage = fighter.content_type?.startsWith('image/')
  const isHtml = fighter.content_type?.startsWith('text/html') || fighter.content_type === 'application/xhtml+xml'

  if (isHtml && fighter.content_url) {
    return (
      <iframe
        src={fighter.content_url}
        className={`${sizeClass} rounded-lg`}
        style={{ border: 'none', pointerEvents: 'none', filter: 'drop-shadow(0 0 12px rgba(220,38,38,0.6))' }}
        sandbox="allow-scripts allow-same-origin"
        scrolling="no"
        loading="lazy"
      />
    )
  }

  if (!imgErr && isImage && fighter.content_url) {
    return (
      <img
        src={fighter.content_url}
        alt={displayName(fighter)}
        className={`${sizeClass} object-contain rounded-lg ${float ? 'animate-pulse' : ''}`}
        style={{ filter: 'drop-shadow(0 0 12px rgba(220,38,38,0.6))' }}
        loading="lazy"
        onError={() => setImgErr(true)}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-lg flex flex-col items-center justify-center border border-red-900/40`}
      style={{ background: 'rgba(120,10,10,0.25)' }}
    >
      <span className="text-red-700 text-[10px] lg:text-xs font-black uppercase tracking-widest">ORD</span>
      {size !== 'sm' && (
        <span className="text-red-300 font-black text-xs lg:text-sm mt-0.5">
          #{fighter.inscription_number.toLocaleString()}
        </span>
      )}
    </div>
  )
}

// ─── PSBT signing modal ───────────────────────────────────────────────────────

function PsbtModal({
  fighter,
  address,
  publicKey,
  onSigned,
  onCancel,
}: {
  fighter: WalletFighter
  address: string
  publicKey: string
  onSigned: (psbt: string) => void
  onCancel: () => void
}) {
  const { client } = useLaserEyes()
  const [step, setStep] = useState<'idle' | 'building' | 'signing' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSign = useCallback(async () => {
    setStep('building')
    setError(null)
    try {
      const buildRes = await fetch('/api/prepare-psbt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscription_id: fighter.inscription_id, address, public_key: publicKey, player_id: address }),
      })
      const buildData = await buildRes.json()
      if (!buildRes.ok || !buildData.psbt) throw new Error(buildData.error ?? 'Failed to build PSBT')

      setStep('signing')
      const signResult = await (client as any).signPsbt(buildData.psbt as string, true, false)

      let signedPsbt: string
      if (typeof signResult === 'string') {
        signedPsbt = signResult
      } else if (signResult?.signedPsbtBase64) {
        signedPsbt = signResult.signedPsbtBase64
      } else if (signResult?.signedPsbtHex) {
        signedPsbt = Buffer.from(signResult.signedPsbtHex, 'hex').toString('base64')
      } else {
        throw new Error('Unexpected signPsbt response')
      }

      setStep('done')
      onSigned(signedPsbt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signing failed')
      setStep('error')
    }
  }, [fighter.inscription_id, address, publicKey, client, onSigned])

  const steps = ['Building PSBT', 'Sign in Wallet', 'Done']
  const stepIdx = { idle: -1, building: 0, signing: 1, done: 2, error: 0 }[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={onCancel}>
      <div className="w-full max-w-xl relative overflow-hidden" style={{ borderRadius: 6 }} onClick={(e) => e.stopPropagation()}>
        {/* Panel top shine */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,80,0,0.6) 25%, rgba(255,200,80,0.85) 50%, rgba(255,80,0,0.6) 75%, transparent)', zIndex: 3 }} />
        <div style={{ position: 'absolute', top: 0, left: '18%', width: '32%', height: 50, background: 'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, transparent 100%)', borderRadius: '0 0 50% 50%', zIndex: 2 }} />
        <div style={{ border: '1px solid rgba(200,30,0,0.35)', borderRadius: 6, background: 'linear-gradient(160deg, rgba(120,5,5,0.28) 0%, rgba(8,2,5,0.97) 60%)', backdropFilter: 'blur(14px)', padding: '28px 28px 24px', position: 'relative', zIndex: 1 }}>

          {/* Fighter preview */}
          <div className="flex items-center gap-4 mb-6">
            <InscriptionArt fighter={fighter} size="md" />
            <div>
              <div className="font-black text-xl" style={{ color: '#e8eef7' }}>{displayName(fighter)}</div>
              {fighter.collection_name && <div className="text-sm mt-0.5" style={{ color: '#7f1d1d' }}>{fighter.collection_name}</div>}
              {fighter.floor_price_sats !== null && <div className="text-sm font-bold mt-0.5" style={{ color: '#22c55e' }}>Floor {formatFloor(fighter.floor_price_sats)}</div>}
            </div>
          </div>

          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div style={{ width: 6, height: 6, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 6px #ff2200' }} />
              <div className="text-xl font-black uppercase tracking-widest" style={{ color: '#fff' }}>Commit to Battle</div>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#6a2020' }}>
              Sign a PSBT that commits this inscription as your fighter. Proves ownership on-chain — it will not broadcast until the battle executes.
            </p>
          </div>

          {/* Burn warning */}
          <div className="relative overflow-hidden flex items-start gap-3 px-4 py-3 mb-5" style={{ borderRadius: 4, background: 'linear-gradient(135deg, rgba(180,130,0,0.1), rgba(80,50,0,0.06))', border: '1px solid rgba(234,179,8,0.35)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.6), transparent)' }} />
            <span className="text-xl flex-shrink-0">🔥</span>
            <div>
              <div className="text-sm font-black uppercase tracking-widest mb-0.5" style={{ color: '#eab308' }}>This inscription will be permanently burned</div>
              <div className="text-xs leading-relaxed" style={{ color: '#a16207' }}>
                Win or lose, both inscriptions are destroyed. If you <span style={{ color: '#eab308', fontWeight: 900 }}>win</span>, you get the sat value of both UTXOs. If you <span style={{ color: '#ef4444', fontWeight: 900 }}>lose</span>, you get nothing.
              </div>
            </div>
          </div>

          {/* UTXO info */}
          {fighter.output && (
            <div className="flex gap-4 px-4 py-2.5 mb-5 font-mono text-xs" style={{ borderRadius: 4, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(185,28,28,0.15)' }}>
              <div className="flex-1 flex justify-between"><span style={{ color: '#4a1515' }}>UTXO</span><span style={{ color: '#7f1d1d' }}>{fighter.output.slice(0, 10)}…{fighter.output.slice(-6)}</span></div>
              <div style={{ width: 1, background: 'rgba(185,28,28,0.15)' }} />
              <div className="flex-1 flex justify-between"><span style={{ color: '#4a1515' }}>Value</span><span style={{ color: '#7f1d1d' }}>{fighter.output_value?.toLocaleString() ?? '—'} sats</span></div>
            </div>
          )}

          {/* Step progress */}
          <div className="flex items-center gap-2 mb-5">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className="w-7 h-7 flex items-center justify-center text-xs font-black" style={{ borderRadius: 3, background: i < stepIdx ? '#b91c1c' : i === stepIdx ? 'rgba(185,28,28,0.35)' : 'rgba(255,255,255,0.04)', border: `1px solid ${i <= stepIdx ? 'rgba(185,28,28,0.6)' : 'rgba(185,28,28,0.12)'}`, color: i <= stepIdx ? '#fff' : '#4a1515' }}>
                  {i < stepIdx ? '✓' : i + 1}
                </div>
                {i < steps.length - 1 && <div className="w-8 h-px" style={{ background: i < stepIdx ? '#b91c1c' : 'rgba(255,255,255,0.07)' }} />}
              </div>
            ))}
            <span className="ml-3 text-xs font-black uppercase tracking-widest" style={{ color: '#6a2020' }}>
              {step === 'idle' && 'Ready'}{step === 'building' && 'Building…'}{step === 'signing' && 'Awaiting wallet…'}{step === 'done' && 'Signed!'}{step === 'error' && 'Error'}
            </span>
          </div>

          {error && (
            <div className="px-3 py-2 mb-4 text-sm" style={{ borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>{error}</div>
          )}

          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3.5 text-sm font-black uppercase tracking-widest transition-opacity hover:opacity-70" style={{ borderRadius: 4, background: 'rgba(255,255,255,0.02)', color: '#6a2020', border: '1px solid rgba(185,28,28,0.22)' }}>
              Cancel
            </button>
            <button
              onClick={step === 'error' || step === 'idle' ? handleSign : undefined}
              disabled={step === 'building' || step === 'signing' || step === 'done'}
              className="flex-1 relative overflow-hidden py-3.5 text-sm font-black uppercase tracking-widest text-white transition-all"
              style={{ borderRadius: 4, background: step === 'done' ? 'linear-gradient(135deg, rgba(22,101,52,0.6), rgba(5,40,15,0.8))' : 'linear-gradient(135deg, #b91c1c, #7f1d1d)', opacity: step === 'building' || step === 'signing' ? 0.55 : 1, boxShadow: step !== 'done' ? '0 0 20px rgba(185,28,28,0.35)' : 'none' }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,150,100,0.5), transparent)' }} />
              {step === 'idle' && '⚔️ Sign & Fight'}{step === 'building' && 'Building…'}{step === 'signing' && 'Sign in Wallet'}{step === 'done' && '✓ Committed'}{step === 'error' && 'Retry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FighterSelect({ disabled: disabledProp }: { disabled?: boolean }) {
  const router = useRouter()
  const { connected, address, publicKey } = useLaserEyes()

  const [fighters, setFighters] = useState<WalletFighter[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selfDisabled, setSelfDisabled] = useState(false)

  const disabled = disabledProp || selfDisabled

  const [selected, setSelected] = useState<WalletFighter | null>(null)
  const [showPsbt, setShowPsbt] = useState(false)
  const [signedPsbt, setSignedPsbt] = useState<string | null>(null)

  // Filters
  const [maxFloor, setMaxFloor] = useState(Infinity)
  const [collectionFilter, setCollectionFilter] = useState('all')
  const [onlyCollections, setOnlyCollections] = useState(false)

  const fetchFighters = useCallback(async () => {
    if (!connected || !address) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/wallet-fighters?address=${encodeURIComponent(address)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setFighters(data.data ?? [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load wallet')
    } finally {
      setLoading(false)
    }
  }, [connected, address])

  useEffect(() => {
    if (connected) {
      fetchFighters()
    } else {
      setFighters([])
      setSelected(null)
      setSignedPsbt(null)
    }
  }, [connected, fetchFighters])

  // Self-disable if wallet address has an active queue entry in the DB
  useEffect(() => {
    if (!address) return
    fetch(`/api/matchmaking/player?player_id=${encodeURIComponent(address)}`)
      .then(r => r.json())
      .then(d => { if (d.found && (d.status === 'waiting' || d.status === 'matched')) setSelfDisabled(true) })
      .catch(() => {})
  }, [address])

  const [activeTab, setActiveTab] = useState<'normal' | 'padded'>('normal')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  const collections = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of fighters) {
      if (f.collection_slug && f.collection_name) map.set(f.collection_slug, f.collection_name)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [fighters])

  const filtered = useMemo(() => {
    return fighters.filter((f) => {
      if (onlyCollections && !f.collection_name) return false
      if (collectionFilter !== 'all' && f.collection_slug !== collectionFilter) return false
      if (maxFloor < Infinity) {
        if (f.floor_price_sats !== null && f.floor_price_sats >= maxFloor) return false
      }
      return true
    })
  }, [fighters, onlyCollections, collectionFilter, maxFloor])

  // Split by UTXO value
  const normalFighters = useMemo(
    () => filtered.filter((f) => f.output_value === 330 || f.output_value === 546),
    [filtered]
  )
  const paddedFighters = useMemo(
    () => filtered.filter((f) => f.output_value !== 330 && f.output_value !== 546),
    [filtered]
  )

  const activeList = activeTab === 'normal' ? normalFighters : paddedFighters
  const totalPages = Math.ceil(activeList.length / PAGE_SIZE)
  const pageFighters = activeList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when tab or filters change
  useEffect(() => { setPage(0) }, [activeTab, maxFloor, collectionFilter, onlyCollections])

  const handlePsbtSigned = (psbt: string) => {
    setSignedPsbt(psbt)
    setShowPsbt(false)
    sessionStorage.setItem('fighter_inscription_id', selected!.inscription_id)
    sessionStorage.setItem('fighter_signed_psbt', psbt)
    sessionStorage.setItem('fighter_data', JSON.stringify(selected))
    setTimeout(() => router.push('/lobby'), 600)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="text-5xl opacity-20">💀</div>
        <div className="text-sm font-black uppercase tracking-widest" style={{ color: '#4a1515' }}>
          Connect your wallet to choose a fighter
        </div>
      </div>
    )
  }

  // ── Shared glass panel ────────────────────────────────────────────────────
  const GlassCard = ({ children, selected: sel = false, onClick, className = '' }: { children: React.ReactNode; selected?: boolean; onClick?: () => void; className?: string }) => (
    <div
      onClick={onClick}
      className={`relative overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        borderRadius: 5,
        border: `1px solid ${sel ? 'rgba(255,60,0,0.5)' : 'rgba(185,28,28,0.18)'}`,
        background: sel
          ? 'linear-gradient(160deg, rgba(140,10,10,0.28) 0%, rgba(8,2,5,0.95) 65%)'
          : 'linear-gradient(160deg, rgba(80,5,5,0.14) 0%, rgba(6,1,4,0.97) 65%)',
        backdropFilter: 'blur(8px)',
        boxShadow: sel ? '0 0 22px rgba(255,50,0,0.18)' : 'none',
        transform: sel && onClick ? 'scale(1.02)' : 'scale(1)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Top shine */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: sel ? 'linear-gradient(90deg, transparent, rgba(255,80,0,0.7) 30%, rgba(255,200,80,0.9) 50%, rgba(255,80,0,0.7) 70%, transparent)' : 'linear-gradient(90deg, transparent, rgba(255,40,0,0.3) 40%, rgba(255,40,0,0.3) 60%, transparent)', zIndex: 1 }} />
      {sel && <div style={{ position: 'absolute', top: 0, left: '15%', width: '32%', height: 36, background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)', borderRadius: '0 0 50% 50%', zIndex: 0 }} />}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  )

  return (
    <div className={`w-full relative ${disabled ? 'pointer-events-none' : ''}`}>
      {/* Disabled overlay */}
      {disabled && (
        <div className="absolute inset-0 z-20 rounded-xl flex items-center justify-center" style={{ background: 'rgba(3,1,1,0.75)', backdropFilter: 'blur(3px)' }}>
          <div className="text-xs font-black uppercase tracking-widest text-center px-6" style={{ color: '#4a1515' }}>
            Fighter already in queue — return to lobby or cancel before selecting a new one
          </div>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div style={{ width: 3, height: 36, background: 'linear-gradient(180deg, #ff2200, #660000)', borderRadius: 2 }} />
          <div>
            <h2 className="text-2xl lg:text-3xl font-black uppercase" style={{ color: '#fff', textShadow: '0 0 30px rgba(255,40,0,0.4)', letterSpacing: '0.12em' }}>
              Choose Your Ordinal
            </h2>
            <p className="text-xs uppercase tracking-widest font-bold mt-0.5" style={{ color: '#5a1515' }}>
              {loading ? 'Scanning inscriptions…' : fighters.length > 0 ? `${normalFighters.length} eligible · ${paddedFighters.length} padded` : 'No inscriptions found'}
            </p>
          </div>
        </div>
        {signedPsbt && selected && (
          <div className="relative overflow-hidden flex items-center gap-2 px-3 py-1.5 text-xs font-black" style={{ borderRadius: 4, background: 'rgba(22,101,52,0.18)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.5), transparent)' }} />
            ✓ {displayName(selected)} committed
          </div>
        )}
      </div>

      {/* Burn warning */}
      <div className="relative overflow-hidden flex items-start gap-3 px-4 py-3 mb-5" style={{ borderRadius: 5, background: 'linear-gradient(135deg, rgba(180,130,0,0.1), rgba(80,50,0,0.06))', border: '1px solid rgba(234,179,8,0.3)' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.5) 30%, rgba(255,220,80,0.7) 50%, rgba(234,179,8,0.5) 70%, transparent)' }} />
        <span className="text-xl flex-shrink-0 mt-0.5">🔥</span>
        <div>
          <div className="text-sm font-black uppercase tracking-widest mb-0.5" style={{ color: '#eab308' }}>Your inscription will be burned — even if you win</div>
          <div className="text-xs leading-relaxed" style={{ color: '#a16207' }}>Both inscriptions are permanently destroyed on-chain. The winner receives the sat value of both UTXOs. Only enter with an inscription you are willing to sacrifice.</div>
        </div>
      </div>

      {/* Selected detail + commit CTA */}
      {selected && !showPsbt && (
        <GlassCard selected className="mb-5 flex items-center gap-4 lg:gap-5 px-5 py-4">
          <InscriptionArt fighter={selected} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-base lg:text-xl font-black truncate" style={{ color: '#e8eef7' }}>{displayName(selected)}</div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {selected.collection_name && <span className="text-xs text-red-800">{selected.collection_name}</span>}
              {selected.floor_price_sats !== null && <span className="text-xs font-bold" style={{ color: '#22c55e' }}>Floor {formatFloor(selected.floor_price_sats)}</span>}
              {selected.sat_rarity && selected.sat_rarity !== 'common' && <span className="text-xs font-bold" style={{ color: '#f5d060' }}>✦ {selected.sat_rarity}</span>}
            </div>
          </div>
          {signedPsbt ? (
            <div className="text-sm font-black flex-shrink-0" style={{ color: '#22c55e' }}>✓ Committed</div>
          ) : (
            <button
              onClick={() => setShowPsbt(true)}
              className="flex-shrink-0 relative overflow-hidden px-6 py-3 text-sm font-black uppercase tracking-widest text-white transition-opacity hover:opacity-85"
              style={{ borderRadius: 4, background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)', boxShadow: '0 0 18px rgba(185,28,28,0.45)' }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,150,100,0.6), transparent)' }} />
              ⚔️ Fight with This
            </button>
          )}
        </GlassCard>
      )}

      {/* Tabs */}
      {!loading && fighters.length > 0 && (
        <div className="flex gap-2 mb-4">
          {([
            { key: 'normal', label: '⚔️ Eligible Fighters', count: normalFighters.length },
            { key: 'padded', label: '🪙 Extra Padded', count: paddedFighters.length },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="relative overflow-hidden px-4 py-2 font-black text-sm uppercase tracking-wide transition-all"
              style={{
                borderRadius: 4,
                background: activeTab === key ? 'linear-gradient(135deg, rgba(185,28,28,0.25), rgba(100,10,10,0.12))' : 'rgba(80,5,5,0.08)',
                border: `1px solid ${activeTab === key ? 'rgba(185,28,28,0.45)' : 'rgba(185,28,28,0.14)'}`,
                color: activeTab === key ? '#cc2200' : '#4a1515',
              }}
            >
              {activeTab === key && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,80,0,0.5), transparent)' }} />}
              {label} <span className="opacity-50 ml-1">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      {!loading && fighters.length > 0 && (
        <div className="relative overflow-hidden flex flex-wrap items-center gap-3 px-4 py-3 mb-5" style={{ borderRadius: 5, background: 'rgba(80,5,5,0.1)', border: '1px solid rgba(185,28,28,0.14)' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(185,28,28,0.25), transparent)' }} />
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#6a2020' }}>Floor</span>
            <div className="flex gap-1">
              {FLOOR_FILTERS.map((f) => (
                <button key={f.max} onClick={() => setMaxFloor(f.max)} className="px-3 py-1 text-xs font-bold transition-all" style={{ borderRadius: 3, background: maxFloor === f.max ? '#991b1b' : 'rgba(255,255,255,0.03)', color: maxFloor === f.max ? '#fca5a5' : '#7f1d1d', border: `1px solid ${maxFloor === f.max ? 'rgba(185,28,28,0.5)' : 'rgba(185,28,28,0.12)'}` }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {collections.length > 0 && (
            <>
              <div style={{ width: 1, height: 16, background: 'rgba(185,28,28,0.2)' }} />
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#6a2020' }}>Collection</span>
                <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)} className="text-xs rounded px-3 py-1 font-bold outline-none" style={{ background: '#0d0509', border: '1px solid rgba(185,28,28,0.2)', color: '#7f1d1d' }}>
                  <option value="all">All</option>
                  {collections.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-14 gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#cc2200' }} />
          <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#4a1515' }}>Summoning inscriptions…</span>
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="text-sm" style={{ color: '#f87171' }}>{loadError}</div>
          <button onClick={fetchFighters} className="text-xs font-black uppercase tracking-widest underline hover:opacity-70" style={{ color: '#cc2200' }}>Retry</button>
        </div>
      )}

      {/* No results */}
      {!loading && !loadError && fighters.length > 0 && activeList.length === 0 && (
        <div className="py-10 text-center text-sm font-bold" style={{ color: '#4a1515' }}>
          {activeTab === 'normal' ? 'No eligible inscriptions (330 or 546 sat UTXOs) match the current filters.' : 'No extra-padded inscriptions match the current filters.'}
        </div>
      )}

      {/* Grid */}
      {!loading && !loadError && pageFighters.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
          {pageFighters.map((fighter) => {
            const isSelected = selected?.inscription_id === fighter.inscription_id
            const isSigned = !!(signedPsbt && selected?.inscription_id === fighter.inscription_id)
            return (
              <GlassCard key={fighter.inscription_id} selected={isSelected} onClick={() => setSelected(fighter)}>
                {isSigned && (
                  <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: '#166534', color: '#4ade80' }}>✓</div>
                )}
                {/* Art */}
                <div className="flex items-center justify-center py-5 lg:py-7" style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <InscriptionArt fighter={fighter} size="md" />
                </div>
                {/* Info */}
                <div className="p-3">
                  <div className="text-sm font-black tabular-nums mb-1" style={{ color: fighter.output_value === 330 || fighter.output_value === 546 ? '#22c55e' : '#f59e0b' }}>
                    {fighter.output_value != null ? `Size: ${fighter.output_value.toLocaleString()} Sats` : '— Sats'}
                  </div>
                  <div className="text-sm font-black truncate leading-tight" style={{ color: '#e8eef7' }}>{displayName(fighter)}</div>
                  {fighter.collection_name ? (
                    <div className="flex items-center gap-1 mt-1">
                      {fighter.collection_image && (
                        <img src={fighter.collection_image} alt="" className="w-3 h-3 rounded-full object-cover flex-shrink-0" onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none' }} />
                      )}
                      <span className="text-xs truncate flex-1" style={{ color: '#5a2020' }}>{fighter.collection_name}</span>
                      {fighter.floor_price_sats !== null && <span className="text-xs font-black flex-shrink-0" style={{ color: '#22c55e' }}>{formatFloor(fighter.floor_price_sats)}</span>}
                    </div>
                  ) : (
                    <div className="text-xs mt-0.5" style={{ color: '#4a1515' }}>#{fighter.inscription_number.toLocaleString()}</div>
                  )}
                  {fighter.sat_rarity && fighter.sat_rarity !== 'common' && (
                    <div className="text-xs font-bold mt-0.5" style={{ color: '#f5d060' }}>✦ {fighter.sat_rarity}</div>
                  )}
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-4 py-2 font-black text-sm uppercase tracking-widest transition-all disabled:opacity-30" style={{ borderRadius: 4, background: 'rgba(185,28,28,0.12)', color: '#cc2200', border: '1px solid rgba(185,28,28,0.25)' }}>← Prev</button>
          <span className="text-sm font-black" style={{ color: '#4a1515' }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-4 py-2 font-black text-sm uppercase tracking-widest transition-all disabled:opacity-30" style={{ borderRadius: 4, background: 'rgba(185,28,28,0.12)', color: '#cc2200', border: '1px solid rgba(185,28,28,0.25)' }}>Next →</button>
        </div>
      )}

      {/* PSBT modal */}
      {showPsbt && selected && address && (
        <PsbtModal
          fighter={selected}
          address={address}
          publicKey={publicKey ?? ''}
          onSigned={handlePsbtSigned}
          onCancel={() => setShowPsbt(false)}
        />
      )}
    </div>
  )
}
