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
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(2)}M sats`
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}k sats`
  return `${sats} sats`
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
  const sizeClass = { sm: 'w-12 h-12 lg:w-16 lg:h-16', md: 'w-20 h-20 lg:w-32 lg:h-32', lg: 'w-36 h-36 lg:w-48 lg:h-48' }[size]
  const isImage = fighter.content_type?.startsWith('image/')

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: '#0d0509',
          border: '1px solid rgba(185,28,28,0.4)',
          boxShadow: '0 0 60px rgba(185,28,28,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fighter preview */}
        <div className="flex items-center gap-4 mb-5">
          <InscriptionArt fighter={fighter} size="sm" />
          <div>
            <div className="font-black text-sm text-red-100">{displayName(fighter)}</div>
            {fighter.collection_name && (
              <div className="text-xs text-red-700 mt-0.5">{fighter.collection_name}</div>
            )}
            {fighter.floor_price_sats !== null && (
              <div className="text-xs text-green-600 font-bold mt-0.5">
                Floor {formatFloor(fighter.floor_price_sats)}
              </div>
            )}
          </div>
        </div>

        <div className="mb-5">
          <div className="text-base font-black text-red-100 mb-1">Commit to Battle</div>
          <p className="text-xs text-red-900 leading-relaxed">
            Sign a PSBT that commits this inscription as your fighter. This proves ownership
            on-chain — it will not move or broadcast your ordinal.
          </p>
        </div>

        {/* UTXO info */}
        {fighter.output && (
          <div
            className="rounded-lg px-3 py-2 mb-4 font-mono text-xs"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(185,28,28,0.15)' }}
          >
            <div className="flex justify-between text-red-900 mb-1">
              <span>UTXO</span>
              <span className="text-red-700">
                {fighter.output.slice(0, 8)}…{fighter.output.slice(-6)}
              </span>
            </div>
            <div className="flex justify-between text-red-900">
              <span>Value</span>
              <span className="text-red-700">{fighter.output_value?.toLocaleString() ?? '—'} sats</span>
            </div>
          </div>
        )}

        {/* Step progress */}
        <div className="flex items-center gap-2 mb-5">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                style={{
                  background:
                    i < stepIdx ? '#b91c1c' : i === stepIdx ? 'rgba(185,28,28,0.4)' : 'rgba(255,255,255,0.05)',
                  color: i <= stepIdx ? '#fff' : '#4a1515',
                }}
              >
                {i < stepIdx ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className="w-6 h-px"
                  style={{ background: i < stepIdx ? '#b91c1c' : 'rgba(255,255,255,0.08)' }}
                />
              )}
            </div>
          ))}
          <span className="ml-2 text-xs text-red-900">
            {step === 'idle' && 'Ready'}
            {step === 'building' && 'Building…'}
            {step === 'signing' && 'Awaiting wallet…'}
            {step === 'done' && 'Signed!'}
            {step === 'error' && 'Error'}
          </span>
        </div>

        {error && (
          <div
            className="rounded-lg px-3 py-2 mb-4 text-xs text-red-400"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest text-red-800 border border-red-900/30 hover:border-red-800/50 transition-colors"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            Cancel
          </button>
          <button
            onClick={step === 'error' ? handleSign : step === 'idle' ? handleSign : undefined}
            disabled={step === 'building' || step === 'signing' || step === 'done'}
            className="flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest text-white transition-all"
            style={{
              background: step === 'done' ? '#166534' : 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
              opacity: step === 'building' || step === 'signing' ? 0.6 : 1,
              boxShadow: '0 0 20px rgba(185,28,28,0.3)',
            }}
          >
            {step === 'idle' && '⚔️ Sign & Fight'}
            {step === 'building' && 'Building…'}
            {step === 'signing' && 'Sign in Wallet'}
            {step === 'done' && '✓ Committed'}
            {step === 'error' && 'Retry'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FighterSelect({ disabled }: { disabled?: boolean }) {
  const router = useRouter()
  const { connected, address, publicKey } = useLaserEyes()

  const [fighters, setFighters] = useState<WalletFighter[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

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
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="text-4xl opacity-30">💀</div>
        <div className="text-red-900 text-sm font-bold uppercase tracking-widest">
          Connect your wallet to choose a fighter
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full relative ${disabled ? 'pointer-events-none' : ''}`}>
      {/* Disabled overlay */}
      {disabled && (
        <div
          className="absolute inset-0 z-20 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(3,1,1,0.7)', backdropFilter: 'blur(2px)' }}
        >
          <div className="text-center px-6">
            <div className="text-xs font-black uppercase tracking-widest" style={{ color: '#4a1515' }}>
              Fighter already in queue — return to lobby or cancel before selecting a new one
            </div>
          </div>
        </div>
      )}
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2
            className="text-lg lg:text-2xl font-black uppercase tracking-widest"
            style={{ color: '#cc2200' }}
          >
            ⚔️ Choose Your Fighter
          </h2>
          <p className="text-xs lg:text-sm text-red-900 mt-0.5">
            {loading
              ? 'Scanning your inscriptions…'
              : fighters.length > 0
              ? `${fighters.length} inscriptions — ${filtered.length} shown`
              : 'No inscriptions found'}
          </p>
        </div>
        {signedPsbt && selected && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black"
            style={{ background: 'rgba(22,101,52,0.2)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80' }}
          >
            ✓ {displayName(selected)} committed
          </div>
        )}
      </div>

      {/* Filter bar */}
      {!loading && fighters.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl mb-4"
          style={{ background: 'rgba(120,10,10,0.08)', border: '1px solid rgba(185,28,28,0.12)' }}
        >
          {/* Floor filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs lg:text-sm font-black uppercase tracking-widest text-red-900">Floor</span>
            <div className="flex gap-1">
              {FLOOR_FILTERS.map((f) => (
                <button
                  key={f.max}
                  onClick={() => setMaxFloor(f.max)}
                  className="px-2 lg:px-3 py-0.5 lg:py-1 rounded text-xs lg:text-sm font-bold transition-all"
                  style={{
                    background: maxFloor === f.max ? '#991b1b' : 'rgba(255,255,255,0.03)',
                    color: maxFloor === f.max ? '#fca5a5' : '#7f1d1d',
                    border: `1px solid ${maxFloor === f.max ? '#b91c1c50' : 'rgba(185,28,28,0.12)'}`,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {collections.length > 0 && (
            <>
              <div className="w-px h-4 bg-red-950" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs lg:text-sm font-black uppercase tracking-widest text-red-900">Collection</span>
                <select
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                  className="text-xs lg:text-sm rounded px-2 lg:px-3 py-0.5 lg:py-1 font-bold outline-none"
                  style={{
                    background: '#0d0509',
                    border: '1px solid rgba(185,28,28,0.2)',
                    color: '#7f1d1d',
                  }}
                >
                  <option value="all">All</option>
                  {collections.map(([slug, name]) => (
                    <option key={slug} value={slug}>{name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <label className="flex items-center gap-1.5 cursor-pointer ml-auto lg:gap-2">
            <div
              className="w-7 h-3.5 lg:w-10 lg:h-5 rounded-full relative transition-all cursor-pointer"
              style={{ background: onlyCollections ? '#991b1b' : 'rgba(185,28,28,0.15)' }}
              onClick={() => setOnlyCollections((v) => !v)}
            >
              <div
                className="absolute top-0.5 lg:top-0.5 w-2.5 h-2.5 lg:w-4 lg:h-4 rounded-full bg-white transition-all"
                style={{ left: onlyCollections ? 'calc(100% - 12px)' : '2px' }}
              />
            </div>
            <span className="text-xs lg:text-sm font-bold text-red-900">Known only</span>
          </label>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-3">
          <div
            className="w-5 h-5 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: '#b91c1c' }}
          />
          <span className="text-red-900 text-xs uppercase tracking-widest font-bold">
            Summoning inscriptions…
          </span>
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="text-xs text-red-500">{loadError}</div>
          <button
            onClick={fetchFighters}
            className="text-xs font-black uppercase tracking-widest text-red-800 underline hover:text-red-600"
          >
            Retry
          </button>
        </div>
      )}

      {/* No results */}
      {!loading && !loadError && fighters.length > 0 && filtered.length === 0 && (
        <div className="py-8 text-center text-red-900 text-xs">
          No inscriptions match the current filters.
        </div>
      )}

      {/* Grid */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
          {filtered.map((fighter) => {
            const isSelected = selected?.inscription_id === fighter.inscription_id
            const isSigned = signedPsbt && selected?.inscription_id === fighter.inscription_id

            return (
              <button
                key={fighter.inscription_id}
                onClick={() => {
                  setSelected(fighter)
                  if (isSigned) return
                }}
                className="relative rounded-xl text-left overflow-hidden transition-all"
                style={{
                  background: isSelected
                    ? 'rgba(185,28,28,0.15)'
                    : 'rgba(120,10,10,0.06)',
                  border: `1px solid ${isSelected ? 'rgba(185,28,28,0.5)' : 'rgba(185,28,28,0.12)'}`,
                  boxShadow: isSelected ? '0 0 20px rgba(185,28,28,0.2)' : 'none',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                {/* Signed badge */}
                {isSigned && (
                  <div
                    className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                    style={{ background: '#166534', color: '#4ade80' }}
                  >
                    ✓
                  </div>
                )}

                {/* Art */}
                <div
                  className="flex items-center justify-center py-4 lg:py-6"
                  style={{ background: 'rgba(0,0,0,0.3)' }}
                >
                  <InscriptionArt fighter={fighter} size="md" />
                </div>

                {/* Info */}
                <div className="p-2 lg:p-3">
                  <div className="text-xs lg:text-sm font-black text-red-200 truncate leading-tight">
                    {displayName(fighter)}
                  </div>

                  {fighter.collection_name ? (
                    <div className="flex items-center gap-1 mt-1">
                      {fighter.collection_image && (
                        <img
                          src={fighter.collection_image}
                          alt=""
                          className="w-3 h-3 lg:w-4 lg:h-4 rounded-full object-cover flex-shrink-0"
                          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      )}
                      <span className="text-[10px] lg:text-xs text-red-800 truncate flex-1">{fighter.collection_name}</span>
                      {fighter.floor_price_sats !== null && (
                        <span className="text-[10px] lg:text-xs font-black text-green-700 flex-shrink-0">
                          {formatFloor(fighter.floor_price_sats)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] lg:text-xs text-red-900 mt-0.5">
                      #{fighter.inscription_number.toLocaleString()}
                    </div>
                  )}

                  {fighter.sat_rarity && fighter.sat_rarity !== 'common' && (
                    <div className="text-[10px] lg:text-xs text-yellow-700 font-bold mt-0.5">
                      ✦ {fighter.sat_rarity}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Selected detail + commit CTA */}
      {selected && !showPsbt && (
        <div
          className="mt-4 flex items-center gap-4 lg:gap-6 px-4 lg:px-6 py-3 lg:py-4 rounded-xl"
          style={{
            background: 'rgba(120,10,10,0.1)',
            border: '1px solid rgba(185,28,28,0.25)',
          }}
        >
          <InscriptionArt fighter={selected} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm lg:text-lg font-black text-red-200 truncate">{displayName(selected)}</div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {selected.collection_name && (
                <span className="text-xs lg:text-sm text-red-800">{selected.collection_name}</span>
              )}
              {selected.floor_price_sats !== null && (
                <span className="text-xs lg:text-sm font-bold text-green-700">
                  Floor {formatFloor(selected.floor_price_sats)}
                </span>
              )}
              {selected.sat_rarity && selected.sat_rarity !== 'common' && (
                <span className="text-[10px] lg:text-xs text-yellow-700 font-bold">✦ {selected.sat_rarity}</span>
              )}
            </div>
          </div>
          {signedPsbt ? (
            <div className="text-xs font-black text-green-600 flex-shrink-0">✓ Committed</div>
          ) : (
            <button
              onClick={() => setShowPsbt(true)}
              className="flex-shrink-0 px-4 lg:px-6 py-2 lg:py-3 rounded-lg text-xs lg:text-sm font-black uppercase tracking-widest text-white transition-all"
              style={{
                background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
                boxShadow: '0 0 16px rgba(185,28,28,0.4)',
              }}
            >
              ⚔️ Fight with This
            </button>
          )}
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
