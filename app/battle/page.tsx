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

function GlassPanel({ children, accent = 'red' }: { children: React.ReactNode; accent?: 'red' | 'gold' | 'green' }) {
  const colors: Record<string, { shine: string; border: string; bg: string }> = {
    red:   { shine: 'linear-gradient(90deg, transparent, rgba(255,80,0,0.55) 30%, rgba(255,160,80,0.7) 50%, rgba(255,80,0,0.55) 70%, transparent)', border: 'rgba(200,30,0,0.3)', bg: 'linear-gradient(160deg, rgba(110,5,5,0.22) 0%, rgba(7,1,4,0.96) 65%)' },
    gold:  { shine: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.5) 30%, rgba(255,220,80,0.7) 50%, rgba(234,179,8,0.5) 70%, transparent)', border: 'rgba(234,179,8,0.3)', bg: 'linear-gradient(160deg, rgba(80,60,0,0.22) 0%, rgba(7,5,0,0.96) 65%)' },
    green: { shine: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.4) 30%, rgba(100,255,140,0.6) 50%, rgba(34,197,94,0.4) 70%, transparent)', border: 'rgba(34,197,94,0.25)', bg: 'linear-gradient(160deg, rgba(0,60,20,0.2) 0%, rgba(2,7,3,0.96) 65%)' },
  }
  const c = colors[accent]
  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 6 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: c.shine, zIndex: 2 }} />
      <div style={{ position: 'absolute', top: 0, left: '20%', width: '28%', height: 44, background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)', borderRadius: '0 0 50% 50%', zIndex: 1 }} />
      <div style={{ border: `1px solid ${c.border}`, borderTop: `1px solid ${c.border}`, borderRadius: 6, background: c.bg, backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function FighterArt({ fighter, flip, size = 'md' }: { fighter: Fighter; flip?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const [err, setErr] = useState(false)
  const dim = { sm: 'w-28 h-28', md: 'w-40 h-40 lg:w-52 lg:h-52', lg: 'w-48 h-48 lg:w-64 lg:h-64' }[size]
  const isImage = fighter.contentType?.startsWith('image/')
  const isHtml = fighter.contentType?.startsWith('text/html') || fighter.contentType === 'application/xhtml+xml'
  const style = { filter: `drop-shadow(0 0 24px ${fighter.glowColor})`, transform: flip ? 'scaleX(-1)' : undefined }

  if (isHtml && fighter.contentUrl) return <iframe src={fighter.contentUrl} className={`${dim} rounded-lg`} style={{ border: 'none', pointerEvents: 'none', ...style }} sandbox="allow-scripts allow-same-origin" scrolling="no" loading="lazy" />
  if (!err && isImage && fighter.contentUrl) return <img src={fighter.contentUrl} alt={fighter.name} className={`${dim} object-contain rounded-lg`} style={style} onError={() => setErr(true)} />
  return (
    <div className={`${dim} rounded-lg flex flex-col items-center justify-center`} style={{ background: `${fighter.glowColor}20`, border: `2px solid ${fighter.glowColor}40` }}>
      <span className="text-xs font-black uppercase" style={{ color: fighter.glowColor }}>ORD</span>
      <span className="font-black text-sm" style={{ color: '#e8eef7' }}>#{fighter.inscriptionNumber?.toLocaleString()}</span>
    </div>
  )
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-widest w-9 font-black" style={{ color: '#4a1515' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(value, 100)}%`, background: color, boxShadow: `0 0 6px ${color}80` }} />
      </div>
      <span className="text-sm font-black w-8 text-right tabular-nums" style={{ color }}>{value}</span>
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
        if (!data.found) { router.push('/?battle=1'); return }
        if (data.status === 'completed' && data.battle_result) {
          setMe(data.fighter_data as Fighter)
          setBattleResult(data.battle_result as BattleResult)
          setQueueId(data.queue_id)
          setLoading(false)
          return
        }
        if (data.status !== 'matched' || !data.opponent) { router.push('/?battle=1'); return }
        setMe(data.fighter_data as Fighter)
        setOpp(data.opponent as Fighter)
        setQueueId(data.queue_id)
        setOppPlayerId(data.opponent_player_id ?? null)
        setLoading(false)
      })
      .catch(() => router.push('/?battle=1'))
  }, [address, router])

  const iWon = battleResult && address && battleResult.winner_address.toLowerCase() === address.toLowerCase()

  const headerEl = (
    <Header isHolder={isHolder} isVerifying={isVerifying} connected={connected}
      onHolderVerified={(h) => { setIsHolder(h); setIsVerifying(false) }}
      onVerifyingStart={() => setIsVerifying(true)}
      onConnectedChange={setConnected}
      showMusicControls={true}
    />
  )

  return (
    <div className="h-screen overflow-hidden flex flex-col relative" style={{ background: '#080205' }}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(180,0,0,0.2) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,0,0,0.012) 40px)' }} />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
        {headerEl}
      </div>

      {!address && (
        <div className="flex-1 flex items-center justify-center relative" style={{ zIndex: 1 }}>
          <div className="text-base font-black uppercase tracking-widest" style={{ color: '#4a1515' }}>Connect your wallet to view battle</div>
        </div>
      )}

      {address && loading && (
        <div className="flex-1 flex items-center justify-center relative" style={{ zIndex: 1 }}>
          <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#cc2200' }} />
        </div>
      )}

      {/* ── Completed battle result ── */}
      {battleResult && me && (
        <div className="relative flex-1 flex flex-col items-center justify-center px-4 pb-4 overflow-y-auto" style={{ zIndex: 1 }}>
          {/* Result glow */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: iWon
              ? 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(234,179,8,0.16) 0%, transparent 65%)'
              : 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(185,28,28,0.14) 0%, transparent 65%)',
          }} />

          <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-5 text-center">
            {/* Result title */}
            <div>
              <div className="text-5xl lg:text-7xl font-black uppercase tracking-widest" style={{
                color: iWon ? '#eab308' : '#cc2200',
                textShadow: iWon ? '0 0 50px rgba(234,179,8,0.65)' : '0 0 50px rgba(185,28,28,0.65)',
              }}>
                {iWon ? '👑 Victory' : '💀 Defeated'}
              </div>
              <div className="text-sm uppercase tracking-widest mt-2 font-bold" style={{ color: '#4a1515' }}>
                {iWon ? 'Your inscription was sacrificed — you claimed the spoils' : 'Your inscription was sacrificed — better luck next time'}
              </div>
            </div>

            <FighterArt fighter={me} size="md" />
            <div className="font-black text-xl" style={{ color: '#e8eef7' }}>{me.name}</div>

            {/* TX links */}
            <GlassPanel accent={iWon ? 'gold' : 'red'}>
              <div className="px-5 py-4 flex flex-col gap-2 w-full min-w-[320px]">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#4a1515' }}>Winner TX</span>
                  <a href={`https://mempool.space/tx/${battleResult.tx1_txid}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline" style={{ color: '#cc2200' }}>
                    {battleResult.tx1_txid.slice(0, 14)}…{battleResult.tx1_txid.slice(-8)}
                  </a>
                </div>
                <div style={{ height: 1, background: 'rgba(180,20,0,0.15)' }} />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#4a1515' }}>Loser TX</span>
                  <a href={`https://mempool.space/tx/${battleResult.tx2_txid}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline" style={{ color: '#cc2200' }}>
                    {battleResult.tx2_txid.slice(0, 14)}…{battleResult.tx2_txid.slice(-8)}
                  </a>
                </div>
              </div>
            </GlassPanel>

            <button
              onClick={async () => {
                if (queueId) {
                  await fetch('/api/matchmaking/clear-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queue_id: queueId }) }).catch(() => {})
                }
                router.push('/?battle=1')
              }}
              className="relative overflow-hidden px-10 py-4 font-black text-base tracking-widest uppercase transition-opacity hover:opacity-80"
              style={{
                borderRadius: 4,
                background: iWon ? 'linear-gradient(135deg, rgba(234,179,8,0.18), rgba(180,130,0,0.08))' : 'linear-gradient(135deg, rgba(185,28,28,0.2), rgba(100,10,10,0.1))',
                border: `1px solid ${iWon ? 'rgba(234,179,8,0.4)' : 'rgba(185,28,28,0.4)'}`,
                color: iWon ? '#eab308' : '#cc2200',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: iWon ? 'linear-gradient(90deg, transparent, rgba(234,179,8,0.6), transparent)' : 'linear-gradient(90deg, transparent, rgba(255,80,0,0.5), transparent)' }} />
              ⚔️ Fight Again
            </button>
          </div>
        </div>
      )}

      {/* ── Pre-battle matchup ── */}
      {me && opp && !battleResult && (
        <div className="relative flex-1 flex flex-col items-center justify-start px-4 pt-6 pb-4 overflow-y-auto" style={{ zIndex: 1 }}>
          <div className="w-full max-w-5xl flex flex-col items-center gap-6">

            {/* Title */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-3 mb-1">
                <div style={{ width: 3, height: 28, background: 'linear-gradient(180deg, #ff2200, #660000)', borderRadius: 2 }} />
                <div className="text-4xl lg:text-6xl font-black uppercase tracking-widest" style={{ color: '#fff', textShadow: '0 0 40px rgba(255,40,0,0.5)' }}>Battle</div>
                <div style={{ width: 3, height: 28, background: 'linear-gradient(180deg, #ff2200, #660000)', borderRadius: 2 }} />
              </div>
              <div className="text-sm uppercase tracking-widest font-bold" style={{ color: '#4a1515' }}>Match Found — Awaiting Execution</div>
            </div>

            {/* VS layout */}
            <div className="w-full flex items-start justify-between gap-4 sm:gap-6">
              {/* My fighter */}
              <div className="flex-1">
                <GlassPanel accent="red">
                  <div className="p-5 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <div style={{ width: 6, height: 6, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 6px #ff2200' }} />
                      <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#7a2020' }}>You</span>
                    </div>
                    <div className="flex justify-center">
                      <FighterArt fighter={me} size="md" />
                    </div>
                    <div className="font-black text-lg leading-tight text-center" style={{ color: '#e8eef7' }}>{me.name}</div>
                    <div className="space-y-2">
                      <StatBar label="HP"  value={me.hp}  color="#22c55e" />
                      <StatBar label="ATK" value={me.atk} color={me.glowColor} />
                      <StatBar label="DEF" value={me.def} color={me.glowColor} />
                      <StatBar label="SPD" value={me.spd} color={me.glowColor} />
                    </div>
                  </div>
                </GlassPanel>
              </div>

              {/* VS */}
              <div className="flex flex-col items-center gap-2 pt-16 flex-shrink-0">
                <div className="text-5xl lg:text-7xl font-black" style={{ color: '#cc2200', textShadow: '0 0 40px rgba(185,28,28,0.9)', letterSpacing: '-0.02em' }}>VS</div>
              </div>

              {/* Opponent */}
              <div className="flex-1">
                <GlassPanel accent="red">
                  <div className="p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#7a2020' }}>Opponent</span>
                      <div style={{ width: 6, height: 6, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 6px #ff2200' }} />
                    </div>
                    <div className="flex justify-center">
                      <FighterArt fighter={opp} flip size="md" />
                    </div>
                    <div className="font-black text-lg leading-tight text-center" style={{ color: '#e8eef7' }}>{opp.name}</div>
                    <div className="space-y-2">
                      <StatBar label="HP"  value={opp.hp}  color="#22c55e" />
                      <StatBar label="ATK" value={opp.atk} color={opp.glowColor} />
                      <StatBar label="DEF" value={opp.def} color={opp.glowColor} />
                      <StatBar label="SPD" value={opp.spd} color={opp.glowColor} />
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </div>

            <button
              onClick={() => router.push('/?battle=1')}
              className="text-sm tracking-widest uppercase font-bold px-6 py-3 transition-opacity hover:opacity-60"
              style={{ color: '#4a1515', border: '1px solid rgba(185,28,28,0.12)', borderRadius: 4 }}
            >
              ← Fight Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
