'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, Skull, AlertCircle } from 'lucide-react'
import Image from 'next/image'

type WalletData = {
  walletAddress: string
  graverobableCount: number
  discordUsername: string | null
  ascensionPowder: number
  avatarUrl: string | null
}

type GraverobDataResponse = {
  success: boolean
  staleThresholdDays?: number
  staleThresholdDate?: string
  totalWallets?: number
  totalEligibleGraves?: number
  wallets?: WalletData[]
  error?: string
}

export default function GraveRobbingAdminPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<GraverobDataResponse | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/admin/graverobbing', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Failed to load data (${response.status})`)
      }

      const result: GraverobDataResponse = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load graverobbing data')
      }

      setData(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load graverobbing data.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredWallets = (data?.wallets || []).filter((wallet) => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return true

    return (
      wallet.walletAddress.toLowerCase().includes(term) ||
      wallet.discordUsername?.toLowerCase().includes(term)
    )
  })

  const truncateWallet = (addr: string) => {
    if (addr.length <= 16) return addr
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2 text-red-500 flex items-center gap-3">
              <Skull className="h-8 w-8" />
              Grave Robbing Admin
            </h1>
            <p className="text-gray-400">
              Monitor eligible graves by wallet (abandoned for 7+ days)
            </p>
          </div>

          <Button
            onClick={loadData}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-600 rounded text-red-400">
            <strong>Error:</strong> {error}
          </div>
        )}

        {data && (
          <>
            <div className="mb-6 p-4 bg-gray-900 rounded border border-gray-700 grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Total Wallets:</span>
                <span className="ml-2 font-bold text-white">{data.totalWallets}</span>
              </div>
              <div>
                <span className="text-gray-400">Total Eligible Graves:</span>
                <span className="ml-2 font-bold text-red-500">{data.totalEligibleGraves}</span>
              </div>
              <div>
                <span className="text-gray-400">Stale Threshold:</span>
                <span className="ml-2 font-bold text-amber-500">{data.staleThresholdDays} days</span>
              </div>
              <div>
                <span className="text-gray-400">As of:</span>
                <span className="ml-2 font-bold text-gray-300">
                  {data.staleThresholdDate ? new Date(data.staleThresholdDate).toLocaleString() : 'N/A'}
                </span>
              </div>
            </div>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by wallet or discord username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="bg-gray-900 rounded border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-800 border-b border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Avatar
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Wallet Address
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Discord Username
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Eligible Graves
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Powder
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredWallets.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          {searchTerm ? 'No matching wallets found' : 'No eligible graves found'}
                        </td>
                      </tr>
                    ) : (
                      filteredWallets.map((wallet) => (
                        <tr key={wallet.walletAddress} className="hover:bg-gray-800/50 transition">
                          <td className="px-4 py-3">
                            {wallet.avatarUrl ? (
                              <Image
                                src={wallet.avatarUrl}
                                alt="Avatar"
                                width={32}
                                height={32}
                                className="rounded-full"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                <Skull className="h-4 w-4 text-gray-500" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-mono text-sm text-white" title={wallet.walletAddress}>
                                {truncateWallet(wallet.walletAddress)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-300">
                              {wallet.discordUsername || <span className="text-gray-600 italic">Not set</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {wallet.graverobableCount > 0 && (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className="font-bold text-red-400">
                                {wallet.graverobableCount}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono text-sm text-amber-400">
                              {wallet.ascensionPowder.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-500 text-center">
              Showing {filteredWallets.length} of {data.wallets?.length || 0} wallets
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div className="text-center py-12 text-gray-500">
            Click &quot;Refresh&quot; to load graverobbing data
          </div>
        )}
      </div>
    </div>
  )
}

