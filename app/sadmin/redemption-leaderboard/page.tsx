'use client'

import { useState, useEffect } from 'react'
import { Trophy, Loader2, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import Header from '@/components/Header'

type LeaderboardEntry = {
  wallet_address: string
  discord_username: string
  discord_avatar_url: string
  army_count: number
  angel_count: number
  demon_count: number
  battles_count: number
  heals_count: number
  crystallization_count: number
  ascension_circle_count: number
  resurrections_count: number
  total_score: number
}

export default function RedemptionLeaderboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const fetchLeaderboard = async () => {
    try {
      setError(null)
      const response = await fetch('/api/sadmin/redemption-leaderboard', {
        cache: 'no-store',
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch leaderboard')
      }

      setLeaderboard(result.leaderboard || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setLeaderboard([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchLeaderboard()
  }

  const truncateWallet = (wallet: string) => {
    if (wallet.length <= 12) return wallet
    return `${wallet.slice(0, 6)}...${wallet.slice(-6)}`
  }

  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <Header connected={false} showMusicControls={false} />

      <main className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-8 md:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8 text-red-500" />
            <h1 className="text-3xl font-bold text-red-500">Redemption Leaderboard</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 rounded-lg border border-red-600/40 bg-red-900/20 px-4 py-2 text-sm font-mono uppercase tracking-wider text-red-200 transition hover:bg-red-900/40 disabled:opacity-50"
          >
            {refreshing || loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-600/40 bg-red-900/20 p-4 text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-red-600/40 bg-black/60">
            <table className="w-full min-w-[1600px] divide-y divide-red-800/50">
              <thead className="bg-red-900/20">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Wallet
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Discord
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Total Score
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Army Count
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Angels
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Demons
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Battles
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Heals
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Crystallizations
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Ascension Circles
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Resurrections
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-900/40">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                      No data available
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((entry, index) => (
                    <tr
                      key={entry.wallet_address}
                      className="transition hover:bg-red-900/10"
                    >
                      <td className="px-4 py-3 text-center font-mono text-xs font-bold text-amber-400">
                        #{index + 1}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-200">
                        {truncateWallet(entry.wallet_address)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {entry.discord_avatar_url ? (
                            <Image
                              src={entry.discord_avatar_url}
                              alt={entry.discord_username || 'Discord'}
                              width={24}
                              height={24}
                              className="rounded-full"
                            />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-gray-700 flex items-center justify-center">
                              <span className="text-[10px] text-gray-400">?</span>
                            </div>
                          )}
                          <span className="text-xs text-gray-300">
                            {entry.discord_username || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-amber-400">
                        {entry.total_score.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-200">
                        {entry.army_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-blue-300">
                        {entry.angel_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-red-300">
                        {entry.demon_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-yellow-300">
                        {entry.battles_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-green-300">
                        {entry.heals_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-purple-300">
                        {entry.crystallization_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-amber-300">
                        {entry.ascension_circle_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-cyan-300">
                        {entry.resurrections_count.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

