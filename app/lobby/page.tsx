'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLaserEyes } from '@omnisat/lasereyes'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Fighter {
  id: string
  inscriptionNumber: number
  name: string
  contentUrl?: string
  contentType?: string
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

function deriveStats(inscriptionNumber: number): Omit<Fighter, 'id' | 'name' | 'contentUrl' | 'contentType' | 'inscriptionNumber'> {
  const s = inscriptionNumber
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

function FighterArt({ fighter, size = 'md' }: { fighter: Fighter; size?: 'sm' | 'md' | 'lg' }) {
  const [err, setErr] = useState(false)
  const dim = { sm: 'w-16 h-16', md: 'w-24 h-24', lg: 'w-36 h-36' }[size]
  const isImage = fighter.contentType?.startsWith('image/')
  if (!err && isImage && fighter.contentUrl) {
    return (
      <img
        src={fighter.contentUrl}
        alt={fighter.name}
        className={`${dim} object-contain rounded-xl`}
        style={{ filter: `drop-shadow(0 0 12px ${fighter.glowColor})` }}
        onError={() => setErr(true)}
      />
    )
  }
  return (
    <div
      className={`${dim} rounded-xl flex flex-col items-center justify-center`}
      style={{ background: `${fighter.glowColor}20`, border: `2px solid ${fighter.glowColor}50` }}
    >
      <span className="text-xs font-black uppercase" style={{ color: fighter.glowColor }}>ORD</span>
      <span className="font-black text-sm" style={{ color: '#e8eef7' }}>#{fighter.inscriptionNumber.toLocaleString()}</span>
    </div>
  )
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest w-7 font-black" style={{ color: '#4a1515' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-black w-6 text-right" style={{ color }}>{value}</span>
    </div>
  )
}

function FighterCard({ fighter, label, flip }: { fighter: Fighter; label: string; flip?: boolean }) {
  const rarityColor = RARITY_COLORS[fighter.rarity]
  return (
    <div className={`flex flex-col ${flip ? 'items-end' : 'items-start'} gap-3 w-full`}>
      <div
        className="text-[10px] tracking-widest uppercase font-black px-2 py-0.5 rounded"
        style={{ background: 'rgba(185,28,28,0.2)', color: '#cc2200' }}
      >
        {label}
      </div>
      <div
        className="w-full rounded-2xl p-4 flex flex-col gap-3"
        style={{
          background: `linear-gradient(135deg, ${fighter.glowColor}12, #050202)`,
          border: `1px solid ${fighter.glowColor}33`,
          boxShadow: `0 0 24px ${fighter.glowColor}18`,
        }}
      >
        <div className={`flex items-center gap-4 ${flip ? 'flex-row-reverse' : ''}`}>
          <FighterArt fighter={fighter} size="md" />
          <div className={flip ? 'text-right' : ''}>
            <div className="font-black text-base leading-tight" style={{ color: '#e8eef7' }}>{fighter.name}</div>
            <div className="text-[10px] mt-0.5" style={{ color: '#4a1515' }}>#{fighter.inscriptionNumber.toLocaleString()}</div>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: `${rarityColor}20`, color: rarityColor }}>{fighter.rarity}</span>
              <span className="text-[10px]">{ELEMENT_ICONS[fighter.element]}</span>
            </div>
            <div className="text-xs mt-1 font-bold" style={{ color: fighter.glowColor }}>⚡ {fighter.special}</div>
          </div>
        </div>
        <div className="space-y-1.5">
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
    <div className="w-full rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#0a0202', border: '1px solid rgba(185,28,28,0.08)' }}>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: '#120808' }}>
          <span className="text-2xl opacity-20 animate-spin" style={{ animationDuration: '3s' }}>⚙️</span>
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-4 rounded animate-pulse" style={{ background: '#1a0808', width: '70%' }} />
          <div className="h-3 rounded animate-pulse" style={{ background: '#1a0808', width: '45%' }} />
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: '#2d0a0a' }}>Scanning for opponents…</div>
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
      } else if (data.status === 'cancelled' || !res.ok) {
        stopPolling()
        setError(data.error ?? 'Match was cancelled')
        setPhase('error')
      }
    } catch {
      // network blip — keep polling
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
        const playerRes = await fetch(`/api/matchmaking/player?player_id=${encodeURIComponent(address)}`)
        const playerData = await playerRes.json()

        if (playerData.found) {
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

        // No active DB entry — fresh join, need fighter from sessionStorage
        const enrichedRaw = sessionStorage.getItem('fighter_data')
        if (!enrichedRaw) { router.push('/'); return }

        let fighter: Fighter
        try {
          fighter = enrichedToFighter(JSON.parse(enrichedRaw))
        } catch {
          router.push('/')
          return
        }

        setMyFighter(fighter)

        const signedPsbt = sessionStorage.getItem('fighter_signed_psbt')
        const res = await fetch('/api/matchmaking/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: address, fighter_data: fighter, signed_psbt: signedPsbt }),
        })
        if (!res.ok) throw new Error(`Join failed (${res.status})`)
        const data = await res.json()
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
        if (!cancelledRef.current) {
          setError(e instanceof Error ? e.message : 'Failed to join matchmaking')
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

  if (phase === 'connecting' || !myFighter) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#030101' }}>
        <div className="text-center">
          <div className="text-sm font-black uppercase tracking-widest mb-2" style={{ color: '#4a1515' }}>
            {!address ? 'Connect your wallet to continue' : 'Loading match…'}
          </div>
          {address && (
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#cc2200' }} />
          )}
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#030101' }}>
        <div className="text-center px-6">
          <div className="text-3xl font-black uppercase tracking-widest mb-3" style={{ color: '#cc2200' }}>Connection Error</div>
          <div className="text-sm mb-6" style={{ color: '#4a1515' }}>{error}</div>
          <button
            onClick={() => router.push('/?battle=1')}
            className="px-6 py-3 font-black text-sm tracking-widest uppercase"
            style={{ background: 'rgba(185,28,28,0.15)', color: '#cc2200', border: '1px solid rgba(185,28,28,0.3)', borderRadius: 4 }}
          >
            ← Back to Select
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-4 py-12" style={{ background: '#030101' }}>
      {/* Blood drip bg */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(185,28,28,0.12) 0%, transparent 60%)',
      }} />

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-8">

        {/* Status header */}
        <div className="text-center">
          {phase === 'found' ? (
            <div className="text-xl font-black uppercase tracking-widest" style={{ color: '#22c55e', textShadow: '0 0 20px rgba(34,197,94,0.5)' }}>
              Opponent Found ⚔️
            </div>
          ) : (
            <div className="text-xl font-black uppercase tracking-widest" style={{ color: '#cc2200', textShadow: '0 0 20px rgba(185,28,28,0.5)' }}>
              Finding Opponent<span style={{ color: '#cc2200' }}>{dots}</span>
            </div>
          )}
          <div className="text-sm mt-2 font-bold" style={{ color: '#4a1515' }}>
            {phase === 'found'
              ? `Battle starts in ${countdown}…`
              : `Waiting for a challenger — ${waitSeconds}s`}
          </div>
        </div>

        {/* VS layout */}
        <div className="w-full flex items-center justify-between gap-4 sm:gap-8">
          {/* My fighter */}
          <div className="flex-1">
            <FighterCard fighter={myFighter} label="You" />
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-3 flex-shrink-0">
            <div
              className="text-3xl sm:text-5xl font-black"
              style={{ color: '#cc2200', textShadow: '0 0 30px rgba(185,28,28,0.8)' }}
            >
              VS
            </div>
            {phase === 'searching' && (
              <div className="relative w-10 h-10">
                <div
                  className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                  style={{ borderTopColor: '#cc2200' }}
                />
                <div
                  className="absolute inset-1 rounded-full border-2 border-transparent animate-spin"
                  style={{ borderBottomColor: '#7f1d1d', animationDirection: 'reverse', animationDuration: '1.5s' }}
                />
              </div>
            )}
          </div>

          {/* Opponent */}
          <div className="flex-1">
            {phase === 'searching'
              ? <OpponentSkeleton />
              : opponent && <FighterCard fighter={opponent} label="Opponent" flip />
            }
          </div>
        </div>

        {/* Stats comparison when matched */}
        {phase === 'found' && opponent && (
          <div className="flex gap-6 sm:gap-10 text-center">
            {[
              { label: 'Your HP', val: myFighter.hp, color: '#22c55e' },
              { label: 'Your ATK', val: myFighter.atk, color: '#f97316' },
              { label: '', val: null, color: '' },
              { label: 'Opp HP', val: opponent.hp, color: '#22c55e' },
              { label: 'Opp ATK', val: opponent.atk, color: '#ef4444' },
            ].map((s, i) =>
              s.val !== null ? (
                <div key={i} className="flex flex-col">
                  <span className="text-xl sm:text-2xl font-black" style={{ color: s.color }}>{s.val}</span>
                  <span className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: '#4a1515' }}>{s.label}</span>
                </div>
              ) : <div key={i} className="w-4" />
            )}
          </div>
        )}

        {/* Cancel while searching */}
        {phase === 'searching' && (
          <button
            onClick={() => {
              const queueId = queueIdRef.current
              if (queueId) {
                fetch('/api/matchmaking/cancel', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ queue_id: queueId }),
                }).catch(() => {})
              }
              router.push('/?battle=1')
            }}
            className="text-xs tracking-widest uppercase font-bold px-4 py-2 rounded transition-opacity hover:opacity-70"
            style={{ color: '#4a1515', border: '1px solid rgba(185,28,28,0.12)' }}
          >
            Cancel Search
          </button>
        )}
      </div>
    </div>
  )
}
