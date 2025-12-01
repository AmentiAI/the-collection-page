'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import { Loader2, TrendingUp, TrendingDown, Coins, DollarSign, Activity } from 'lucide-react'
import Image from 'next/image'

interface FlashnetPool {
  lp_public_key: string
  asset_a_symbol: string | null
  asset_b_symbol: string | null
  asset_a_name: string | null
  asset_b_name: string | null
  tvl_asset_b: number | null
  volume_24h_asset_b: number | null
  current_price_a_in_b: number | null
  price_change_percent_24h: number | null
  lp_fee_bps: number | null
  host_fee_bps: number | null
  asset_a_metadata: {
    icon_url: string | null
    ticker: string | null
    name: string | null
  } | null
  asset_b_metadata: {
    icon_url: string | null
    ticker: string | null
    name: string | null
  } | null
}

export default function SparkPage() {
  const [pools, setPools] = useState<FlashnetPool[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const limit = 20

  useEffect(() => {
    fetchPools()
    // Refresh every 60 seconds
    const interval = setInterval(fetchPools, 60000)
    return () => clearInterval(interval)
  }, [page])

  const fetchPools = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/flashnet/pools?limit=${limit}&offset=${page * limit}`)
      if (!response.ok) throw new Error('Failed to fetch pools')
      
      const data = await response.json()
      if (data.success) {
        setPools(data.pools || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Error fetching pools:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number | null | string) => {
    if (value === null || value === undefined) return 'N/A'
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num) || !isFinite(num)) return 'N/A'
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  }

  const formatNumber = (value: number | null | string) => {
    if (value === null || value === undefined) return 'N/A'
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num) || !isFinite(num)) return 'N/A'
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 })
  }

  const formatPercent = (value: number | null | string) => {
    if (value === null || value === undefined) return 'N/A'
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num) || !isFinite(num)) return 'N/A'
    const sign = num >= 0 ? '+' : ''
    return `${sign}${num.toFixed(2)}%`
  }

  const getTokenSymbol = (pool: FlashnetPool, side: 'a' | 'b') => {
    const metadata = side === 'a' ? pool.asset_a_metadata : pool.asset_b_metadata
    if (metadata?.ticker) return metadata.ticker
    return side === 'a' ? pool.asset_a_symbol : pool.asset_b_symbol
  }

  const getTokenIcon = (pool: FlashnetPool, side: 'a' | 'b') => {
    const metadata = side === 'a' ? pool.asset_a_metadata : pool.asset_b_metadata
    return metadata?.icon_url || null
  }

  const getPoolName = (pool: FlashnetPool) => {
    const symbolA = getTokenSymbol(pool, 'a')
    const symbolB = getTokenSymbol(pool, 'b')
    if (symbolA && symbolB) return `${symbolA}/${symbolB}`
    
    const nameA = pool.asset_a_name || symbolA
    const nameB = pool.asset_b_name || symbolB
    if (nameA && nameB) return `${nameA}/${nameB}`
    
    return 'Unknown Pool'
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="min-h-screen bg-black text-white">
      <Header showMusicControls={true} />
      
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black uppercase tracking-[0.3em] mb-4 flex items-center justify-center gap-4">
            <Coins className="h-12 w-12 text-yellow-500" />
            Spark Tokens
          </h1>
          <p className="text-gray-400 text-lg">
            Flashnet liquidity pools and trading pairs
          </p>
        </div>

        {loading && pools.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-yellow-500" />
          </div>
        ) : pools.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-xl">No pools available yet. Syncing...</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pools.map((pool) => {
                const poolName = getPoolName(pool)
                const iconA = getTokenIcon(pool, 'a')
                const iconB = getTokenIcon(pool, 'b')
                const priceChange = pool.price_change_percent_24h
                const isPositive = priceChange !== null && priceChange >= 0

                return (
                  <div
                    key={pool.lp_public_key}
                    className="border-2 border-yellow-500/50 rounded-lg p-6 bg-black/60 hover:bg-black/80 transition-colors"
                  >
                    {/* Pool Header */}
                    <div className="flex items-center gap-3 mb-4">
                      {iconA && (
                        <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-yellow-500/50">
                          <Image
                            src={iconA}
                            alt={getTokenSymbol(pool, 'a') || 'Token A'}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      )}
                      {iconB && (
                        <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-yellow-500/50 -ml-3">
                          <Image
                            src={iconB}
                            alt={getTokenSymbol(pool, 'b') || 'Token B'}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-yellow-400 truncate">
                          {poolName}
                        </h3>
                        <p className="text-xs text-gray-500 font-mono truncate">
                          {pool.lp_public_key.slice(0, 8)}...{pool.lp_public_key.slice(-6)}
                        </p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-400">
                          <DollarSign className="h-4 w-4" />
                          <span className="text-sm">TVL</span>
                        </div>
                        <span className="text-lg font-bold text-yellow-400">
                          {formatCurrency(pool.tvl_asset_b)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Activity className="h-4 w-4" />
                          <span className="text-sm">24h Volume</span>
                        </div>
                        <span className="text-lg font-bold text-white">
                          {formatCurrency(pool.volume_24h_asset_b)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Price</span>
                        <span className="text-sm font-mono text-white">
                          {formatNumber(pool.current_price_a_in_b)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">24h Change</span>
                        <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          <span className="text-sm font-bold">
                            {formatPercent(priceChange)}
                          </span>
                        </div>
                      </div>

                      {(pool.lp_fee_bps !== null || pool.host_fee_bps !== null) && (
                        <div className="pt-2 border-t border-yellow-500/20">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>LP Fee</span>
                            <span>{pool.lp_fee_bps !== null ? `${pool.lp_fee_bps} bps` : 'N/A'}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                            <span>Host Fee</span>
                            <span>{pool.host_fee_bps !== null ? `${pool.host_fee_bps} bps` : 'N/A'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0 || loading}
                  className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/50 rounded hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-gray-400">
                  Page {page + 1} of {totalPages} ({total} total)
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1 || loading}
                  className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/50 rounded hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

