'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import Image from 'next/image'
import { Loader2, Trophy, Sword, Shield, Skull, Heart, Medal, ChevronDown, ChevronUp } from 'lucide-react'

interface LeaderboardEntry {
  side: 'Angelic' | 'Demonic'
  total_battles: number
  total_deaths: number
  total_resurrections: number
  score: number
  last_updated: string
}

interface IndividualLeader {
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
  killing_blows_count: number
  abyss_burns_count: number
  mints_count: number
  total_score: number
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [angelicLeaders, setAngelicLeaders] = useState<IndividualLeader[]>([])
  const [demonicLeaders, setDemonicLeaders] = useState<IndividualLeader[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLeaders, setLoadingLeaders] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [scoreConfig, setScoreConfig] = useState<Record<string, number>>({})
  const [efficiencyExponent, setEfficiencyExponent] = useState<number>(0.25)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchLeaderboard()
    fetchIndividualLeaders()
    fetchScoreConfig()
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchLeaderboard()
      fetchIndividualLeaders()
      fetchScoreConfig()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/leaderboard')
      if (!response.ok) throw new Error('Failed to fetch leaderboard')
      
      const data = await response.json()
      if (data.success) {
        setLeaderboard(data.leaderboard)
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchScoreConfig = async () => {
    try {
      const response = await fetch('/api/sadmin/redemption-leaderboard/score-config', {
        cache: 'no-store',
      })
      const result = await response.json()
      if (result.success) {
        const configMap: Record<string, number> = {}
        result.config.forEach((item: any) => {
          configMap[item.categoryKey] = item.pointsValue
        })
        setScoreConfig(configMap)
        setEfficiencyExponent(result.efficiencyExponent || 0.25)
      }
    } catch (err) {
      console.error('Error fetching score config:', err)
    }
  }

  const fetchIndividualLeaders = async () => {
    try {
      setLoadingLeaders(true)
      const response = await fetch('/api/sadmin/redemption-leaderboard', {
        cache: 'no-store',
      })

      const result = await response.json()
      if (result.success && result.leaderboard) {
        // Get top 50 leaders
        const allLeaders = result.leaderboard.slice(0, 50)
        setAngelicLeaders(allLeaders)
        setDemonicLeaders([]) // Not used anymore, but keeping for compatibility
      }
    } catch (error) {
      console.error('Error fetching individual leaders:', error)
    } finally {
      setLoadingLeaders(false)
    }
  }

  const formatWallet = (wallet: string) => {
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
  }

  const toggleRow = (walletAddress: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(walletAddress)) {
      newExpanded.delete(walletAddress)
    } else {
      newExpanded.add(walletAddress)
    }
    setExpandedRows(newExpanded)
  }

  // Use redemption leaderboard data
  const allLeaders = angelicLeaders
    .map((leader, index) => ({ ...leader, rank: index + 1 }))

  const angelic = leaderboard.find((e) => e.side === 'Angelic')
  const demonic = leaderboard.find((e) => e.side === 'Demonic')
  const winner = leaderboard.length > 0 && leaderboard[0].score > leaderboard[1]?.score ? leaderboard[0] : null

  return (
    <div className="min-h-screen bg-black text-white">
        <Header showMusicControls={true} />
      
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-4 flex items-center justify-center gap-2 sm:gap-4">
            <Trophy className="h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 text-yellow-500" />
            Angels vs Demons Leaderboard
          </h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-yellow-500" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Angelic Side */}
            {angelic && (
              <div
                className={`relative border-2 rounded-lg p-8 ${
                  winner?.side === 'Angelic'
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-cyan-500/50 bg-black/60'
                }`}
              >
                {winner?.side === 'Angelic' && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-cyan-500 text-black px-4 py-1 rounded-full font-bold text-sm">
                      WINNING
                    </div>
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <h2 className="text-4xl font-black uppercase tracking-[0.2em] text-cyan-400 mb-2">
                    Angelic Forces
                  </h2>
                  <div className="text-6xl font-black text-cyan-400">
                    {angelic.score.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">Score</div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-black/40 rounded border border-cyan-500/30">
                    <div className="flex items-center gap-3">
                      <Sword className="h-5 w-5 text-cyan-400" />
                      <span className="text-gray-300">Total Battles</span>
                    </div>
                    <span className="text-2xl font-bold text-cyan-400">
                      {angelic.total_battles.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-black/40 rounded border border-red-500/30">
                    <div className="flex items-center gap-3">
                      <Skull className="h-5 w-5 text-red-400" />
                      <span className="text-gray-300">Total Deaths</span>
                    </div>
                    <span className="text-2xl font-bold text-red-400">
                      {angelic.total_deaths.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Demonic Side */}
            {demonic && (
              <div
                className={`relative border-2 rounded-lg p-8 ${
                  winner?.side === 'Demonic'
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-red-500/50 bg-black/60'
                }`}
              >
                {winner?.side === 'Demonic' && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-red-500 text-black px-4 py-1 rounded-full font-bold text-sm">
                      WINNING
                    </div>
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <h2 className="text-4xl font-black uppercase tracking-[0.2em] text-red-400 mb-2">
                    Demonic Forces
                  </h2>
                  <div className="text-6xl font-black text-red-400">
                    {demonic.score.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">Score</div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-black/40 rounded border border-red-500/30">
                    <div className="flex items-center gap-3">
                      <Sword className="h-5 w-5 text-red-400" />
                      <span className="text-gray-300">Total Battles</span>
                    </div>
                    <span className="text-2xl font-bold text-red-400">
                      {demonic.total_battles.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-black/40 rounded border border-red-500/30">
                    <div className="flex items-center gap-3">
                      <Skull className="h-5 w-5 text-red-400" />
                      <span className="text-gray-300">Total Deaths</span>
                    </div>
                    <span className="text-2xl font-bold text-red-400">
                      {demonic.total_deaths.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && leaderboard.length > 0 && (
          <div className="mt-8 text-center text-sm text-gray-500">
            Last updated: {new Date(leaderboard[0].last_updated).toLocaleString()}
          </div>
        )}

        {/* Individual Leaders */}
        {!loadingLeaders && allLeaders.length > 0 && (
          <div className="mt-16">
            <h2 className="text-3xl font-black uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
              <Medal className="h-8 w-8 text-yellow-500" />
              Top Individual Leaders
            </h2>

            {/* Points Legend */}
            {Object.keys(scoreConfig).length > 0 && (
              <div className="mb-6 rounded-lg border border-yellow-600/40 bg-black/60 p-4">
                <div className="text-xs font-mono text-yellow-200 font-semibold uppercase tracking-wide mb-3">How to Earn Points</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                  {scoreConfig['battles'] !== undefined && (
                    <div className="flex items-center gap-2">
                      <Sword className="h-3.5 w-3.5 text-yellow-400" />
                      <span className="text-gray-300">Battles:</span>
                      <span className="text-green-400 font-bold">+{scoreConfig['battles']}</span>
                    </div>
                  )}
                  {scoreConfig['heals'] !== undefined && (
                    <div className="flex items-center gap-2">
                      <Heart className="h-3.5 w-3.5 text-green-400" />
                      <span className="text-gray-300">Heals:</span>
                      <span className="text-green-400 font-bold">+{scoreConfig['heals']}</span>
                    </div>
                  )}
                  {scoreConfig['crystallizations'] !== undefined && (
                    <div className="flex items-center gap-2">
                      <Trophy className="h-3.5 w-3.5 text-purple-400" />
                      <span className="text-gray-300">Crystal:</span>
                      <span className="text-green-400 font-bold">+{scoreConfig['crystallizations']}</span>
                    </div>
                  )}
                  {scoreConfig['ascension_circles'] !== undefined && (
                    <div className="flex items-center gap-2">
                      <Medal className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-gray-300">Ascension:</span>
                      <span className="text-green-400 font-bold">+{scoreConfig['ascension_circles']}</span>
                    </div>
                  )}
                  {scoreConfig['killing_blows'] !== undefined && (
                    <div className="flex items-center gap-2">
                      <Skull className="h-3.5 w-3.5 text-yellow-400" />
                      <span className="text-gray-300">Slay Horde:</span>
                      <span className="text-green-400 font-bold">+{scoreConfig['killing_blows']}</span>
                    </div>
                  )}
                  {scoreConfig['burns'] !== undefined && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-purple-400" />
                      <span className="text-gray-300">Burns:</span>
                      <span className="text-green-400 font-bold">+{scoreConfig['burns']}</span>
                    </div>
                  )}
                  {scoreConfig['resurrections'] !== undefined && (
                    <div className="flex items-center gap-2">
                      <Heart className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-gray-300">Resurrections:</span>
                      <span className="text-red-400 font-bold">{scoreConfig['resurrections']}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-yellow-600/40 bg-black/60">
              <table className="w-full divide-y divide-yellow-800/50">
                <thead className="bg-yellow-900/20">
                  <tr>
                    <th className="px-3 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-yellow-200 w-12">
                      
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-yellow-200">
                      Rank
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-yellow-200 min-w-[140px]">
                      Name
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-yellow-200">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-900/40">
                  {allLeaders.map((leader) => {
                    const isExpanded = expandedRows.has(leader.wallet_address)
                    
                    return (
                      <>
                        <tr
                          key={leader.wallet_address}
                          onClick={() => toggleRow(leader.wallet_address)}
                          className="transition hover:bg-yellow-900/20 cursor-pointer"
                        >
                          <td className="px-3 py-3 text-center">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-yellow-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-yellow-400" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs font-bold text-amber-400">
                            #{leader.rank}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {leader.discord_avatar_url && !imageErrors.has(leader.wallet_address) ? (
                                <div className="relative h-5 w-5 rounded-full overflow-hidden bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
                                  <Image
                                    src={leader.discord_avatar_url}
                                    alt={leader.discord_username || 'Discord'}
                                    width={20}
                                    height={20}
                                    className="rounded-full"
                                    onError={() => {
                                      setImageErrors(prev => new Set(prev).add(leader.wallet_address))
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center">
                                  <svg className="h-3 w-3 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                                  </svg>
                                </div>
                              )}
                              <span className="text-xs text-gray-300">
                                {leader.discord_username || formatWallet(leader.wallet_address)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm font-bold text-amber-400">
                            {typeof leader.total_score === 'number' ? leader.total_score.toFixed(2) : Number(leader.total_score || 0).toFixed(2)}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${leader.wallet_address}-details`} className="bg-yellow-950/30">
                            <td colSpan={4} className="px-4 py-6">
                              <div className="overflow-x-auto">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs min-w-[600px]">
                                  <div className="flex flex-col p-3 rounded border border-yellow-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Army</div>
                                    <div className="text-base font-bold text-yellow-300">
                                      {leader.army_count.toLocaleString()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-cyan-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Angels</div>
                                    <div className="text-base font-bold text-cyan-300">
                                      {leader.angel_count.toLocaleString()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-red-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Demons</div>
                                    <div className="text-base font-bold text-red-300">
                                      {leader.demon_count.toLocaleString()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-yellow-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Battles</div>
                                    <div className="text-base font-bold text-yellow-300">
                                      {leader.battles_count.toLocaleString()}
                                      {(() => {
                                        const points = scoreConfig['battles'] ?? 1.0
                                        const score = leader.battles_count * points
                                        return <span className="text-green-400 ml-1 text-sm">({score > 0 ? '+' : ''}{score.toLocaleString()})</span>
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-green-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Heals</div>
                                    <div className="text-base font-bold text-green-300">
                                      {leader.heals_count.toLocaleString()}
                                      {(() => {
                                        const points = scoreConfig['heals'] ?? 0.5
                                        const score = leader.heals_count * points
                                        return <span className="text-green-400 ml-1 text-sm">({score > 0 ? '+' : ''}{score.toFixed(1)})</span>
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-purple-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Crystal</div>
                                    <div className="text-base font-bold text-purple-300">
                                      {leader.crystallization_count.toLocaleString()}
                                      {(() => {
                                        const points = scoreConfig['crystallizations'] ?? 1.0
                                        const score = leader.crystallization_count * points
                                        return <span className="text-green-400 ml-1 text-sm">({score > 0 ? '+' : ''}{score.toLocaleString()})</span>
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-amber-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Ascension</div>
                                    <div className="text-base font-bold text-amber-300">
                                      {leader.ascension_circle_count.toLocaleString()}
                                      {(() => {
                                        const points = scoreConfig['ascension_circles'] ?? 0.5
                                        const score = leader.ascension_circle_count * points
                                        return <span className="text-green-400 ml-1 text-sm">({score > 0 ? '+' : ''}{score.toFixed(1)})</span>
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-cyan-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Res</div>
                                    <div className="text-base font-bold text-cyan-300">
                                      {leader.resurrections_count.toLocaleString()}
                                      {(() => {
                                        const points = scoreConfig['resurrections'] ?? -10.0
                                        const score = leader.resurrections_count * points
                                        return <span className="text-red-400 ml-1 text-sm">({score < 0 ? '' : score > 0 ? '+' : ''}{score.toLocaleString()})</span>
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-yellow-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Kills</div>
                                    <div className="text-base font-bold text-yellow-400">
                                      {leader.killing_blows_count.toLocaleString()}
                                      {(() => {
                                        const points = scoreConfig['killing_blows'] ?? 50.0
                                        const score = leader.killing_blows_count * points
                                        return <span className="text-green-400 ml-1 text-sm">({score > 0 ? '+' : ''}{score.toLocaleString()})</span>
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-purple-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Burns</div>
                                    <div className="text-base font-bold text-purple-300">
                                      {leader.abyss_burns_count.toLocaleString()}
                                      {(() => {
                                        const points = scoreConfig['burns'] ?? 1.0
                                        const score = leader.abyss_burns_count * points
                                        return <span className="text-green-400 ml-1 text-sm">({score > 0 ? '+' : ''}{score.toLocaleString()})</span>
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex flex-col p-3 rounded border border-green-500/30 bg-black/40">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Mints</div>
                                    <div className="text-base font-bold text-gray-400">
                                      {leader.mints_count.toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loadingLeaders && (
          <div className="mt-16 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
          </div>
        )}
      </div>
      </div>
  )
}

