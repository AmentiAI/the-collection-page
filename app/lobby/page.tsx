'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLaserEyes } from '@omnisat/lasereyes'
import Header from '@/components/Header'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Fighter {
  id: string
  inscriptionNumber: number
  name: string
  contentUrl?: string
  contentType?: string
  utxoValue: number  // sat value of the UTXO (330, 546, etc.) — used for matchmaking
  hp: number
  atk: number
  def: number
  spd: number
  rarity: 'Legendary' | 'Epic' | 'Rare' | 'Uncommon'
  element: 'fire' | 'shadow' | 'lightning' | 'ice' | 'void' | 'gold'
  special: string
  specialDesc: string
  glowColor: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveStats(inscriptionNumber: number): Omit<Fighter, 'id' | 'name' | 'contentUrl' | 'contentType' | 'inscriptionNumber' | 'utxoValue'> {
  // Guard against undefined/null/NaN/negative values from Ordiscan
  const s = Math.abs(Math.floor(Number(inscriptionNumber) || 0))
  const hp = 70 + (s % 50)
  const atk = 60 + ((s * 3) % 40)
  const def = 55 + ((s * 7) % 40)
  const spd = 60 + ((s * 11) % 40)
  const rarities: Fighter['rarity'][] = ['Legendary', 'Epic', 'Rare', 'Uncommon']
  const rarity = rarities[s % rarities.length]
  const elements: Fighter['element'][] = ['fire', 'shadow', 'lightning', 'ice', 'void', 'gold']
  const element = elements[(s * 3) % elements.length]
  const specials = [
    ['Death Strike', 'Deal 40 damage to opponent'],
    ['Chain Blast', 'Hit for 30, reduce enemy DEF'],
    ['Diamond Hands', 'Block + restore 20 HP'],
    ['LN Strike', 'Always attacks first'],
    ['Cold Storage', 'Freeze opponent 1 turn'],
    ['SHA-256', 'Random damage 20–60'],
  ]
  const [special, specialDesc] = specials[(s * 5) % specials.length]
  const glows = ['#a855f7', '#f97316', '#f59e0b', '#06b6d4', '#38bdf8', '#10b981']
  const glowColor = glows[s % glows.length]
  return { hp, atk, def, spd, rarity, element, special, specialDesc, glowColor }
}

function enrichedToFighter(enriched: any): Fighter {
  const stats = deriveStats(enriched.inscription_number)
  const name =
    enriched.meta_name ||
    (enriched.collection_name ? `${enriched.collection_name} #${enriched.inscription_number.toLocaleString()}` : null) ||
    `#${enriched.inscription_number.toLocaleString()}`
  return {
    id: enriched.inscription_id,
    inscriptionNumber: enriched.inscription_number,
    name,
    contentUrl: enriched.content_url,
    contentType: enriched.content_type ?? undefined,
    utxoValue: enriched.output_value ?? 330,
    ...stats,
  }
}


const RARITY_COLORS: Record<Fighter['rarity'], string> = {
  Legendary: '#f59e0b',
  Epic: '#a855f7',
  Rare: '#3b82f6',
  Uncommon: '#22c55e',
}

const ELEMENT_ICONS: Record<Fighter['element'], string> = {
  fire: '🔥', shadow: '🌑', lightning: '⚡', ice: '❄️', void: '🕳️', gold: '✨',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FighterArt({ fighter, size = 'md', flip }: { fighter: Fighter; size?: 'sm' | 'md' | 'lg'; flip?: boolean }) {
  const [err, setErr] = useState(false)
  const dim = { sm: 'w-24 h-24', md: 'w-36 h-36', lg: 'w-48 h-48' }[size]
  const isHtml = fighter.contentType?.startsWith('text/html') || fighter.contentType === 'application/xhtml+xml'
  const isImage = fighter.contentType?.startsWith('image/')

  const flipStyle = flip ? 'scaleX(-1)' : undefined

  if (isHtml && fighter.contentUrl) {
    return (
      <iframe
        src={fighter.contentUrl}
        className={`${dim} rounded-xl`}
        style={{ border: 'none', pointerEvents: 'none', filter: `drop-shadow(0 0 12px ${fighter.glowColor})`, transform: flipStyle }}
        sandbox="allow-scripts allow-same-origin"
        scrolling="no"
        loading="lazy"
      />
    )
  }

  if (!err && isImage && fighter.contentUrl) {
    return (
      <img
        src={fighter.contentUrl}
        alt={fighter.name}
        className={`${dim} object-contain rounded-xl`}
        style={{ filter: `drop-shadow(0 0 12px ${fighter.glowColor})`, transform: flipStyle }}
        onError={() => setErr(true)}
      />
    )
  }

  return (
    <div
      className={`${dim} rounded-xl flex flex-col items-center justify-center`}
      style={{ background: `${fighter.glowColor}20`, border: `2px solid ${fighter.glowColor}50` }}
    >
      <span className="text-sm font-black uppercase" style={{ color: fighter.glowColor }}>ORD</span>
      <span className="font-black text-base" style={{ color: '#e8eef7' }}>#{fighter.inscriptionNumber.toLocaleString()}</span>
    </div>
  )
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-widest w-9 font-black" style={{ color: '#4a1515' }}>{label}</span>
      <div className="flex-1 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="text-sm font-black w-8 text-right" style={{ color }}>{value}</span>
    </div>
  )
}

function FighterCard({ fighter, label, flip }: { fighter: Fighter; label: string; flip?: boolean }) {
  const rarityColor = RARITY_COLORS[fighter.rarity]
  return (
    <div className={`flex flex-col ${flip ? 'items-end' : 'items-start'} gap-3 w-full`}>
      <div
        className="text-xs tracking-widest uppercase font-black px-3 py-1 rounded"
        style={{ background: 'rgba(185,28,28,0.2)', color: '#cc2200' }}
      >
        {label}
      </div>
      <div
        className="w-full rounded-2xl p-6 flex flex-col gap-4"
        style={{
          background: `linear-gradient(135deg, ${fighter.glowColor}12, #050202)`,
          border: `1px solid ${fighter.glowColor}33`,
          boxShadow: `0 0 24px ${fighter.glowColor}18`,
        }}
      >
        <div className={`flex items-center gap-5 ${flip ? 'flex-row-reverse' : ''}`}>
          <FighterArt fighter={fighter} size="lg" />
          <div className={flip ? 'text-right' : ''}>
            <div className="font-black text-2xl leading-tight" style={{ color: '#e8eef7' }}>{fighter.name}</div>
            <div className="text-sm mt-1" style={{ color: '#4a1515' }}>#{fighter.inscriptionNumber.toLocaleString()}</div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-xs font-black px-2 py-1 rounded" style={{ background: `${rarityColor}20`, color: rarityColor }}>{fighter.rarity}</span>
              <span>{ELEMENT_ICONS[fighter.element]}</span>
            </div>
            <div className="text-sm mt-1.5 font-bold" style={{ color: fighter.glowColor }}>⚡ {fighter.special}</div>
          </div>
        </div>
        <div className="space-y-2.5">
          <StatRow label="HP" value={fighter.hp} color="#22c55e" />
          <StatRow label="ATK" value={fighter.atk} color={fighter.glowColor} />
          <StatRow label="DEF" value={fighter.def} color={fighter.glowColor} />
          <StatRow label="SPD" value={fighter.spd} color={fighter.glowColor} />
        </div>
      </div>
    </div>
  )
}

function OpponentSkeleton() {
  return (
    <div className="w-full rounded-2xl p-6 flex flex-col gap-3" style={{ background: '#0a0202', border: '1px solid rgba(185,28,28,0.08)' }}>
      <div className="flex items-center gap-4">
        <div className="w-36 h-36 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: '#120808' }}>
          <span className="text-2xl opacity-20 animate-spin" style={{ animationDuration: '3s' }}>⚙️</span>
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-5 rounded animate-pulse" style={{ background: '#1a0808', width: '70%' }} />
          <div className="h-4 rounded animate-pulse" style={{ background: '#1a0808', width: '45%' }} />
          <div className="text-sm uppercase tracking-widest mt-1" style={{ color: '#2d0a0a' }}>Scanning for opponents…</div>
        </div>
      </div>
      <div className="space-y-1.5">
        {['HP', 'ATK', 'DEF', 'SPD'].map((l) => (
          <div key={l} className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest w-7 font-black" style={{ color: '#2d0a0a' }}>{l}</span>
            <div className="flex-1 h-1.5 rounded-full animate-pulse" style={{ background: '#1a0808' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function LobbyPage() {
  const router = useRouter()
  const { address } = useLaserEyes()

  const [myFighter, setMyFighter] = useState<Fighter | null>(null)
  const [opponent, setOpponent] = useState<Fighter | null>(null)
  const [phase, setPhase] = useState<'connecting' | 'searching' | 'found' | 'error'>('connecting')
  const [waitSeconds, setWaitSeconds] = useState(0)
  const [countdown, setCountdown] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const [dots, setDots] = useState('.')
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)

  const queueIdRef = useRef<string | null>(null)
  const joinedRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (waitTimerRef.current) { clearInterval(waitTimerRef.current); waitTimerRef.current = null }
  }

  const handleMatched = useCallback((oppFighter: Fighter) => {
    stopPolling()
    setOpponent(oppFighter)
    setPhase('found')
  }, [])

  const poll = useCallback(async () => {
    const queueId = queueIdRef.current
    const playerId = address
    if (!queueId || !playerId || cancelledRef.current) return
    try {
      const res = await fetch(`/api/matchmaking/status?queue_id=${queueId}&player_id=${encodeURIComponent(playerId)}`)
      const data = await res.json()
      if (data.status === 'matched' && data.opponent) {
        handleMatched(data.opponent as Fighter)
      } else if (data.status === 'completed') {
        stopPolling()
        router.push('/battle')
      } else if (data.status === 'cancelled' || !res.ok) {
        stopPolling()
        setError(data.error ?? `Match cancelled (status: ${data.status ?? res.status})`)
        setPhase('error')
      }
    } catch (e) {
      // network blip — keep polling but log it
      console.warn('[lobby poll error]', e)
    }
  }, [handleMatched, address])

  // Blinking dots animation
  useEffect(() => {
    if (phase !== 'searching') return
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '.' : d + '.')), 400)
    return () => clearInterval(t)
  }, [phase])

  // Re-bind poll when address becomes available
  useEffect(() => {
    if (phase !== 'searching' || !queueIdRef.current) return
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = setInterval(poll, 2000)
    }
  }, [poll, phase])

  // Main effect: runs when wallet address is known
  useEffect(() => {
    if (!address) return          // wait for wallet to connect
    if (joinedRef.current) return // already ran
    joinedRef.current = true
    cancelledRef.current = false

    ;(async () => {
      try {
        // Always check DB first — wallet address is the source of truth
        let playerData: any = {}
        try {
          const playerRes = await fetch(`/api/matchmaking/player?player_id=${encodeURIComponent(address)}`)
          playerData = await playerRes.json()
          if (!playerRes.ok) throw new Error(`Player lookup failed (${playerRes.status}): ${playerData.error ?? 'unknown'}`)
        } catch (e) {
          throw new Error(`Could not reach matchmaking API — ${e instanceof Error ? e.message : e}`)
        }

        if (playerData.found) {
          // Completed battle — send to battle page to show result
          if (playerData.status === 'completed') {
            router.push('/battle')
            return
          }
          // Resume from DB — fighter_data is already stored there
          setMyFighter(playerData.fighter_data as Fighter)
          queueIdRef.current = playerData.queue_id
          if (playerData.status === 'matched' && playerData.opponent) {
            handleMatched(playerData.opponent as Fighter)
          } else {
            setPhase('searching')
            waitTimerRef.current = setInterval(() => setWaitSeconds((s) => s + 1), 1000)
            pollRef.current = setInterval(poll, 2000)
          }
          return
        }

        // No active DB entry — need fighter from sessionStorage
        const enrichedRaw = sessionStorage.getItem('fighter_data')
        if (!enrichedRaw) {
          throw new Error('Fighter data missing from session — go back and select your fighter again')
        }

        let fighter: Fighter
        try {
          fighter = enrichedToFighter(JSON.parse(enrichedRaw))
        } catch (e) {
          sessionStorage.removeItem('fighter_data')
          sessionStorage.removeItem('fighter_signed_psbt')
          sessionStorage.removeItem('fighter_inscription_id')
          throw new Error(`Could not parse fighter data — ${e instanceof Error ? e.message : e}. Go back and select your fighter again.`)
        }

        setMyFighter(fighter)

        const signedPsbt = sessionStorage.getItem('fighter_signed_psbt')
        if (!signedPsbt) {
          throw new Error('Signed PSBT missing from session — go back and sign with your wallet again')
        }

        let data: any
        try {
          const res = await fetch('/api/matchmaking/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: address, fighter_data: fighter, signed_psbt: signedPsbt }),
          })
          data = await res.json()
          if (!res.ok) throw new Error(`Join failed (${res.status}): ${data.error ?? 'unknown error'}`)
        } catch (e) {
          throw new Error(`Could not join matchmaking — ${e instanceof Error ? e.message : e}`)
        }

        if (cancelledRef.current) return

        queueIdRef.current = data.queue_id

        if (data.matched && data.opponent) {
          handleMatched(data.opponent as Fighter)
        } else {
          setPhase('searching')
          waitTimerRef.current = setInterval(() => setWaitSeconds((s) => s + 1), 1000)
          pollRef.current = setInterval(poll, 2000)
        }
      } catch (e) {
        console.error('[lobby] join error:', e)
        if (!cancelledRef.current) {
          setError(e instanceof Error ? e.message : String(e))
          setPhase('error')
        }
      }
    })()

    return () => {
      cancelledRef.current = true
      stopPolling()
    }
  }, [address, handleMatched, poll, router])

  // Re-bind poll when it updates
  useEffect(() => {
    if (phase !== 'searching' || !queueIdRef.current) return
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = setInterval(poll, 2000)
    }
  }, [poll, phase])

  // Countdown after match found → go to battle
  useEffect(() => {
    if (phase !== 'found') return
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); router.push('/battle'); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase, router])

  const headerEl = (
    <Header
      isHolder={isHolder}
      isVerifying={isVerifying}
      connected={connected}
      onHolderVerified={(h) => { setIsHolder(h); setIsVerifying(false) }}
      onVerifyingStart={() => setIsVerifying(true)}
      onConnectedChange={setConnected}
      showMusicControls={true}
    />
  )

  // ── Shared page shell ──────────────────────────────────────────────────────
  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#080205' }}>
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(180,0,0,0.2) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,0,0,0.012) 40px)' }} />
      </div>
      <div className="relative" style={{ zIndex: 1 }}>{headerEl}</div>
      <div className="relative" style={{ zIndex: 1 }}>{children}</div>
    </div>
  )

  const GlassPanel = ({ children, accent = 'red' }: { children: React.ReactNode; accent?: 'red' | 'green' }) => {
    const shine = accent === 'green'
      ? 'linear-gradient(90deg, transparent, rgba(34,197,94,0.4) 30%, rgba(100,255,140,0.6) 50%, rgba(34,197,94,0.4) 70%, transparent)'
      : 'linear-gradient(90deg, transparent, rgba(255,80,0,0.55) 30%, rgba(255,160,80,0.7) 50%, rgba(255,80,0,0.55) 70%, transparent)'
    const border = accent === 'green' ? 'rgba(34,197,94,0.25)' : 'rgba(200,30,0,0.28)'
    const bg = accent === 'green'
      ? 'linear-gradient(160deg, rgba(0,60,20,0.2) 0%, rgba(2,7,3,0.96) 65%)'
      : 'linear-gradient(160deg, rgba(110,5,5,0.22) 0%, rgba(7,1,4,0.96) 65%)'
    return (
      <div className="relative overflow-hidden" style={{ borderRadius: 6 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: shine, zIndex: 2 }} />
        <div style={{ position: 'absolute', top: 0, left: '18%', width: '30%', height: 44, background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)', borderRadius: '0 0 50% 50%', zIndex: 1 }} />
        <div style={{ border: `1px solid ${border}`, borderRadius: 6, background: bg, backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    )
  }

  // Error check MUST come before the !myFighter check — errors can occur before fighter is set
  if (phase === 'error') {
    return (
      <PageShell>
        <div className="flex items-center justify-center min-h-[70vh] px-4">
          <div className="w-full max-w-lg flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <div style={{ width: 3, height: 32, background: 'linear-gradient(180deg, #ff2200, #660000)', borderRadius: 2 }} />
              <div className="text-3xl font-black uppercase tracking-widest" style={{ color: '#cc2200', textShadow: '0 0 30px rgba(185,28,28,0.5)' }}>Error</div>
            </div>
            <GlassPanel>
              <div className="px-5 py-4 text-sm leading-relaxed font-mono break-words" style={{ color: '#f87171' }}>
                {error ?? 'Unknown error'}
              </div>
            </GlassPanel>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { joinedRef.current = false; cancelledRef.current = false; setError(null); setPhase('connecting') }}
                className="flex-1 relative overflow-hidden px-6 py-4 font-black text-sm tracking-widest uppercase transition-opacity hover:opacity-80"
                style={{ borderRadius: 4, background: 'linear-gradient(135deg, rgba(185,28,28,0.2), rgba(100,10,10,0.1))', border: '1px solid rgba(185,28,28,0.4)', color: '#cc2200' }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,80,0,0.5), transparent)' }} />
                Retry
              </button>
              <button
                onClick={() => router.push('/?battle=1')}
                className="flex-1 px-6 py-4 font-black text-sm tracking-widest uppercase transition-opacity hover:opacity-70"
                style={{ borderRadius: 4, background: 'rgba(255,255,255,0.02)', color: '#4a1515', border: '1px solid rgba(185,28,28,0.15)' }}
              >
                ← Back to Select
              </button>
            </div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (phase === 'connecting' || !myFighter) {
    return (
      <PageShell>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="text-base font-black uppercase tracking-widest" style={{ color: '#4a1515' }}>
              {!address ? 'Connect your wallet to continue' : 'Loading match…'}
            </div>
            {address && <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#cc2200' }} />}
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-8 px-4 py-10">

        {/* Status header */}
        <div className="text-center w-full">
          <div className="flex items-center justify-center gap-3 mb-1">
            <div style={{ width: 3, height: 32, background: 'linear-gradient(180deg, #ff2200, #660000)', borderRadius: 2 }} />
            {phase === 'found' ? (
              <div className="text-3xl sm:text-5xl font-black uppercase tracking-widest" style={{ color: '#22c55e', textShadow: '0 0 30px rgba(34,197,94,0.5)' }}>
                Opponent Found ⚔️
              </div>
            ) : (
              <div className="text-3xl sm:text-5xl font-black uppercase tracking-widest" style={{ color: '#fff', textShadow: '0 0 40px rgba(255,40,0,0.4)' }}>
                Matchmaking{dots}
              </div>
            )}
            <div style={{ width: 3, height: 32, background: 'linear-gradient(180deg, #ff2200, #660000)', borderRadius: 2 }} />
          </div>
          <div className="text-sm font-bold uppercase tracking-widest" style={{ color: '#4a1515' }}>
            {phase === 'found'
              ? `Battle starts in ${countdown}…`
              : `Waiting for a ${myFighter.utxoValue}-sat challenger — ${waitSeconds}s`}
          </div>
        </div>

        {/* VS layout */}
        <div className="w-full flex items-start justify-between gap-4 sm:gap-6">
          {/* My fighter */}
          <div className="flex-1">
            <GlassPanel>
              <div className="p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div style={{ width: 6, height: 6, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 6px #ff2200' }} />
                  <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#7a2020' }}>You</span>
                </div>
                <div className="flex justify-center">
                  <FighterArt fighter={myFighter} size="md" />
                </div>
                <div className="font-black text-lg text-center leading-tight" style={{ color: '#e8eef7' }}>{myFighter.name}</div>
                <div className="space-y-2">
                  <StatRow label="HP"  value={myFighter.hp}  color="#22c55e" />
                  <StatRow label="ATK" value={myFighter.atk} color={myFighter.glowColor} />
                  <StatRow label="DEF" value={myFighter.def} color={myFighter.glowColor} />
                  <StatRow label="SPD" value={myFighter.spd} color={myFighter.glowColor} />
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-4 pt-14 flex-shrink-0">
            <div className="text-5xl sm:text-7xl font-black" style={{ color: '#cc2200', textShadow: '0 0 40px rgba(185,28,28,0.9)' }}>VS</div>
            {phase === 'searching' && (
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#cc2200' }} />
                <div className="absolute inset-1.5 rounded-full border-2 border-transparent animate-spin" style={{ borderBottomColor: '#7f1d1d', animationDirection: 'reverse', animationDuration: '1.5s' }} />
              </div>
            )}
          </div>

          {/* Opponent */}
          <div className="flex-1">
            {phase === 'searching' ? (
              <GlassPanel>
                <div className="p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#7a2020' }}>Opponent</span>
                    <div style={{ width: 6, height: 6, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 6px #ff2200' }} />
                  </div>
                  <div className="flex justify-center">
                    <div className="w-36 h-36 rounded-lg flex items-center justify-center" style={{ background: '#0a0202' }}>
                      <span className="text-3xl opacity-20 animate-spin" style={{ animationDuration: '3s' }}>⚙️</span>
                    </div>
                  </div>
                  <div className="h-5 rounded animate-pulse mx-4" style={{ background: '#1a0808' }} />
                  <div className="space-y-1.5 mt-1">
                    {['HP','ATK','DEF','SPD'].map(l => (
                      <div key={l} className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-widest w-9 font-black" style={{ color: '#2d0a0a' }}>{l}</span>
                        <div className="flex-1 h-1.5 rounded-full animate-pulse" style={{ background: '#1a0808' }} />
                      </div>
                    ))}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-center font-black" style={{ color: '#2d0a0a' }}>Scanning for opponent…</div>
                </div>
              </GlassPanel>
            ) : opponent ? (
              <GlassPanel>
                <div className="p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#7a2020' }}>Opponent</span>
                    <div style={{ width: 6, height: 6, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 6px #ff2200' }} />
                  </div>
                  <div className="flex justify-center">
                    <FighterArt fighter={opponent} size="md" flip />
                  </div>
                  <div className="font-black text-lg text-center leading-tight" style={{ color: '#e8eef7' }}>{opponent.name}</div>
                  <div className="space-y-2">
                    <StatRow label="HP"  value={opponent.hp}  color="#22c55e" />
                    <StatRow label="ATK" value={opponent.atk} color={opponent.glowColor} />
                    <StatRow label="DEF" value={opponent.def} color={opponent.glowColor} />
                    <StatRow label="SPD" value={opponent.spd} color={opponent.glowColor} />
                  </div>
                </div>
              </GlassPanel>
            ) : null}
          </div>
        </div>

        {/* Cancel button */}
        {phase === 'searching' && (
          <button
            onClick={() => {
              const queueId = queueIdRef.current
              if (queueId) {
                fetch('/api/matchmaking/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queue_id: queueId }) }).catch(() => {})
              }
              router.push('/?battle=1')
            }}
            className="text-sm tracking-widest uppercase font-bold px-6 py-3 transition-opacity hover:opacity-60"
            style={{ borderRadius: 4, color: '#4a1515', border: '1px solid rgba(185,28,28,0.12)' }}
          >
            Cancel Search
          </button>
        )}
      </div>
    </PageShell>
  )
}
