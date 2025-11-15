'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Trophy, ArrowLeft } from 'lucide-react'

import Header from '@/components/Header'
import { useWallet } from '@/lib/wallet/compatibility'

type LeaderboardEntry = {
  walletAddress: string
  username: string | null
  avatarUrl: string | null
  available: number
  spent: number
  total: number
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

function truncateWallet(wallet: string): string {
  if (wallet.length <= 12) return wallet
  return `${wallet.slice(0, 6)}…${wallet.slice(-6)}`
}

export default function AscensionLeaderboardPage() {
  const wallet = useWallet()
  const currentAddress = wallet.currentAddress?.trim() ?? ''

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/ascension/leaderboard', {
          headers: { 'Cache-Control': 'no-store' },
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch leaderboard (${response.status})`)
        }
        const data = await response.json()
        if (data.success && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard)
        } else {
          throw new Error('Invalid leaderboard data')
        }
      } catch (err) {
        console.error('Failed to load leaderboard', err)
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
    // Refresh every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000)
    return () => clearInterval(interval)
  }, [])

  const currentUserRank = leaderboard.findIndex(
    (entry) => entry.walletAddress.toLowerCase() === currentAddress.toLowerCase(),
  )

  return (
    <div className="relative min-h-screen w-full bg-black text-red-100">
      <Header connected={Boolean(currentAddress)} onConnectedChange={() => {}} />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 md:px-8">
        <div className="mb-6">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-400 hover:text-red-300 transition"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </Link>
        </div>

        <div className="w-full space-y-6 rounded-3xl border border-red-600/50 bg-black/92 p-6 shadow-[0_0_45px_rgba(220,38,38,0.55)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 text-left">
              <h1 className="flex items-center gap-2 font-mono text-2xl uppercase tracking-[0.35em] text-red-200">
                <Trophy className="h-6 w-6 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]" />
                Ascension Leaderboard
              </h1>
              <p className="max-w-xl font-mono text-xs uppercase tracking-[0.3em] text-red-400/80">
                Rankings by total ascension powder (available + spent). Available is current balance, spent is total used on graveyard ordinals.
              </p>
            </div>
            {currentUserRank >= 0 && (
              <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-2">
                <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-red-200">
                  Your Rank: #{currentUserRank + 1}
                </p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-red-400" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-3">
              <p className="text-sm text-red-400">No ascension data available yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-red-600/40">
                    <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-[0.3em] text-red-300">
                      Rank
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-[0.3em] text-red-300">
                      User
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-mono uppercase tracking-[0.3em] text-red-300">
                      Available
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-mono uppercase tracking-[0.3em] text-red-300">
                      Spent
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-mono uppercase tracking-[0.3em] text-red-300">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => {
                    const isCurrentUser = entry.walletAddress.toLowerCase() === currentAddress.toLowerCase()
                    const displayName = entry.username?.trim() || truncateWallet(entry.walletAddress)
                    const displayInitials = entry.username
                      ? entry.username.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || truncateWallet(entry.walletAddress).slice(0, 2)
                      : truncateWallet(entry.walletAddress).slice(0, 2)

                    return (
                      <tr
                        key={entry.walletAddress}
                        className={`border-b border-red-600/20 transition ${
                          isCurrentUser
                            ? 'bg-red-900/30 border-red-500/60'
                            : 'hover:bg-red-900/10'
                        }`}
                      >
                        <td className="px-4 py-3 text-[11px] font-mono uppercase tracking-[0.3em] text-red-200">
                          #{index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {entry.avatarUrl ? (
                              <Image
                                src={entry.avatarUrl}
                                alt={displayName}
                                width={32}
                                height={32}
                                className="h-8 w-8 rounded-full border border-red-700/50"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-red-700/50 bg-black/70 text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">
                                {displayInitials}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-red-200">{displayName}</span>
                              {entry.username && (
                                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-400/70">
                                  {truncateWallet(entry.walletAddress)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-red-200">
                          {formatNumber(entry.available)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-red-300">
                          {formatNumber(entry.spent)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-amber-300">
                          {formatNumber(entry.total)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

