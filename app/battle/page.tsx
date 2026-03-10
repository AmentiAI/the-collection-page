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

interface BattleResult {
  winner_address: string
  loser_address: string
  winner_num: number
  tx1_txid: string
  tx2_txid: string
  completed_at: string
}

function FighterArt({ fighter, flip }: { fighter: Fighter; flip?: boolean }) {
  const [err, setErr] = useState(false)
  const isImage = fighter.contentType?.startsWith('image/')
  const isHtml = fighter.contentType?.startsWith('text/html') || fighter.contentType === 'application/xhtml+xml'

  if (isHtml && fighter.contentUrl) {
    return (
      <iframe
        src={fighter.contentUrl}
        className="w-44 h-44 lg:w-64 lg:h-64 rounded-xl"
        style={{
          border: 'none',
          pointerEvents: 'none',
          filter: `drop-shadow(0 0 20px ${fighter.glowColor})`,
          transform: flip ? 'scaleX(-1)' : undefined,
        }}
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
        className="w-44 h-44 lg:w-64 lg:h-64 object-contain rounded-xl"
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
      className="w-44 h-44 lg:w-64 lg:h-64 rounded-xl flex flex-col items-center justify-center"
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
      <span className="text-xs uppercase tracking-widest w-9 font-black" style={{ color: '#4a1515' }}>{label}</span>
      <div className="flex-1 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="text-sm font-black w-8 text-right" style={{ color }}>{value}</span>
    </div>
  )
}

export default function BattlePage() {
  const router = useRouter()
  const { address } = useLaserEyes()
  const [me, setMe] = useState<Fighter | null>(null)
  const [opp, setOpp] = useState<Fighter | null>(null)
  const [queueId, setQueueId] = useState<string | null>(null)
  const [oppPlayerId, setOppPlayerId] = useState<string | null>(null)
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!address) return
    fetch(`/api/matchmaking/player?player_id=${encodeURIComponent(address)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.found) {
          router.push('/?battle=1')
          return
        }
        if (data.status === 'completed' && data.battle_result) {
          setMe(data.fighter_data as Fighter)
          setBattleResult(data.battle_result as BattleResult)
          setQueueId(data.queue_id)
          setLoading(false)
          return
        }
        if (data.status !== 'matched' || !data.opponent) {
          router.push('/?battle=1')
          return
        }
        setMe(data.fighter_data as Fighter)
        setOpp(data.opponent as Fighter)
        setQueueId(data.queue_id)
        setOppPlayerId(data.opponent_player_id ?? null)
        setLoading(false)
      })
      .catch(() => router.push('/?battle=1'))
  }, [address, router])

  const iWon = battleResult && address && battleResult.winner_address.toLowerCase() === address.toLowerCase()

  return (
    <div className="h-screen overflow-hidden flex flex-col relative" style={{ background: '#030101' }}>
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
        <div className="flex-1 flex items-center justify-center">
          <div className="text-lg font-black uppercase tracking-widest" style={{ color: '#4a1515' }}>Connect your wallet to view battle</div>
        </div>
      )}

      {address && loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#cc2200' }} />
        </div>
      )}

      {/* ── Completed battle result screen ── */}
      {battleResult && me && (
        <div className="relative flex-1 flex flex-col items-center justify-center px-4 pb-4">
          <div className="absolute inset-0 pointer-events-none" style={{
            background: iWon
              ? 'radial-gradient(ellipse at 50% 0%, rgba(234,179,8,0.18) 0%, transparent 60%)'
              : 'radial-gradient(ellipse at 50% 0%, rgba(185,28,28,0.15) 0%, transparent 60%)',
          }} />
          <div className="relative z-10 w-full max-w-lg flex flex-col items-center gap-6 text-center">
            <div>
              <div
                className="text-5xl lg:text-7xl font-black uppercase tracking-widest"
                style={{
                  color: iWon ? '#eab308' : '#cc2200',
                  textShadow: iWon
                    ? '0 0 40px rgba(234,179,8,0.7)'
                    : '0 0 40px rgba(185,28,28,0.7)',
                }}
              >
                {iWon ? '👑 Victory!' : '💀 Defeated'}
              </div>
              <div className="text-sm uppercase tracking-widest mt-3 font-bold" style={{ color: '#4a1515' }}>
                {iWon ? 'Your inscription has been sacrificed — you claimed the spoils' : 'Your inscription has been sacrificed — better luck next time'}
              </div>
            </div>

            <FighterArt fighter={me} />
            <div className="font-black text-2xl" style={{ color: '#e8eef7' }}>{me.name}</div>

            <div className="w-full rounded-xl px-5 py-4 flex flex-col gap-2 text-xs font-mono" style={{ background: 'rgba(185,28,28,0.06)', border: '1px solid rgba(185,28,28,0.15)' }}>
              <div className="flex justify-between">
                <span style={{ color: '#4a1515' }}>Winner TX</span>
                <a
                  href={`https://mempool.space/tx/${battleResult.tx1_txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: '#cc2200' }}
                >
                  {battleResult.tx1_txid.slice(0, 12)}…{battleResult.tx1_txid.slice(-8)}
                </a>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#4a1515' }}>Loser TX</span>
                <a
                  href={`https://mempool.space/tx/${battleResult.tx2_txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: '#cc2200' }}
                >
                  {battleResult.tx2_txid.slice(0, 12)}…{battleResult.tx2_txid.slice(-8)}
                </a>
              </div>
            </div>

            <button
              onClick={async () => {
                // Clear the completed entry so lobby doesn't loop back here
                if (queueId) {
                  await fetch('/api/matchmaking/clear-result', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ queue_id: queueId }),
                  }).catch(() => {})
                }
                router.push('/?battle=1')
              }}
              className="text-base tracking-widest uppercase font-black px-8 py-4 rounded-xl transition-opacity hover:opacity-80"
              style={{
                background: iWon ? 'rgba(234,179,8,0.15)' : 'rgba(185,28,28,0.15)',
                border: `1px solid ${iWon ? 'rgba(234,179,8,0.4)' : 'rgba(185,28,28,0.4)'}`,
                color: iWon ? '#eab308' : '#cc2200',
              }}
            >
              ⚔️ Fight Again
            </button>
          </div>
        </div>
      )}

      {/* ── Pre-battle matchup screen ── */}
      {me && opp && !battleResult && (
        <div className="relative flex-1 flex flex-col items-center justify-start px-4 pt-6 pb-4">
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(185,28,28,0.15) 0%, transparent 60%)',
          }} />
          <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-8">
            <div className="text-center">
              <div className="text-4xl lg:text-6xl font-black uppercase tracking-widest" style={{ color: '#cc2200', textShadow: '0 0 30px rgba(185,28,28,0.6)' }}>
                ⚔️ Battle ⚔️
              </div>
              <div className="text-sm uppercase tracking-widest mt-2 font-bold" style={{ color: '#4a1515' }}>
                Match Found — Awaiting Execution
              </div>
            </div>

            <div className="w-full flex items-center justify-between gap-4 sm:gap-8">
              <div className="flex-1 flex flex-col items-center gap-3">
                <div className="text-xs tracking-widest uppercase font-black px-3 py-1 rounded" style={{ background: 'rgba(185,28,28,0.2)', color: '#cc2200' }}>You</div>
                <FighterArt fighter={me} />
                <div className="font-black text-xl text-center" style={{ color: '#e8eef7' }}>{me.name}</div>
                <div className="w-full space-y-3">
                  <StatBar label="HP" value={me.hp} color="#22c55e" />
                  <StatBar label="ATK" value={me.atk} color={me.glowColor} />
                  <StatBar label="DEF" value={me.def} color={me.glowColor} />
                  <StatBar label="SPD" value={me.spd} color={me.glowColor} />
                </div>
              </div>

              <div className="flex-shrink-0 text-6xl lg:text-8xl font-black" style={{ color: '#cc2200', textShadow: '0 0 40px rgba(185,28,28,0.9)' }}>
                VS
              </div>

              <div className="flex-1 flex flex-col items-center gap-3">
                <div className="text-xs tracking-widest uppercase font-black px-3 py-1 rounded" style={{ background: 'rgba(185,28,28,0.2)', color: '#cc2200' }}>Opponent</div>
                <FighterArt fighter={opp} flip />
                <div className="font-black text-xl text-center" style={{ color: '#e8eef7' }}>{opp.name}</div>
                <div className="w-full space-y-3">
                  <StatBar label="HP" value={opp.hp} color="#22c55e" />
                  <StatBar label="ATK" value={opp.atk} color={opp.glowColor} />
                  <StatBar label="DEF" value={opp.def} color={opp.glowColor} />
                  <StatBar label="SPD" value={opp.spd} color={opp.glowColor} />
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push('/?battle=1')}
              className="text-sm tracking-widest uppercase font-bold px-6 py-3 rounded transition-opacity hover:opacity-70"
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
