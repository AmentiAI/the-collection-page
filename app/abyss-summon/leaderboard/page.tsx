'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Trophy, Loader2 } from 'lucide-react'

import Header from '@/components/Header'
import { useWallet } from '@/lib/wallet/compatibility'

type SummonLeaderboardEntry = {
  wallet: string
  username: string | null
  avatarUrl: string | null
  burns: number
  confirmedBurns: number
  hosted: number
  participated: number
  score: number
  lastBurnAt: string | null
  lastHostedAt: string | null
  lastParticipatedAt: string | null
}

const SUMMON_BURN_POINTS = 6
const SUMMON_HOST_POINTS = 2
const SUMMON_PARTICIPATION_POINTS = 1

function formatTimestamp(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export default function SummonLeaderboardPage() {
  const wallet = useWallet()
  const ordinalAddress = wallet.currentAddress?.trim() ?? ''

  const [summonLeaderboard, setSummonLeaderboard] = useState<SummonLeaderboardEntry[]>([])
  const [summonLeaderboardLoading, setSummonLeaderboardLoading] = useState(false)
  const [selectedSummonerWallet, setSelectedSummonerWallet] = useState<string | null>(null)

  const truncateWallet = useCallback((value: string) => {
    const normalized = value.trim()
    if (normalized.length <= 8) return normalized
    return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`
  }, [])

  const getDisplayName = useCallback(
    (entry: SummonLeaderboardEntry) => entry.username?.trim() || truncateWallet(entry.wallet),
    [truncateWallet],
  )

  const renderSummonerIdentity = useCallback(
    (entry: SummonLeaderboardEntry, emphasizeSelf = false) => {
      const displayName = getDisplayName(entry)
      const initials =
        displayName.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() ||
        truncateWallet(entry.wallet).slice(0, 2)
      return (
        <span className={`flex items-center gap-2 ${emphasizeSelf ? 'text-amber-200' : 'text-red-200/90'}`}>
          <span className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-red-700/50 bg-black/70 text-[9px] font-bold uppercase tracking-[0.2em] text-red-300">
            {entry.avatarUrl ? (
              <Image
                src={entry.avatarUrl}
                alt={displayName}
                width={24}
                height={24}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
          <span className="truncate">{displayName}</span>
        </span>
      )
    },
    [getDisplayName, truncateWallet],
  )

  const loadSummonLeaderboard = useCallback(async () => {
    setSummonLeaderboardLoading(true)
    try {
      const response = await fetch('/api/abyss/summons/leaderboard', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Summon leaderboard request failed (${response.status})`)
      }
      const payload = await response.json().catch(() => null)
      const entries: SummonLeaderboardEntry[] = Array.isArray(payload?.entries)
        ? (payload.entries as Array<Record<string, unknown>>).map((item) => ({
            wallet: (item?.wallet ?? '').toString().toLowerCase(),
            username: typeof item?.username === 'string' ? item.username : null,
            avatarUrl:
              typeof item?.avatarUrl === 'string'
                ? item.avatarUrl
                : typeof item?.avatar_url === 'string'
                ? item.avatar_url
                : null,
            burns: Number(item?.burns ?? 0),
            confirmedBurns: Number(item?.confirmedBurns ?? item?.confirmed_burns ?? 0),
            hosted: Number(item?.hosted ?? 0),
            participated: Number(item?.participated ?? 0),
            score: Number(item?.score ?? 0),
            lastBurnAt:
              typeof item?.lastBurnAt === 'string'
                ? item.lastBurnAt
                : typeof item?.last_burn_at === 'string'
                ? item.last_burn_at
                : null,
            lastHostedAt:
              typeof item?.lastHostedAt === 'string'
                ? item.lastHostedAt
                : typeof item?.last_hosted_at === 'string'
                ? item.last_hosted_at
                : null,
            lastParticipatedAt:
              typeof item?.lastParticipatedAt === 'string'
                ? item.lastParticipatedAt
                : typeof item?.last_participated_at === 'string'
                ? item.last_participated_at
                : null,
          }))
        : []
      entries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (b.burns !== a.burns) return b.burns - a.burns
        if (b.hosted !== a.hosted) return b.hosted - a.hosted
        if (b.participated !== a.participated) return b.participated - a.participated
        return a.wallet.localeCompare(b.wallet)
      })
      setSummonLeaderboard(entries)
      setSelectedSummonerWallet((previous) => {
        if (previous && entries.some((entry) => entry.wallet === previous)) {
          return previous
        }
        const normalizedAddress = ordinalAddress.trim().toLowerCase()
        if (normalizedAddress) {
          const match = entries.find((entry) => entry.wallet === normalizedAddress)
          if (match) {
            return match.wallet
          }
        }
        return entries[0]?.wallet ?? null
      })
    } catch (error) {
      console.error('Failed to load summon leaderboard:', error)
      setSummonLeaderboard([])
    } finally {
      setSummonLeaderboardLoading(false)
    }
  }, [ordinalAddress])

  useEffect(() => {
    void loadSummonLeaderboard()
    const intervalId = window.setInterval(() => {
      void loadSummonLeaderboard()
    }, 30_000)
    return () => window.clearInterval(intervalId)
  }, [loadSummonLeaderboard])

  const selectedSummonerEntry = summonLeaderboard.find((entry) => entry.wallet === selectedSummonerWallet) ?? null

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <Header connected={!!ordinalAddress} onConnectedChange={() => {}} />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <Link
            href="/abyss-summon"
            className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-400 hover:text-red-300 transition"
          >
            ← Back to Summoning Circles
          </Link>
        </div>

        <div className="w-full space-y-6 rounded-3xl border border-red-600/50 bg-black/92 p-6 shadow-[0_0_45px_rgba(220,38,38,0.55)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1 text-left">
              <h1 className="flex items-center gap-2 font-mono text-2xl uppercase tracking-[0.35em] text-red-200">
                <Trophy className="h-6 w-6 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]" />
                Summoners Leaderboard
              </h1>
              <p className="max-w-xl font-mono text-xs uppercase tracking-[0.3em] text-red-400/80">
                Scores: {SUMMON_BURN_POINTS} points per abyss burn, {SUMMON_HOST_POINTS} points per completed circle you hosted, {SUMMON_PARTICIPATION_POINTS} point per completed circle you joined.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {summonLeaderboardLoading && (
                <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-300">
                  <Loader2 className="h-4 w-4 animate-spin" /> Refreshing
                </span>
              )}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-red-700/40 bg-black/40">
              {summonLeaderboardLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-red-300" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-red-300">
                    Calculating summoning ranks…
                  </span>
                </div>
              ) : summonLeaderboard.length === 0 ? (
                <div className="px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-red-400/70">
                  No completed circles detected yet. Finish a ritual to appear here.
                </div>
              ) : (
                <table className="w-full table-fixed border-collapse text-[11px] font-mono uppercase tracking-[0.25em] text-red-200">
                  <thead className="sticky top-0 border-b border-red-700/40 bg-black/60 text-red-400">
                    <tr>
                      <th className="w-10 px-4 py-2 text-left font-normal">#</th>
                      <th className="px-4 py-2 text-left font-normal">Summoner</th>
                      <th className="w-16 px-4 py-2 text-right font-normal">Score</th>
                      <th className="w-14 px-4 py-2 text-right font-normal">🔥</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summonLeaderboard.map((entry, index) => {
                      const isSelected = selectedSummonerWallet === entry.wallet
                      const isSelf =
                        ordinalAddress.trim().length > 0 &&
                        entry.wallet === ordinalAddress.trim().toLowerCase()
                      const rowClasses = isSelected
                        ? 'bg-red-900/40 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)]'
                        : 'hover:bg-red-900/20'
                      return (
                        <tr
                          key={`${entry.wallet}-${index}`}
                          className={`${rowClasses} border-b border-red-700/20 transition cursor-pointer`}
                          onClick={() => setSelectedSummonerWallet(entry.wallet)}
                        >
                          <td className="px-4 py-2 text-left text-red-500">{String(index + 1).padStart(2, '0')}</td>
                          <td className="px-4 py-2 text-left">
                            {renderSummonerIdentity(entry, isSelf)}
                          </td>
                          <td className="px-4 py-2 text-right text-amber-200 tabular-nums">{entry.score}</td>
                          <td className="px-4 py-2 text-right text-red-400 tabular-nums">{entry.burns}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="space-y-4 rounded-2xl border border-red-600/40 bg-black/60 p-4 shadow-[0_0_25px_rgba(220,38,38,0.35)]">
              {selectedSummonerEntry ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-red-600/50 bg-black/80 text-sm font-bold uppercase tracking-[0.2em] text-red-300">
                      {selectedSummonerEntry.avatarUrl ? (
                        <Image
                          src={selectedSummonerEntry.avatarUrl}
                          alt={getDisplayName(selectedSummonerEntry)}
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        truncateWallet(selectedSummonerEntry.wallet).slice(0, 2)
                      )}
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-mono text-sm uppercase tracking-[0.3em] text-red-200">
                        {getDisplayName(selectedSummonerEntry)}
                      </h4>
                      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-400/80">
                        {truncateWallet(selectedSummonerEntry.wallet)}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-400/80">
                        Total Score: {selectedSummonerEntry.score}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 text-[11px] uppercase tracking-[0.25em] text-red-200/80">
                    <div className="flex items-center justify-between rounded-lg border border-red-700/40 bg-black/40 px-3 py-2">
                      <span>Burns · {selectedSummonerEntry.burns}</span>
                      <span className="text-amber-200">
                        +{selectedSummonerEntry.burns * SUMMON_BURN_POINTS} pts
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-red-700/40 bg-black/40 px-3 py-2">
                      <span>Hosted · {selectedSummonerEntry.hosted}</span>
                      <span className="text-amber-200">
                        +{selectedSummonerEntry.hosted * SUMMON_HOST_POINTS} pts
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-red-700/40 bg-black/40 px-3 py-2">
                      <span>Allies Joined · {selectedSummonerEntry.participated}</span>
                      <span className="text-amber-200">
                        +{selectedSummonerEntry.participated * SUMMON_PARTICIPATION_POINTS} pts
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 rounded-lg border border-red-700/40 bg-black/40 px-3 py-3 text-[10px] uppercase tracking-[0.3em] text-red-300/80">
                    <div className="flex items-center justify-between">
                      <span>Last Completed Circle</span>
                      <span>{formatTimestamp(selectedSummonerEntry.lastParticipatedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Last Hosted</span>
                      <span>{formatTimestamp(selectedSummonerEntry.lastHostedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Last Burn Recorded</span>
                      <span>{formatTimestamp(selectedSummonerEntry.lastBurnAt)}</span>
                    </div>
                    <div className="flex items-center justify-between text-red-400/70">
                      <span>Confirmed Burns</span>
                      <span>{selectedSummonerEntry.confirmedBurns}</span>
                    </div>
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-red-400/70">
                    Score is cumulative; keep hosting and sealing circles to climb the rankings.
                  </p>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.3em] text-red-300/70">
                  <Trophy className="h-8 w-8 text-red-500 drop-shadow-[0_0_18px_rgba(220,38,38,0.4)]" />
                  Select a summoner to view their contributions.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

