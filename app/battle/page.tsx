'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLaserEyes } from '@omnisat/lasereyes'
import Header from '@/components/Header'

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
  const { address } = useLaserEyes()
  const [me, setMe] = useState<Fighter | null>(null)
  const [opp, setOpp] = useState<Fighter | null>(null)
  const [loading, setLoading] = useState(true)
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!address) return
    fetch(`/api/matchmaking/player?player_id=${encodeURIComponent(address)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.found || data.status !== 'matched' || !data.opponent) {
          router.push('/?battle=1')
          return
        }
        setMe(data.fighter_data as Fighter)
        setOpp(data.opponent as Fighter)
        setLoading(false)
      })
      .catch(() => router.push('/?battle=1'))
  }, [address, router])

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#030101' }}>
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={connected}
        onHolderVerified={(h) => { setIsHolder(h); setIsVerifying(false) }}
        onVerifyingStart={() => setIsVerifying(true)}
        onConnectedChange={setConnected}
        showMusicControls={true}
      />

      {!address && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-sm font-black uppercase tracking-widest" style={{ color: '#4a1515' }}>Connect your wallet to view battle</div>
        </div>
      )}

      {address && (loading || !me || !opp) && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#cc2200' }} />
        </div>
      )}

      {me && opp && (
        <div
          className="relative flex flex-col items-center justify-center px-4 py-12"
          style={{ minHeight: 'calc(100vh - 80px)' }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(185,28,28,0.15) 0%, transparent 60%)',
          }} />
          <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-8">
            <div className="text-center">
              <div className="text-2xl lg:text-4xl font-black uppercase tracking-widest" style={{ color: '#cc2200', textShadow: '0 0 30px rgba(185,28,28,0.6)' }}>
                ⚔️ Battle ⚔️
              </div>
              <div className="text-xs uppercase tracking-widest mt-1 font-bold" style={{ color: '#4a1515' }}>
                Coming Soon — Match Recorded
              </div>
            </div>

            <div className="w-full flex items-center justify-between gap-4 sm:gap-8">
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

              <div className="flex-shrink-0 text-4xl lg:text-6xl font-black" style={{ color: '#cc2200', textShadow: '0 0 40px rgba(185,28,28,0.9)' }}>
                VS
              </div>

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

            <button
              onClick={() => router.push('/?battle=1')}
              className="text-xs tracking-widest uppercase font-bold px-4 py-2 rounded transition-opacity hover:opacity-70"
              style={{ color: '#4a1515', border: '1px solid rgba(185,28,28,0.12)' }}
            >
              ← Fight Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
