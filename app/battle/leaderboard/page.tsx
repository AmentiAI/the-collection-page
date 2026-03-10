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

const RANK_CONFIG: Record<number, { label: string; color: string; glow: string; bg: string; border: string }> = {
  0: {
    label: '01',
    color: '#ff4400',
    glow: 'rgba(255,68,0,0.6)',
    bg: 'linear-gradient(90deg, rgba(255,68,0,0.18) 0%, rgba(255,68,0,0.04) 60%, transparent 100%)',
    border: 'rgba(255,68,0,0.35)',
  },
  1: {
    label: '02',
    color: '#c0c0c0',
    glow: 'rgba(192,192,192,0.4)',
    bg: 'linear-gradient(90deg, rgba(192,192,192,0.1) 0%, rgba(192,192,192,0.02) 60%, transparent 100%)',
    border: 'rgba(192,192,192,0.2)',
  },
  2: {
    label: '03',
    color: '#cd7f32',
    glow: 'rgba(205,127,50,0.4)',
    bg: 'linear-gradient(90deg, rgba(205,127,50,0.1) 0%, rgba(205,127,50,0.02) 60%, transparent 100%)',
    border: 'rgba(205,127,50,0.2)',
  },
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
      .then(d => {
        if (d.success) {
          setLeaders(d.leaders ?? [])
          setMyStats(d.myStats ?? null)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  const fmt = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`

  return (
    <div className="min-h-screen text-white" style={{ background: '#080205' }}>
      <Header showMusicControls={true} />

      {/* Ambient background layers */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(180,0,0,0.18) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,0,0,0.015) 40px)',
        }} />
      </div>

      <div className="relative container mx-auto px-4 py-12 max-w-3xl" style={{ zIndex: 1 }}>

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-1">
            <div style={{ width: 3, height: 32, background: 'linear-gradient(180deg, #ff2200, #660000)', borderRadius: 2, flexShrink: 0 }} />
            <div
              className="text-3xl sm:text-4xl font-black uppercase tracking-[0.2em]"
              style={{
                color: '#fff',
                textShadow: '0 0 40px rgba(255,40,0,0.5), 0 2px 0 rgba(0,0,0,0.8)',
                letterSpacing: '0.18em',
              }}
            >
              Combat Rankings
            </div>
          </div>
          <div className="ml-4 text-[9px] uppercase tracking-[0.35em] font-bold" style={{ color: '#5a1515' }}>
            Season I — Ordinal Warfare
          </div>
        </div>

        {/* ── My stats HUD ───────────────────────────────────────────────── */}
        {myStats && (
          <div className="mb-8 relative overflow-hidden" style={{ borderRadius: 4 }}>
            {/* Glass panel */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 50%, transparent 100%)',
              borderRadius: 4,
            }} />
            {/* Top shine streak */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 1,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,80,0,0.6) 30%, rgba(255,180,100,0.8) 50%, rgba(255,80,0,0.6) 70%, transparent 100%)',
            }} />
            <div style={{
              position: 'absolute', top: 0, left: '20%', width: '30%', height: 60,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)',
              borderRadius: '0 0 40% 40%',
            }} />

            <div style={{
              border: '1px solid rgba(200,30,0,0.3)',
              borderTop: '1px solid rgba(255,80,0,0.5)',
              borderRadius: 4,
              background: 'linear-gradient(160deg, rgba(120,5,5,0.25) 0%, rgba(8,2,5,0.95) 60%)',
              backdropFilter: 'blur(8px)',
              padding: '20px 24px',
            }}>
              {/* YOUR STATS label */}
              <div className="flex items-center gap-2 mb-4">
                <div style={{ width: 8, height: 8, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 8px #ff2200' }} />
                <span className="text-[9px] uppercase tracking-[0.4em] font-black" style={{ color: '#7f1d1d' }}>Your Combat Record</span>
                {(myStats.wins > 0 || myStats.losses > 0) && (
                  <span className="ml-auto text-[9px] uppercase tracking-widest font-black" style={{ color: '#ff4400' }}>
                    RANK #{myStats.rank}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Wins */}
                <div className="relative overflow-hidden" style={{
                  borderRadius: 3,
                  border: '1px solid rgba(34,197,94,0.2)',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)',
                  padding: '12px 14px',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.6), transparent)',
                  }} />
                  <div className="text-[8px] uppercase tracking-[0.3em] font-black mb-2" style={{ color: 'rgba(34,197,94,0.5)' }}>Victories</div>
                  <div className="text-3xl font-black tabular-nums leading-none" style={{
                    color: '#22c55e',
                    textShadow: '0 0 20px rgba(34,197,94,0.5)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{myStats.wins}</div>
                </div>

                {/* Losses */}
                <div className="relative overflow-hidden" style={{
                  borderRadius: 3,
                  border: '1px solid rgba(200,30,0,0.2)',
                  background: 'linear-gradient(135deg, rgba(200,30,0,0.08) 0%, rgba(200,30,0,0.02) 100%)',
                  padding: '12px 14px',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(200,30,0,0.6), transparent)',
                  }} />
                  <div className="text-[8px] uppercase tracking-[0.3em] font-black mb-2" style={{ color: 'rgba(200,30,0,0.5)' }}>Defeated</div>
                  <div className="text-3xl font-black tabular-nums leading-none" style={{
                    color: '#cc2200',
                    textShadow: '0 0 20px rgba(200,30,0,0.5)',
                  }}>{myStats.losses}</div>
                </div>

                {/* Win Rate */}
                <div className="relative overflow-hidden" style={{
                  borderRadius: 3,
                  border: '1px solid rgba(255,200,100,0.15)',
                  background: 'linear-gradient(135deg, rgba(255,180,0,0.06) 0%, rgba(255,180,0,0.01) 100%)',
                  padding: '12px 14px',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(255,180,0,0.5), transparent)',
                  }} />
                  <div className="text-[8px] uppercase tracking-[0.3em] font-black mb-2" style={{ color: 'rgba(255,180,0,0.4)' }}>Win Rate</div>
                  <div className="font-black tabular-nums leading-none" style={{
                    color: '#f5d060',
                    textShadow: '0 0 20px rgba(255,180,0,0.4)',
                    fontSize: myStats.win_pct === 100 ? '1.4rem' : '1.75rem',
                  }}>{myStats.win_pct}%</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Leaderboard panel ─────────────────────────────────────────── */}
        <div className="relative overflow-hidden" style={{ borderRadius: 4 }}>
          {/* Panel top shine */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 2,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,60,0,0.5) 30%, rgba(255,160,80,0.7) 50%, rgba(255,60,0,0.5) 70%, transparent 100%)',
          }} />

          <div style={{
            border: '1px solid rgba(180,20,0,0.3)',
            borderTop: '1px solid rgba(255,60,0,0.45)',
            borderRadius: 4,
            background: 'linear-gradient(180deg, rgba(80,5,5,0.2) 0%, rgba(6,1,4,0.97) 80%)',
            backdropFilter: 'blur(6px)',
            overflow: 'hidden',
          }}>

            {/* Panel header bar */}
            <div style={{
              padding: '10px 20px',
              background: 'linear-gradient(90deg, rgba(180,20,0,0.2) 0%, rgba(180,20,0,0.05) 100%)',
              borderBottom: '1px solid rgba(180,20,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{ width: 6, height: 6, background: '#ff2200', borderRadius: 1, transform: 'rotate(45deg)', boxShadow: '0 0 6px #ff2200' }} />
              <span className="text-[8px] uppercase tracking-[0.5em] font-black" style={{ color: '#5a1515' }}>Global Fighters</span>
              <span className="ml-auto text-[8px] uppercase tracking-widest font-black" style={{ color: '#3a0a0a' }}>{leaders.length} entries</span>
            </div>

            {loading ? (
              <div className="py-20 text-center">
                <div className="text-[9px] uppercase tracking-[0.5em] font-black animate-pulse" style={{ color: '#3d0a0a' }}>
                  Loading Combat Data…
                </div>
              </div>
            ) : leaders.length === 0 ? (
              <div className="py-20 text-center">
                <div className="text-[9px] uppercase tracking-[0.5em] font-black" style={{ color: '#3d0a0a' }}>
                  No battles recorded yet
                </div>
              </div>
            ) : (
              <div>
                {/* Column headers */}
                <div className="grid items-center px-5 py-2" style={{
                  gridTemplateColumns: '48px 1fr 60px 60px 64px',
                  borderBottom: '1px solid rgba(180,20,0,0.12)',
                  background: 'rgba(255,0,0,0.03)',
                }}>
                  <div className="text-[7px] uppercase tracking-[0.4em] font-black" style={{ color: '#3a0a0a' }}>Rank</div>
                  <div className="text-[7px] uppercase tracking-[0.4em] font-black" style={{ color: '#3a0a0a' }}>Fighter</div>
                  <div className="text-[7px] uppercase tracking-[0.4em] font-black text-right" style={{ color: '#3a0a0a' }}>W</div>
                  <div className="text-[7px] uppercase tracking-[0.4em] font-black text-right" style={{ color: '#3a0a0a' }}>L</div>
                  <div className="text-[7px] uppercase tracking-[0.4em] font-black text-right" style={{ color: '#3a0a0a' }}>Win%</div>
                </div>

                {leaders.map((l, i) => {
                  const isMe = address && l.wallet_address.toLowerCase() === address.toLowerCase()
                  const cfg = RANK_CONFIG[i]
                  const rankLabel = i < 3 ? cfg.label : String(i + 1).padStart(2, '0')
                  const rankColor = i < 3 ? cfg.color : '#3a1515'
                  const rankGlow  = i < 3 ? cfg.glow  : 'transparent'
                  const rowBg     = i < 3 ? cfg.bg : isMe ? 'linear-gradient(90deg, rgba(255,40,0,0.08) 0%, transparent 80%)' : undefined
                  const rowBorder = i < 3 ? cfg.border : isMe ? 'rgba(255,40,0,0.15)' : 'rgba(180,20,0,0.07)'

                  return (
                    <div
                      key={l.wallet_address}
                      className="grid items-center px-5 py-3 relative overflow-hidden"
                      style={{
                        gridTemplateColumns: '48px 1fr 60px 60px 64px',
                        borderBottom: `1px solid ${rowBorder}`,
                        background: rowBg,
                        transition: 'background 0.2s',
                      }}
                    >
                      {/* Left accent for top 3 */}
                      {i < 3 && (
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
                          background: `linear-gradient(180deg, transparent, ${rankColor}, transparent)`,
                          opacity: 0.7,
                        }} />
                      )}

                      {/* Rank */}
                      <div className="font-black tabular-nums" style={{
                        color: rankColor,
                        textShadow: i < 3 ? `0 0 12px ${rankGlow}` : undefined,
                        fontSize: i < 3 ? 13 : 11,
                        letterSpacing: '0.1em',
                      }}>
                        {rankLabel}
                      </div>

                      {/* Wallet */}
                      <div className="font-mono truncate pr-2" style={{
                        color: isMe ? '#e8eef7' : i < 3 ? 'rgba(255,255,255,0.55)' : '#4a2525',
                        fontSize: 11,
                        textShadow: isMe ? '0 0 10px rgba(255,100,50,0.3)' : undefined,
                      }}>
                        {fmt(l.wallet_address)}
                        {isMe && (
                          <span className="ml-2 text-[8px] uppercase tracking-widest font-black" style={{ color: '#ff4400' }}>YOU</span>
                        )}
                      </div>

                      {/* Wins */}
                      <div className="text-right font-black tabular-nums" style={{
                        color: '#22c55e',
                        fontSize: 13,
                        textShadow: '0 0 10px rgba(34,197,94,0.3)',
                      }}>{l.wins}</div>

                      {/* Losses */}
                      <div className="text-right font-black tabular-nums" style={{
                        color: '#cc2200',
                        fontSize: 13,
                      }}>{l.losses}</div>

                      {/* Win% */}
                      <div className="text-right font-black tabular-nums" style={{
                        color: i < 3 ? rankColor : isMe ? '#f5d060' : '#5a1515',
                        fontSize: 11,
                        textShadow: i < 3 ? `0 0 8px ${rankGlow}` : undefined,
                      }}>{l.win_pct}%</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom label */}
        <div className="mt-5 flex items-center gap-3">
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(180,20,0,0.3), transparent)' }} />
          <div className="text-[7px] uppercase tracking-[0.5em] font-black" style={{ color: '#2a0808' }}>
            Ordinal Combat — Season I
          </div>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(180,20,0,0.3))' }} />
        </div>
      </div>
    </div>
  )
}
