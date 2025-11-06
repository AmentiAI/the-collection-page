'use client'

import { useState, useEffect, useCallback } from 'react'

interface KarmaPoint {
  id: string
  points: number
  type: 'good' | 'evil'
  reason: string | null
  given_by: string | null
  created_at: string
}

interface Profile {
  id: string
  wallet_address: string
  username: string | null
  total_good_karma: number
  total_bad_karma: number
}

interface PointsHistoryProps {
  walletAddress: string | null
  chosenSide: 'good' | 'evil'
}

export default function PointsHistory({ walletAddress, chosenSide }: PointsHistoryProps) {
  const [karmaHistory, setKarmaHistory] = useState<KarmaPoint[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    if (!walletAddress) {
      setKarmaHistory([])
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/karma?walletAddress=${encodeURIComponent(walletAddress)}`)
      const data = await response.json()
      
      // Filter karma history to only show entries for the chosen side
      const allHistory = data.karmaHistory || []
      const historyType = chosenSide === 'evil' ? 'evil' : 'good'
      const filteredHistory = allHistory.filter((point: KarmaPoint) => point.type === historyType)
      
      setKarmaHistory(filteredHistory)
      setProfile(data.profile || null)
    } catch (error) {
      console.error('Error fetching karma history:', error)
    } finally {
      setLoading(false)
    }
  }, [walletAddress, chosenSide])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  if (!walletAddress) {
    return (
      <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-12 text-center">
        <div className="text-gray-400 font-mono text-lg mb-4">
          Connect your wallet to view your karma history
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile Summary */}
      {profile && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-black/60 backdrop-blur-sm border border-green-600/50 rounded-lg p-6">
            <div className="text-gray-400 text-sm font-mono uppercase mb-2">Good Karma</div>
            <div className="text-3xl font-bold text-green-500 font-mono">{profile.total_good_karma}</div>
          </div>
          <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
            <div className="text-gray-400 text-sm font-mono uppercase mb-2">Bad Karma</div>
            <div className="text-3xl font-bold text-red-500 font-mono">{profile.total_bad_karma}</div>
          </div>
          <div className="bg-black/60 backdrop-blur-sm border border-orange-600/50 rounded-lg p-6">
            <div className="text-gray-400 text-sm font-mono uppercase mb-2">Net Karma</div>
            <div className={`text-3xl font-bold font-mono ${
              profile.total_good_karma - profile.total_bad_karma >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {profile.total_good_karma - profile.total_bad_karma}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-red-600 font-mono text-lg animate-pulse">Loading history...</div>
        </div>
      ) : karmaHistory.length === 0 ? (
        <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-12 text-center">
          <div className="text-gray-400 font-mono text-lg">No karma history yet</div>
        </div>
      ) : (
        <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-black/80 border-b border-red-600/50">
                <tr>
                  <th className="px-6 py-4 text-left text-red-600 font-mono font-bold text-sm uppercase">Date</th>
                  <th className="px-6 py-4 text-left text-red-600 font-mono font-bold text-sm uppercase">Type</th>
                  <th className="px-6 py-4 text-left text-red-600 font-mono font-bold text-sm uppercase">Points</th>
                  <th className="px-6 py-4 text-left text-red-600 font-mono font-bold text-sm uppercase">Reason</th>
                  <th className="px-6 py-4 text-left text-red-600 font-mono font-bold text-sm uppercase">Given By</th>
                </tr>
              </thead>
              <tbody>
                {karmaHistory.map((point) => (
                  <tr
                    key={point.id}
                    className="border-b border-red-600/20 hover:bg-black/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-gray-300 font-mono text-sm">
                        {new Date(point.created_at).toLocaleDateString()} {new Date(point.created_at).toLocaleTimeString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded font-mono text-xs font-bold uppercase ${
                        point.type === 'good'
                          ? 'bg-green-600/20 text-green-500 border border-green-600/50'
                          : 'bg-red-600/20 text-red-500 border border-red-600/50'
                      }`}>
                        {point.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-mono font-bold ${
                        point.type === 'good' ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {point.type === 'good' ? '+' : '-'}{Math.abs(point.points)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-400 font-mono text-sm">
                        {point.reason || 'No reason provided'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-500 font-mono text-xs">
                        {point.given_by ? `${point.given_by.slice(0, 8)}...` : 'System'}
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


