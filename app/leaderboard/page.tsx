'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import { Loader2, Trophy, Sword, Shield, Skull, Heart, Medal } from 'lucide-react'
import { GlobalStartTimeGate } from '@/components/GlobalStartTimeGate'

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
  trait: 'Angelic' | 'Demonic'
  total_battles: number
  total_deaths: number
  total_resurrections: number
  score: number
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [angelicLeaders, setAngelicLeaders] = useState<IndividualLeader[]>([])
  const [demonicLeaders, setDemonicLeaders] = useState<IndividualLeader[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLeaders, setLoadingLeaders] = useState(true)

  useEffect(() => {
    fetchLeaderboard()
    fetchIndividualLeaders()
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchLeaderboard()
      fetchIndividualLeaders()
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

  const fetchIndividualLeaders = async () => {
    try {
      setLoadingLeaders(true)
      const [angelicResponse, demonicResponse] = await Promise.all([
        fetch('/api/leaderboard/individual?side=Angelic&limit=10'),
        fetch('/api/leaderboard/individual?side=Demonic&limit=10'),
      ])

      if (angelicResponse.ok) {
        const angelicData = await angelicResponse.json()
        if (angelicData.success) {
          setAngelicLeaders(angelicData.leaders)
        }
      }

      if (demonicResponse.ok) {
        const demonicData = await demonicResponse.json()
        if (demonicData.success) {
          setDemonicLeaders(demonicData.leaders)
        }
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

  const angelic = leaderboard.find((e) => e.side === 'Angelic')
  const demonic = leaderboard.find((e) => e.side === 'Demonic')
  const winner = leaderboard.length > 0 && leaderboard[0].score > leaderboard[1]?.score ? leaderboard[0] : null

  return (
    <GlobalStartTimeGate pageName="Leaderboard">
      <div className="min-h-screen bg-black text-white">
        <Header showMusicControls={true} />
      
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black uppercase tracking-[0.3em] mb-4 flex items-center justify-center gap-4">
            <Trophy className="h-12 w-12 text-yellow-500" />
            Angels vs Demons Leaderboard
          </h1>
          <p className="text-gray-400 text-lg">
            Score = Total Battles - Total Deaths
          </p>
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

                  <div className="flex items-center justify-between p-4 bg-black/40 rounded border border-green-500/30">
                    <div className="flex items-center gap-3">
                      <Heart className="h-5 w-5 text-green-400" />
                      <span className="text-gray-300">Resurrections</span>
                    </div>
                    <span className="text-2xl font-bold text-green-400">
                      {angelic.total_resurrections.toLocaleString()}
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

                  <div className="flex items-center justify-between p-4 bg-black/40 rounded border border-green-500/30">
                    <div className="flex items-center gap-3">
                      <Heart className="h-5 w-5 text-green-400" />
                      <span className="text-gray-300">Resurrections</span>
                    </div>
                    <span className="text-2xl font-bold text-green-400">
                      {demonic.total_resurrections.toLocaleString()}
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
        {!loadingLeaders && (angelicLeaders.length > 0 || demonicLeaders.length > 0) && (
          <div className="mt-16">
            <h2 className="text-3xl font-black uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
              <Medal className="h-8 w-8 text-yellow-500" />
              Top Individual Leaders
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Top Angelic Leaders */}
              {angelicLeaders.length > 0 && (
                <div className="border-2 border-cyan-500/50 rounded-lg p-6 bg-black/60">
                  <h3 className="text-2xl font-black uppercase tracking-[0.2em] text-cyan-400 mb-6">
                    Top Angels
                  </h3>
                  <div className="space-y-3">
                    {angelicLeaders.map((leader, index) => (
                      <div
                        key={leader.wallet_address}
                        className="flex items-center justify-between p-4 bg-black/40 rounded border border-cyan-500/30"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 border-2 border-cyan-500/50 flex items-center justify-center font-bold text-cyan-400">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm text-gray-300 truncate">
                              {formatWallet(leader.wallet_address)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {leader.total_battles} battles • {leader.total_deaths} deaths • {leader.total_resurrections} res
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-cyan-400">
                            {leader.score.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">score</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Demonic Leaders */}
              {demonicLeaders.length > 0 && (
                <div className="border-2 border-red-500/50 rounded-lg p-6 bg-black/60">
                  <h3 className="text-2xl font-black uppercase tracking-[0.2em] text-red-400 mb-6">
                    Top Demons
                  </h3>
                  <div className="space-y-3">
                    {demonicLeaders.map((leader, index) => (
                      <div
                        key={leader.wallet_address}
                        className="flex items-center justify-between p-4 bg-black/40 rounded border border-red-500/30"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center font-bold text-red-400">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm text-gray-300 truncate">
                              {formatWallet(leader.wallet_address)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {leader.total_battles} battles • {leader.total_deaths} deaths • {leader.total_resurrections} res
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-red-400">
                            {leader.score.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">score</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
    </GlobalStartTimeGate>
  )
}

