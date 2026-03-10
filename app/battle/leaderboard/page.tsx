'use client'

import { useState, useEffect } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import Header from '@/components/Header'

interface BattleLeader {
  wallet_address: string
  wins: number
  losses: number
  win_pct: number
}

interface MyStats {
  wallet_address: string
  wins: number
  losses: number
  win_pct: number
  rank: number
}

const TOP3: Record<number, { color: string; glow: string; bg: string; border: string }> = {
  0: { color: '#ff4400', glow: 'rgba(255,68,0,0.55)', bg: 'linear-gradient(90deg, rgba(255,68,0,0.16) 0%, rgba(255,68,0,0.03) 70%, transparent 100%)', border: 'rgba(255,68,0,0.3)' },
  1: { color: '#c0c0c0', glow: 'rgba(192,192,192,0.4)', bg: 'linear-gradient(90deg, rgba(192,192,192,0.09) 0%, rgba(192,192,192,0.01) 70%, transparent 100%)', border: 'rgba(192,192,192,0.18)' },
  2: { color: '#cd7f32', glow: 'rgba(205,127,50,0.4)', bg: 'linear-gradient(90deg, rgba(205,127,50,0.09) 0%, rgba(205,127,50,0.01) 70%, transparent 100%)', border: 'rgba(205,127,50,0.18)' },
}

function GlassPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ borderRadius: 6 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(255,80,0,0.55) 30%, rgba(255,180,100,0.75) 50%, rgba(255,80,0,0.55) 70%, transparent 100%)', zIndex: 2 }} />
      <div style={{ position: 'absolute', top: 0, left: '15%', width: '35%', height: 50, background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)', borderRadius: '0 0 50% 50%', zIndex: 1 }} />
      <div style={{ border: '1px solid rgba(200,30,0,0.28)', borderTop: '1px solid rgba(255,70,0,0.45)', borderRadius: 6, background: 'linear-gradient(160deg, rgba(110,5,5,0.22) 0%, rgba(7,1,4,0.96) 65%)', backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

export default function BattleLeaderboardPage() {
  const { address } = useLaserEyes()
  const [leaders, setLeaders] = useState<BattleLeader[]>([])
  const [myStats, setMyStats] = useState<MyStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = address
      ? `/api/battle/leaderboard?limit=200&wallet=${encodeURIComponent(address)}`
      : '/api/battle/leaderboard?limit=200'
    fetch(url)
      .then(r => r.json())
      .then(d => { if (d.success) { setLeaders(d.leaders ?? []); setMyStats(d.myStats ?? null) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  const fmt = (w: string) => `${w.slice(0, 8)}…${w.slice(-6)}`

  return (
    <div className="min-h-screen text-white" style={{ background: '#080205' }}>
      <Header showMusicControls={true} />

      {/* Page background */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(180,0,0,0.2) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,0,0,0.012) 40px)' }} />
      </div>

      <div className="relative container mx-auto px-4 py-10 max-w-3xl" style={{ zIndex: 1 }}>

        {/* Title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div style={{ width: 3, height: 36, background: 'linear-gradient(180deg, #ff2200, #660000)', borderRadius: 2, flexShrink: 0 }} />
            <h1 className="text-3xl sm:text-5xl font-black uppercase" style={{ color: '#fff', textShadow: '0 0 40px rgba(255,40,0,0.5)', letterSpacing: '0.15em' }}>
              Combat Rankings
            </h1>
          </div>
          <p className="ml-4 text-xs uppercase tracking-widest font-bold" style={{ color: '#5a1515' }}>Season I — Ordinal Warfare</p>
        </div>

        {/* My stats */}
        {myStats && (
          <GlassPanel className="mb-6">
            <div style={{ padding: '18px 22px' }}>
              <div className="flex items-center gap-2 mb-4">
                <div style={{ width: 8, height: 8, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 8px #ff2200' }} />
                <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#7f1d1d' }}>Your Combat Record</span>
                {(myStats.wins > 0 || myStats.losses > 0) && (
                  <span className="ml-auto text-sm font-black uppercase tracking-widest" style={{ color: '#ff4400' }}>RANK #{myStats.rank}</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {/* Victories */}
                <div className="relative overflow-hidden" style={{ borderRadius: 4, border: '1px solid rgba(34,197,94,0.2)', background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))', padding: '14px 16px' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.6), transparent)' }} />
                  <div className="text-xs uppercase tracking-widest font-black mb-2" style={{ color: 'rgba(34,197,94,0.55)' }}>Victories</div>
                  <div className="text-4xl font-black tabular-nums leading-none" style={{ color: '#22c55e', textShadow: '0 0 20px rgba(34,197,94,0.5)' }}>{myStats.wins}</div>
                </div>
                {/* Defeated */}
                <div className="relative overflow-hidden" style={{ borderRadius: 4, border: '1px solid rgba(200,30,0,0.2)', background: 'linear-gradient(135deg, rgba(200,30,0,0.08), rgba(200,30,0,0.02))', padding: '14px 16px' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(200,30,0,0.6), transparent)' }} />
                  <div className="text-xs uppercase tracking-widest font-black mb-2" style={{ color: 'rgba(200,30,0,0.55)' }}>Defeated</div>
                  <div className="text-4xl font-black tabular-nums leading-none" style={{ color: '#cc2200', textShadow: '0 0 20px rgba(200,30,0,0.5)' }}>{myStats.losses}</div>
                </div>
                {/* Win Rate */}
                <div className="relative overflow-hidden" style={{ borderRadius: 4, border: '1px solid rgba(255,200,100,0.15)', background: 'linear-gradient(135deg, rgba(255,180,0,0.06), rgba(255,180,0,0.01))', padding: '14px 16px' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,180,0,0.5), transparent)' }} />
                  <div className="text-xs uppercase tracking-widest font-black mb-2" style={{ color: 'rgba(255,180,0,0.45)' }}>Win Rate</div>
                  <div className="font-black tabular-nums leading-none" style={{ color: '#f5d060', textShadow: '0 0 20px rgba(255,180,0,0.4)', fontSize: myStats.win_pct === 100 ? '1.6rem' : '2rem' }}>{myStats.win_pct}%</div>
                </div>
              </div>
            </div>
          </GlassPanel>
        )}

        {/* Leaderboard */}
        <GlassPanel>
          {/* Header bar */}
          <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(180,20,0,0.18)', background: 'linear-gradient(90deg, rgba(180,20,0,0.18) 0%, rgba(180,20,0,0.04) 100%)' }}>
            <div style={{ width: 6, height: 6, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 6px #ff2200' }} />
            <span className="text-sm font-black uppercase tracking-widest" style={{ color: '#7a2020' }}>Global Fighters</span>
            <span className="ml-auto text-xs font-black" style={{ color: '#4a1515' }}>{leaders.length} entries</span>
          </div>

          {loading ? (
            <div className="py-20 text-center text-sm uppercase tracking-widest font-black animate-pulse" style={{ color: '#4a1515' }}>Loading Combat Data…</div>
          ) : leaders.length === 0 ? (
            <div className="py-20 text-center text-sm uppercase tracking-widest font-black" style={{ color: '#4a1515' }}>No battles recorded yet</div>
          ) : (
            <div>
              {/* Column headers */}
              <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: '56px 1fr 64px 64px 72px', borderBottom: '1px solid rgba(180,20,0,0.12)', background: 'rgba(255,0,0,0.025)' }}>
                <div className="text-xs font-black uppercase tracking-widest" style={{ color: '#4a1515' }}>Rank</div>
                <div className="text-xs font-black uppercase tracking-widest" style={{ color: '#4a1515' }}>Fighter</div>
                <div className="text-xs font-black uppercase tracking-widest text-right" style={{ color: '#4a1515' }}>W</div>
                <div className="text-xs font-black uppercase tracking-widest text-right" style={{ color: '#4a1515' }}>L</div>
                <div className="text-xs font-black uppercase tracking-widest text-right" style={{ color: '#4a1515' }}>Win%</div>
              </div>

              {leaders.map((l, i) => {
                const isMe = !!(address && l.wallet_address.toLowerCase() === address.toLowerCase())
                const cfg = TOP3[i]
                const rankColor  = cfg ? cfg.color  : '#4a2020'
                const rankGlow   = cfg ? cfg.glow   : 'transparent'
                const rowBg      = cfg ? cfg.bg : isMe ? 'linear-gradient(90deg, rgba(255,40,0,0.07) 0%, transparent 80%)' : undefined
                const rowBorder  = cfg ? cfg.border : isMe ? 'rgba(255,40,0,0.14)' : 'rgba(180,20,0,0.08)'
                const rankLabel  = String(i + 1).padStart(2, '0')

                return (
                  <div key={l.wallet_address} className="grid items-center px-5 py-3.5 relative overflow-hidden" style={{ gridTemplateColumns: '56px 1fr 64px 64px 72px', borderBottom: `1px solid ${rowBorder}`, background: rowBg }}>
                    {cfg && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: `linear-gradient(180deg, transparent, ${rankColor}, transparent)`, opacity: 0.65 }} />}

                    {/* Rank */}
                    <div className="font-black tabular-nums text-base" style={{ color: rankColor, textShadow: cfg ? `0 0 12px ${rankGlow}` : undefined, letterSpacing: '0.08em' }}>
                      {rankLabel}
                    </div>

                    {/* Wallet */}
                    <div className="font-mono truncate pr-3 text-sm" style={{ color: isMe ? '#e8eef7' : cfg ? 'rgba(255,255,255,0.5)' : '#5a3030', textShadow: isMe ? '0 0 10px rgba(255,100,50,0.25)' : undefined }}>
                      {fmt(l.wallet_address)}
                      {isMe && <span className="ml-2 text-xs font-black uppercase tracking-widest" style={{ color: '#ff4400' }}>YOU</span>}
                    </div>

                    {/* W */}
                    <div className="text-right font-black tabular-nums text-base" style={{ color: '#22c55e', textShadow: '0 0 8px rgba(34,197,94,0.3)' }}>{l.wins}</div>

                    {/* L */}
                    <div className="text-right font-black tabular-nums text-base" style={{ color: '#cc2200' }}>{l.losses}</div>

                    {/* Win% */}
                    <div className="text-right font-black tabular-nums text-sm" style={{ color: cfg ? rankColor : isMe ? '#f5d060' : '#6a2525', textShadow: cfg ? `0 0 8px ${rankGlow}` : undefined }}>{l.win_pct}%</div>
                  </div>
                )
              })}
            </div>
          )}
        </GlassPanel>

        {/* Footer rule */}
        <div className="mt-6 flex items-center gap-4">
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(180,20,0,0.3), transparent)' }} />
          <span className="text-xs uppercase tracking-widest font-black" style={{ color: '#2a0808' }}>Ordinal Combat — Season I</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(180,20,0,0.3))' }} />
        </div>
      </div>
    </div>
  )
}
