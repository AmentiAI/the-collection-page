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

  const fmt = (w: string) => `${w.slice(0, 8)}…${w.slice(-6)}`

  return (
    <div className="min-h-screen bg-black text-white">
      <Header showMusicControls={true} />

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Title */}
        <div className="text-center mb-10">
          <div
            className="text-3xl sm:text-5xl font-black uppercase tracking-[0.25em] mb-2"
            style={{ color: '#cc2200', textShadow: '0 0 60px rgba(185,28,28,0.5)' }}
          >
            ⚔️ Battle Leaderboard
          </div>
          <div className="text-[10px] uppercase tracking-widest font-black" style={{ color: '#4a1515' }}>
            Top fighters by wins
          </div>
        </div>

        {/* My stats card */}
        {myStats && (
          <div
            className="mb-8 rounded-xl px-6 py-5 grid grid-cols-3 gap-4 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(185,28,28,0.14), rgba(5,2,2,0.95))',
              border: '1px solid rgba(185,28,28,0.4)',
              boxShadow: '0 0 30px rgba(185,28,28,0.1)',
            }}
          >
            <div>
              <div className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: '#7f1d1d' }}>Wins</div>
              <div className="text-4xl font-black tabular-nums" style={{ color: '#22c55e', textShadow: '0 0 20px rgba(34,197,94,0.4)' }}>{myStats.wins}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: '#7f1d1d' }}>Losses</div>
              <div className="text-4xl font-black tabular-nums" style={{ color: '#cc2200', textShadow: '0 0 20px rgba(185,28,28,0.4)' }}>{myStats.losses}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: '#7f1d1d' }}>Win Rate</div>
              <div className="text-4xl font-black tabular-nums" style={{ color: '#e8eef7' }}>{myStats.win_pct}%</div>
            </div>
            {(myStats.wins > 0 || myStats.losses > 0) && (
              <div className="col-span-3 text-[10px] uppercase tracking-widest font-black mt-1" style={{ color: '#4a1515' }}>
                Your global rank: #{myStats.rank}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard table */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(185,28,28,0.3)', background: 'rgba(5,2,2,0.9)' }}
        >
          {loading ? (
            <div className="py-16 text-center text-[11px] uppercase tracking-widest font-black" style={{ color: '#3d0a0a' }}>
              Loading…
            </div>
          ) : leaders.length === 0 ? (
            <div className="py-16 text-center text-[11px] uppercase tracking-widest font-black" style={{ color: '#3d0a0a' }}>
              No battles recorded yet
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(185,28,28,0.2)', background: 'rgba(185,28,28,0.06)' }}>
                  <th className="px-5 py-3 text-left font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>#</th>
                  <th className="px-5 py-3 text-left font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>Wallet</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>Wins</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>Losses</th>
                  <th className="px-5 py-3 text-right font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>Win%</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l, i) => {
                  const isMe = address && l.wallet_address.toLowerCase() === address.toLowerCase()
                  const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
                  return (
                    <tr
                      key={l.wallet_address}
                      style={{
                        borderBottom: '1px solid rgba(185,28,28,0.07)',
                        background: isMe ? 'rgba(185,28,28,0.1)' : undefined,
                      }}
                    >
                      <td className="px-5 py-3 font-black text-xs tabular-nums" style={{ color: i < 3 ? '#cc2200' : '#4a1515', minWidth: 40 }}>
                        {medal}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs" style={{ color: isMe ? '#e8eef7' : '#6b7280' }}>
                        {fmt(l.wallet_address)}{isMe ? ' ← you' : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-sm tabular-nums" style={{ color: '#22c55e' }}>{l.wins}</td>
                      <td className="px-4 py-3 text-right font-black text-sm tabular-nums" style={{ color: '#cc2200' }}>{l.losses}</td>
                      <td className="px-5 py-3 text-right font-black text-xs tabular-nums" style={{ color: '#e8eef7' }}>{l.win_pct}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
