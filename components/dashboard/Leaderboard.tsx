'use client'

import { useState, useEffect } from 'react'

interface LeaderboardEntry {
  id: string
  wallet_address: string
  username: string | null
  total_points: number
  rank: number
  total_good_karma: number
  total_bad_karma: number
}

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [badLeaderboard, setBadLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'good' | 'bad'>('good')

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const fetchLeaderboard = async () => {
    setLoading(true)
    try {
      const [goodRes, badRes] = await Promise.all([
        fetch('/api/leaderboard?type=good&limit=50'),
        fetch('/api/leaderboard?type=bad&limit=50')
      ])
      
      const goodData = await goodRes.json()
      const badData = await badRes.json()
      
      setLeaderboard(goodData.leaderboard || [])
      setBadLeaderboard(badData.leaderboard || [])
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const displayLeaderboard = activeTab === 'good' ? leaderboard : badLeaderboard

  return (
    <div className="space-y-6">
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('good')}
          className={`px-6 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
            activeTab === 'good'
              ? 'bg-green-600/80 border-green-600 text-white'
              : 'bg-black/60 border-green-600/50 text-green-600 hover:bg-green-600/20'
          }`}
        >
          Good Karma ⬆️
        </button>
        <button
          onClick={() => setActiveTab('bad')}
          className={`px-6 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
            activeTab === 'bad'
              ? 'bg-red-600/80 border-red-600 text-white'
              : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
          }`}
        >
          Bad Karma ⬇️
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="text-red-600 font-mono text-lg animate-pulse">Loading leaderboard...</div>
        </div>
      ) : displayLeaderboard.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 font-mono text-lg">No entries yet</div>
        </div>
      ) : (
        <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black/80 border-b border-red-600/50">
                <tr>
                  <th className="px-6 py-4 text-left text-red-600 font-mono font-bold text-sm uppercase">Rank</th>
                  <th className="px-6 py-4 text-left text-red-600 font-mono font-bold text-sm uppercase">Wallet</th>
                  <th className="px-6 py-4 text-left text-red-600 font-mono font-bold text-sm uppercase">Username</th>
                  <th className="px-6 py-4 text-right text-red-600 font-mono font-bold text-sm uppercase">
                    {activeTab === 'good' ? 'Good Karma' : 'Bad Karma'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayLeaderboard.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className="border-b border-red-600/20 hover:bg-black/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {entry.rank === 1 && <span className="text-yellow-500 text-xl">🥇</span>}
                        {entry.rank === 2 && <span className="text-gray-400 text-xl">🥈</span>}
                        {entry.rank === 3 && <span className="text-orange-600 text-xl">🥉</span>}
                        <span className={`font-mono font-bold ${
                          entry.rank <= 3 ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          #{entry.rank}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-300 font-mono text-sm">
                        {entry.wallet_address.slice(0, 8)}...{entry.wallet_address.slice(-6)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-400 font-mono text-sm">
                        {entry.username || 'Anonymous'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-mono font-bold text-lg ${
                        activeTab === 'good' ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {entry.total_points.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


