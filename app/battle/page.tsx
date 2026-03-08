'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Fighter {
  id: string
  inscriptionNumber: number
  name: string
  contentUrl?: string
  contentType?: string
  hp: number
  atk: number
  def: number
  spd: number
  rarity: string
  element: string
  special: string
  specialDesc: string
  glowColor: string
}

function FighterArt({ fighter, flip }: { fighter: Fighter; flip?: boolean }) {
  const [err, setErr] = useState(false)
  const isImage = fighter.contentType?.startsWith('image/')
  if (!err && isImage && fighter.contentUrl) {
    return (
      <img
        src={fighter.contentUrl}
        alt={fighter.name}
        className="w-32 h-32 lg:w-48 lg:h-48 object-contain rounded-xl"
        style={{
          filter: `drop-shadow(0 0 20px ${fighter.glowColor})`,
          transform: flip ? 'scaleX(-1)' : undefined,
        }}
        onError={() => setErr(true)}
      />
    )
  }
  return (
    <div
      className="w-32 h-32 lg:w-48 lg:h-48 rounded-xl flex flex-col items-center justify-center"
      style={{ background: `${fighter.glowColor}20`, border: `2px solid ${fighter.glowColor}50` }}
    >
      <span className="text-xs font-black uppercase" style={{ color: fighter.glowColor }}>ORD</span>
      <span className="font-black text-sm" style={{ color: '#e8eef7' }}>#{fighter.inscriptionNumber?.toLocaleString()}</span>
    </div>
  )
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest w-7 font-black" style={{ color: '#4a1515' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-black w-6 text-right" style={{ color }}>{value}</span>
    </div>
  )
}

export default function BattlePage() {
  const router = useRouter()
  const [me, setMe] = useState<Fighter | null>(null)
  const [opp, setOpp] = useState<Fighter | null>(null)

  useEffect(() => {
    try {
      const meRaw = sessionStorage.getItem('fighter_data')
      const oppRaw = sessionStorage.getItem('opponent')
      if (!meRaw || !oppRaw) { router.push('/'); return }
      // fighter_data is the enriched inscription object; convert to Fighter shape using stored opponent
      setMe(JSON.parse(oppRaw)) // opponent is already Fighter shape from lobby
      setOpp(JSON.parse(oppRaw))
      // actually me is stored as enriched, let's just re-derive from lobby's opponent key
      // The lobby stores opponent as Fighter already, me we need to re-enrich
    } catch {
      router.push('/')
    }
  }, [router])

  useEffect(() => {
    try {
      const oppRaw = sessionStorage.getItem('opponent')
      const meEnrichedRaw = sessionStorage.getItem('fighter_data')
      if (!oppRaw || !meEnrichedRaw) return

      const opponent = JSON.parse(oppRaw) as Fighter
      // Derive me from enriched data (same logic as lobby)
      const enriched = JSON.parse(meEnrichedRaw)
      const s = enriched.inscription_number as number
      const rarities = ['Legendary', 'Epic', 'Rare', 'Uncommon'] as const
      const elements = ['fire', 'shadow', 'lightning', 'ice', 'void', 'gold'] as const
      const specials = [
        ['Death Strike', 'Deal 40 damage to opponent'],
        ['Chain Blast', 'Hit for 30, reduce enemy DEF'],
        ['Diamond Hands', 'Block + restore 20 HP'],
        ['LN Strike', 'Always attacks first'],
        ['Cold Storage', 'Freeze opponent 1 turn'],
        ['SHA-256', 'Random damage 20–60'],
      ]
      const glows = ['#a855f7', '#f97316', '#f59e0b', '#06b6d4', '#38bdf8', '#10b981']
      const [special, specialDesc] = specials[(s * 5) % specials.length]
      const myFighter: Fighter = {
        id: enriched.inscription_id,
        inscriptionNumber: s,
        name: enriched.meta_name || (enriched.collection_name ? `${enriched.collection_name} #${s.toLocaleString()}` : `#${s.toLocaleString()}`),
        contentUrl: enriched.content_url,
        contentType: enriched.content_type,
        hp: 70 + (s % 50),
        atk: 60 + ((s * 3) % 40),
        def: 55 + ((s * 7) % 40),
        spd: 60 + ((s * 11) % 40),
        rarity: rarities[s % rarities.length],
        element: elements[(s * 3) % elements.length],
        special,
        specialDesc,
        glowColor: glows[s % glows.length],
      }
      setMe(myFighter)
      setOpp(opponent)
    } catch {
      router.push('/')
    }
  }, [router])

  if (!me || !opp) return null

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: '#030101' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(185,28,28,0.15) 0%, transparent 60%)',
      }} />

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-8">

        {/* Title */}
        <div className="text-center">
          <div className="text-2xl lg:text-4xl font-black uppercase tracking-widest" style={{ color: '#cc2200', textShadow: '0 0 30px rgba(185,28,28,0.6)' }}>
            ⚔️ Battle ⚔️
          </div>
          <div className="text-xs uppercase tracking-widest mt-1 font-bold" style={{ color: '#4a1515' }}>
            Coming Soon — Match Recorded
          </div>
        </div>

        {/* VS layout */}
        <div className="w-full flex items-center justify-between gap-4 sm:gap-8">
          {/* Me */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <div className="text-[10px] tracking-widest uppercase font-black px-2 py-0.5 rounded" style={{ background: 'rgba(185,28,28,0.2)', color: '#cc2200' }}>You</div>
            <FighterArt fighter={me} />
            <div className="font-black text-sm text-center" style={{ color: '#e8eef7' }}>{me.name}</div>
            <div className="w-full space-y-1.5">
              <StatBar label="HP" value={me.hp} color="#22c55e" />
              <StatBar label="ATK" value={me.atk} color={me.glowColor} />
              <StatBar label="DEF" value={me.def} color={me.glowColor} />
              <StatBar label="SPD" value={me.spd} color={me.glowColor} />
            </div>
          </div>

          {/* VS */}
          <div className="flex-shrink-0 text-4xl lg:text-6xl font-black" style={{ color: '#cc2200', textShadow: '0 0 40px rgba(185,28,28,0.9)' }}>
            VS
          </div>

          {/* Opponent */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <div className="text-[10px] tracking-widest uppercase font-black px-2 py-0.5 rounded" style={{ background: 'rgba(185,28,28,0.2)', color: '#cc2200' }}>Opponent</div>
            <FighterArt fighter={opp} flip />
            <div className="font-black text-sm text-center" style={{ color: '#e8eef7' }}>{opp.name}</div>
            <div className="w-full space-y-1.5">
              <StatBar label="HP" value={opp.hp} color="#22c55e" />
              <StatBar label="ATK" value={opp.atk} color={opp.glowColor} />
              <StatBar label="DEF" value={opp.def} color={opp.glowColor} />
              <StatBar label="SPD" value={opp.spd} color={opp.glowColor} />
            </div>
          </div>
        </div>

        {/* Back */}
        <button
          onClick={() => {
            sessionStorage.removeItem('opponent')
            sessionStorage.removeItem('matchmaking_queue_id')
            router.push('/?battle=1')
          }}
          className="text-xs tracking-widest uppercase font-bold px-4 py-2 rounded transition-opacity hover:opacity-70"
          style={{ color: '#4a1515', border: '1px solid rgba(185,28,28,0.12)' }}
        >
          ← Fight Again
        </button>
      </div>
    </div>
  )
}
