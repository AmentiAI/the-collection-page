'use client'

import { useState, useEffect, useMemo } from 'react'
import Header from '@/components/Header'
import { Loader2, TrendingUp, TrendingDown, Coins, DollarSign, Activity, ArrowUp, ArrowDown, ArrowUpDown, Star } from 'lucide-react'
import Image from 'next/image'

interface FlashnetPool {
  lp_public_key: string
  asset_a_address: string | null
  asset_b_address: string | null
  asset_a_symbol: string | null
  asset_b_symbol: string | null
  asset_a_name: string | null
  asset_b_name: string | null
  asset_a_reserve: number | null
  asset_b_reserve: number | null
  asset_a_decimals: number | null
  asset_b_decimals: number | null
  tvl_asset_b: number | null
  volume_24h_asset_b: number | null
  current_price_a_in_b: number | null
  price_change_percent_24h: number | null
  lp_fee_bps: number | null
  host_fee_bps: number | null
  created_at: string | null
  asset_a_metadata: {
    icon_url: string | null
    ticker: string | null
    name: string | null
    max_supply: string | null
    decimals: number | null
    holders?: number | null
    token_identifier?: string | null
    token_address?: string | null
  } | null
  asset_b_metadata: {
    icon_url: string | null
    ticker: string | null
    name: string | null
    max_supply: string | null
    decimals: number | null
    holders?: number | null
    token_identifier?: string | null
    token_address?: string | null
  } | null
}

type SortColumn = 'pair' | 'token' | 'price' | 'mc' | 'liquidity' | 'supply' | 'holders' | 'volume' | 'change' | 'lpFee' | 'hostFee' | 'created'
type SortDirection = 'asc' | 'desc' | null

export default function SparkPage() {
  const [pools, setPools] = useState<FlashnetPool[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [filteredTotal, setFilteredTotal] = useState(0) // Total after filtering
  const [btcPrice, setBtcPrice] = useState<number | null>(null)
  const [metadataCache, setMetadataCache] = useState<Map<string, { max_supply: string | null; decimals: number | null }>>(new Map())
  const [metadataFetchPending, setMetadataFetchPending] = useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = useState<SortColumn | null>('change')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [hideLowCap, setHideLowCap] = useState(true) // Pre-selected: hide market caps below $4000
  const [favorites, setFavorites] = useState<Set<string>>(new Set()) // Favorite pool lp_public_keys
  const limit = 20

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('spark-favorites')
      if (stored) {
        setFavorites(new Set(JSON.parse(stored)))
      }
    } catch (error) {
      console.warn('Failed to load favorites from localStorage:', error)
    }
  }, [])

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('spark-favorites', JSON.stringify(Array.from(favorites)))
    } catch (error) {
      console.warn('Failed to save favorites to localStorage:', error)
    }
  }, [favorites])

  const toggleFavorite = (lpPublicKey: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(lpPublicKey)) {
        newFavorites.delete(lpPublicKey)
      } else {
        newFavorites.add(lpPublicKey)
      }
      return newFavorites
    })
  }

  const isFavorite = (lpPublicKey: string) => favorites.has(lpPublicKey)

  // Fetch pools when page, sorting, or filter changes (server-side pagination/filtering/sorting)
  useEffect(() => {
    fetchPools()
    fetchBtcPrice()
    // Refresh every 15 seconds when page is visible (for trading data freshness)
    // Only poll when tab is active to save resources
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchPools()
        fetchBtcPrice()
      }
    }, 15000) // 15 seconds - faster updates for trading data
    return () => clearInterval(interval)
  }, [page, sortColumn, sortDirection, hideLowCap]) // Refetch when these change

  // Reset to page 0 when sorting or filter changes
  useEffect(() => {
    setPage(0)
  }, [sortColumn, sortDirection, hideLowCap])

  const fetchBtcPrice = async () => {
    try {
      // Get BTC price from our API (stored in database by cron job)
      const response = await fetch('/api/flashnet/btc-price')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.price) {
          setBtcPrice(data.price)
        }
      } else {
        console.warn('BTC price not available from database yet - waiting for cron job to sync')
      }
    } catch (error) {
      console.error('Error fetching BTC price:', error)
    }
  }

  const fetchTokenMetadataBatch = async (tokenIdentifiers: string[]) => {
    if (!tokenIdentifiers.length) return

    // Filter out tokens already in cache or pending
    const tokensToFetch = tokenIdentifiers.filter(token => 
      !metadataCache.has(token) && !metadataFetchPending.has(token)
    )
    if (!tokensToFetch.length) return

    // Mark as pending
    setMetadataFetchPending(prev => {
      const newSet = new Set(prev)
      tokensToFetch.forEach(token => newSet.add(token))
      return newSet
    })

    try {
      const response = await fetch('/api/flashnet/token-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: tokensToFetch }),
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.metadata) {
          // Update cache with all fetched metadata
          setMetadataCache(prev => {
            const newCache = new Map(prev)
            for (const [token, metadata] of Object.entries(data.metadata)) {
              if (metadata && typeof metadata === 'object') {
                newCache.set(token.toLowerCase(), {
                  max_supply: (metadata as any).max_supply,
                  decimals: (metadata as any).decimals,
                })
              }
            }
            return newCache
          })
        }
      }
    } catch (error) {
      console.warn('[Spark] Failed to fetch metadata batch:', error)
    } finally {
      // Remove from pending
      setMetadataFetchPending(prev => {
        const newSet = new Set(prev)
        tokensToFetch.forEach(token => newSet.delete(token))
        return newSet
      })
    }
  }

  const fetchPools = async () => {
    try {
      setLoading(true)
      
      // Build query params for server-side pagination, filtering, and sorting
      const params = new URLSearchParams({
        page: (page + 1).toString(), // API uses 1-based pages
        limit: limit.toString(),
      })
      
      // Add filter parameter if hideLowCap is enabled
      // Note: Market cap filtering requires client-side calculation, so we'll fetch all and filter client-side for now
      // TODO: Implement server-side market cap filtering in the API
      if (hideLowCap) {
        params.set('filter', 'low_caps') // For future server-side filtering
      }
      
      // Add sorting parameters
      if (sortColumn && sortDirection) {
        // Map sortColumn to sortType format
        const sortTypeMap: Record<SortColumn, string> = {
          'volume': 'volume',
          'change': '24_hr_change',
          'lpFee': 'lp_fee',
          'hostFee': 'host_fee',
          'created': 'created',
          'pair': 'pair', // Client-side only
          'token': 'token', // Client-side only
          'price': 'price', // Client-side only
          'mc': 'mc', // Client-side only
          'liquidity': 'liquidity', // Client-side only
          'supply': 'supply', // Client-side only
          'holders': 'holders', // Client-side only
        }
        
        const sortType = sortTypeMap[sortColumn]
        if (sortType) {
          params.set('sortType', sortType)
          // Map sortDirection: 'asc' -> '0', 'desc' -> '1'
          params.set('sortDirection', sortDirection === 'asc' ? '0' : '1')
        }
      }
      
      const response = await fetch(`/api/flashnet/pools?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch pools')
      
      const data = await response.json()
      if (data.success) {
        // Debug: log API response
        console.log('[Spark] API Response:', {
          poolsCount: data.pools?.length || 0,
          total: data.total,
          count: data.count,
        })
        data.pools?.forEach((pool: FlashnetPool, idx: number) => {
          const poolName = getPoolName(pool)
 
        })
        // Filter out pools where Asset A is Bitcoin (BTC/TOKEN pools)
        // We only want to show TOKEN/BTC pools, not BTC/TOKEN
        const BTC_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202"
        const filteredPools = (data.pools || []).filter((pool: FlashnetPool) => {
          // Skip if Asset A is Bitcoin
          if (pool.asset_a_address === BTC_PUBKEY || pool.asset_a_address?.toLowerCase() === BTC_PUBKEY.toLowerCase()) {
            return false
          }
          return true
        })
        setPools(filteredPools)
        // Store the total from API (this is the total count from database after server-side filtering)
        // Note: We still filter out BTC/TOKEN pools client-side, so the count might be slightly off
        // TODO: Move BTC/TOKEN filtering to server-side
          if (data.total !== undefined && data.total !== null) {
            setTotal(data.total)
          } else {
            setTotal(filteredPools.length)
        }
        
        // Note: filteredTotal will be calculated after filtering below
        
        // Fetch missing metadata for tokens without max_supply (batch request with debounce)
        const tokensToFetch = new Set<string>()
        filteredPools.forEach((pool: FlashnetPool) => {
          if (pool.asset_a_address && 
              !pool.asset_a_metadata?.max_supply && 
              !metadataCache.has(pool.asset_a_address) &&
              !metadataCache.has(pool.asset_a_address.toLowerCase()) &&
              pool.asset_a_address !== BTC_PUBKEY &&
              pool.asset_a_address.toLowerCase() !== BTC_PUBKEY.toLowerCase()) {
            tokensToFetch.add(pool.asset_a_address)
          }
        })
        
        // Fetch metadata in batch with a small delay to debounce rapid updates
        if (tokensToFetch.size > 0) {
          setTimeout(() => {
            fetchTokenMetadataBatch(Array.from(tokensToFetch))
              .catch(err => console.warn('[Spark] Error fetching missing metadata:', err))
          }, 500) // 500ms debounce
        }
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
    const absNum = Math.abs(num)
    if (absNum >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`
    if (absNum >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
    if (absNum >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
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

  // Calculate minutes since creation
  const getMinutesSinceCreation = (createdAt: string | null): number | null => {
    if (!createdAt) return null
    const created = new Date(createdAt)
    if (isNaN(created.getTime())) return null
    const now = new Date()
    const diffMs = now.getTime() - created.getTime()
    return Math.floor(diffMs / (1000 * 60)) // Convert to minutes
  }

  // Format minutes since creation for display
  const formatMinutesAgo = (minutes: number | null): string => {
    if (minutes === null) return 'N/A'
    if (minutes < 1) return '<1m'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours < 24) return `${hours}h ${mins}m`
    const days = Math.floor(hours / 24)
    const hrs = hours % 24
    return `${days}d ${hrs}h`
  }

  const getTokenSymbol = (pool: FlashnetPool, side: 'a' | 'b') => {
    const metadata = side === 'a' ? pool.asset_a_metadata : pool.asset_b_metadata
    if (metadata?.ticker) return metadata.ticker
    const symbol = side === 'a' ? pool.asset_a_symbol : pool.asset_b_symbol
    return symbol || null
  }

  const getTokenName = (pool: FlashnetPool, side: 'a' | 'b') => {
    const address = side === 'a' ? pool.asset_a_address : pool.asset_b_address
    const metadata = side === 'a' ? pool.asset_a_metadata : pool.asset_b_metadata
    const name = side === 'a' ? pool.asset_a_name : pool.asset_b_name
    const symbol = side === 'a' ? pool.asset_a_symbol : pool.asset_b_symbol
    
    // Check if this is actually Bitcoin
    const BTC_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202"
    const isBitcoin = address === BTC_PUBKEY || address?.toLowerCase() === BTC_PUBKEY.toLowerCase()
    
    // Check if metadata is for Bitcoin
    const metadataIsBitcoin = metadata?.ticker?.toLowerCase() === 'btc' || 
                               metadata?.name?.toLowerCase() === 'bitcoin' ||
                               (metadata?.token_identifier?.toLowerCase() ?? '') === BTC_PUBKEY.toLowerCase() ||
                               (metadata?.token_address?.toLowerCase() ?? '') === BTC_PUBKEY.toLowerCase()
    
    // Only use metadata name if it matches the actual token (not Bitcoin metadata for non-Bitcoin tokens)
    if (metadata?.name && (isBitcoin === metadataIsBitcoin)) {
      return metadata.name
    }
    
    // Prefer direct name from pool data
    if (name) return name
    
    // Fallback: try to get from symbol if name is missing
    if (symbol) return symbol
    
    return null
  }

  const getTokenIcon = (pool: FlashnetPool, side: 'a' | 'b') => {
    const metadata = side === 'a' ? pool.asset_a_metadata : pool.asset_b_metadata
    return metadata?.icon_url || null
  }

  const formatAddress = (address: string | null) => {
    if (!address) return 'Unknown'
    return `${address.slice(0, 6)}…${address.slice(-4)}`
  }

  const isBitcoinAsset = (address: string | null, name: string | null, symbol: string | null, metadata: any): boolean => {
    // Bitcoin's official identifier in Flashnet (from docs: https://docs.flashnet.xyz/products/flashnet-amm/swaps)
    const BTC_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202"
    
    // If we have explicit Bitcoin indicators, return true
    const lowerName = (name || metadata?.name || '').toLowerCase()
    const lowerSymbol = (symbol || metadata?.ticker || '').toLowerCase()
    
    if (lowerName.includes('bitcoin') || lowerSymbol === 'btc') {
      return true
    }
    
    // Check for Bitcoin's official Flashnet identifier
    if (address === BTC_PUBKEY || address?.toLowerCase() === BTC_PUBKEY.toLowerCase()) {
      return true
    }
    
    // Check address patterns - Bitcoin in Flashnet often has empty/null/zero addresses
    if (!address || address === null) {
      return true
    }
    
    const lowerAddress = address.toLowerCase().trim()
    if (lowerAddress === '' || lowerAddress === '0' || lowerAddress === 'null' || lowerAddress === 'undefined') {
      return true
    }
    
    // Check for all-zero hex addresses (common for native Bitcoin)
    if (/^0+$/.test(lowerAddress.replace(/^0x/, ''))) {
      return true
    }
    
    // Check for the pattern 0202020202... (all 0x02 bytes) - Bitcoin's identifier
    if (/^02+$/.test(lowerAddress) && lowerAddress.length === 64) {
      return true
    }
    
    return false
  }

  const getPoolName = (pool: FlashnetPool) => {
    // Always try to get both symbols/names - prioritize symbols for pair name
    let symbolA = getTokenSymbol(pool, 'a')
    let symbolB = getTokenSymbol(pool, 'b')
    let nameA = getTokenName(pool, 'a')
    let nameB = getTokenName(pool, 'b')
    
    // Check if Asset A is Bitcoin - be more aggressive about detection
    const isAssetABitcoin = isBitcoinAsset(pool.asset_a_address, pool.asset_a_name, pool.asset_a_symbol, pool.asset_a_metadata)
    if (isAssetABitcoin && !symbolA && !nameA) {
      // If it's Bitcoin and we don't have a symbol/name, use BTC
      symbolA = 'BTC'
      nameA = 'Bitcoin'
    }
    
    // Check if Asset B is Bitcoin
    const isAssetBBitcoin = isBitcoinAsset(pool.asset_b_address, pool.asset_b_name, pool.asset_b_symbol, pool.asset_b_metadata)
    if (isAssetBBitcoin && !symbolB && !nameB) {
      // If it's Bitcoin and we don't have a symbol/name, use BTC
      symbolB = 'BTC'
      nameB = 'Bitcoin'
    }
    
    // Additional heuristic: In Flashnet pools, missing assets are often Bitcoin
    // If Asset A has no symbol/name/metadata but Asset B has data, assume A is BTC
    if (!symbolA && !nameA && !pool.asset_a_metadata && (symbolB || nameB || pool.asset_b_metadata)) {
      symbolA = 'BTC'
      nameA = 'Bitcoin'
    }
    
    // Reverse case: If Asset B is missing but Asset A has data, assume B is BTC
    if (!symbolB && !nameB && !pool.asset_b_metadata && (symbolA || nameA || pool.asset_a_metadata)) {
      symbolB = 'BTC'
      nameB = 'Bitcoin'
    }
    
 
    
    // Prefer symbols for pair display (e.g., "BTC/DRAGON")
    if (symbolA && symbolB) return `${symbolA}/${symbolB}`
    if (symbolA && nameB) return `${symbolA}/${nameB}`
    if (nameA && symbolB) return `${nameA}/${symbolB}`
    if (nameA && nameB) return `${nameA}/${nameB}`
    
    // Try single values
    if (symbolA) {
      if (symbolB || nameB) return `${symbolA}/${symbolB || nameB}`
      return `${symbolA}/?`
    }
    if (symbolB) {
      if (symbolA || nameA) return `${symbolA || nameA}/${symbolB}`
      return `?/${symbolB}`
    }
    if (nameA) {
      if (nameB || symbolB) return `${nameA}/${nameB || symbolB}`
      return `${nameA}/?`
    }
    if (nameB) {
      if (nameA || symbolA) return `${nameA || symbolA}/${nameB}`
      return `?/${nameB}`
    }
    
    // Fall back to addresses
    const addrA = formatAddress(pool.asset_a_address)
    const addrB = formatAddress(pool.asset_b_address)
    return `${addrA}/${addrB}`
  }

  const getTokenPrice = (pool: FlashnetPool, side: 'a' | 'b') => {
    // Price calculation: For token B, we need price in USD
    // If Asset A is BTC, we can use BTC price to convert
    // TVL is in asset B terms (usually BTC or USD equivalent)
    
    const decimalsA = pool.asset_a_metadata?.decimals ?? pool.asset_a_decimals ?? 0
    const decimalsB = pool.asset_b_metadata?.decimals ?? pool.asset_b_decimals ?? 0
    
    if (side === 'b') {
      // Price of B (the token) in USD
      // If Asset A is BTC, we can calculate: price_B = (reserve_A * BTC_price) / reserve_B
      
      const isAssetABitcoin = isBitcoinAsset(pool.asset_a_address, pool.asset_a_name, pool.asset_a_symbol, pool.asset_a_metadata)
      
      if (isAssetABitcoin && btcPrice && pool.asset_a_reserve && pool.asset_b_reserve && pool.asset_b_reserve > 0) {
        // Asset A is BTC, so we can calculate price in USD
        const adjustedReserveA = pool.asset_a_reserve / Math.pow(10, decimalsA) // BTC amount
        const adjustedReserveB = pool.asset_b_reserve / Math.pow(10, decimalsB) // Token B amount
        
        // Price of B in USD = (BTC reserve * BTC price) / Token B reserve
        const priceInUSD = (adjustedReserveA * btcPrice) / adjustedReserveB
        
        // Sanity check
        if (priceInUSD > 0 && priceInUSD < 1_000_000) {
          return priceInUSD
        }
      }
      
      // Fallback: Use TVL method if available
      // TVL is in asset B terms (BTC), so we need to convert to USD
      if (pool.tvl_asset_b !== null && pool.tvl_asset_b !== undefined && pool.asset_b_reserve) {
        const adjustedReserveB = pool.asset_b_reserve / Math.pow(10, decimalsB)
        if (adjustedReserveB > 0) {
          // TVL is in BTC terms, convert to USD first
          const tvlInUSD = btcPrice ? pool.tvl_asset_b * btcPrice : pool.tvl_asset_b
          
          // For balanced pool: TVL = 2 * (reserve_B * price_B)
          // So: price_B = TVL / (2 * reserve_B)
          const price = tvlInUSD / (2 * adjustedReserveB)
          
          // Sanity check
          if (price > 0 && price < 1_000_000) {
            return price
          }
        }
      }
      
      // Fallback: use current_price_a_in_b (but this is in BTC terms, need BTC price)
      if (pool.current_price_a_in_b && pool.current_price_a_in_b > 0) {
        // This is price of A (BTC) in B, so B price in BTC = 1 / price_a_in_b
        const priceInBTC = (1 / pool.current_price_a_in_b) * Math.pow(10, decimalsA - decimalsB)
        
        // Convert to USD if we have BTC price
        if (btcPrice) {
          return priceInBTC * btcPrice
        }
        
        // Otherwise return in BTC terms (will need conversion)
        return priceInBTC
      }
      
      // Last fallback: calculate from reserves (in BTC terms)
      if (pool.asset_a_reserve && pool.asset_b_reserve && pool.asset_b_reserve > 0) {
        const adjustedReserveA = pool.asset_a_reserve / Math.pow(10, decimalsA)
        const adjustedReserveB = pool.asset_b_reserve / Math.pow(10, decimalsB)
        const priceInBTC = adjustedReserveA / adjustedReserveB
        
        // Convert to USD if we have BTC price
        if (btcPrice) {
          return priceInBTC * btcPrice
        }
        
        return priceInBTC
      }
    } else {
      // Price of A (the token) in USD
      // If Asset B is BTC, we can calculate: price_A = (reserve_B * BTC_price) / reserve_A
      
      const isAssetBBitcoin = isBitcoinAsset(pool.asset_b_address, pool.asset_b_name, pool.asset_b_symbol, pool.asset_b_metadata)
      
      if (isAssetBBitcoin && btcPrice && pool.asset_a_reserve && pool.asset_b_reserve && pool.asset_a_reserve > 0) {
        // Asset B is BTC, so we can calculate price in USD
        const adjustedReserveA = pool.asset_a_reserve / Math.pow(10, decimalsA) // Token A amount
        const adjustedReserveB = pool.asset_b_reserve / Math.pow(10, decimalsB) // BTC amount
        
        // Price of A in USD = (BTC reserve * BTC price) / Token A reserve
        const priceInUSD = (adjustedReserveB * btcPrice) / adjustedReserveA
        
        // Sanity check
        if (priceInUSD > 0 && priceInUSD < 1_000_000) {
          return priceInUSD
        }
      }
      
      // Fallback: Price of A in terms of B (if B is BTC, this is in BTC terms)
      if (pool.current_price_a_in_b !== null && pool.current_price_a_in_b !== undefined) {
        const priceInB = pool.current_price_a_in_b
        
        // If Asset B is Bitcoin, convert to USD
        if (isAssetBBitcoin && btcPrice) {
          return priceInB * btcPrice
        }
        
        return priceInB
      }
      
      // Calculate from reserves if available
      if (pool.asset_a_reserve && pool.asset_b_reserve && pool.asset_a_reserve > 0) {
        const adjustedReserveA = pool.asset_a_reserve / Math.pow(10, decimalsA)
        const adjustedReserveB = pool.asset_b_reserve / Math.pow(10, decimalsB)
        const priceInB = adjustedReserveB / adjustedReserveA
        
        // If Asset B is Bitcoin, convert to USD
        if (isAssetBBitcoin && btcPrice) {
          return priceInB * btcPrice
        }
        
        return priceInB
      }
    }
    return null
  }

  const getMarketCap = (pool: FlashnetPool, side: 'a' | 'b') => {
    const metadata = side === 'a' ? pool.asset_a_metadata : pool.asset_b_metadata
    const price = getTokenPrice(pool, side)
    const address = side === 'a' ? pool.asset_a_address : pool.asset_b_address
    
    if (price === null || price === undefined) return null
    
    try {
      const decimals = metadata?.decimals ?? (side === 'a' ? pool.asset_a_decimals : pool.asset_b_decimals) ?? 0
      
      // Check if this is Bitcoin - don't default supply for Bitcoin
      const BTC_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202"
      const isBitcoin = address === BTC_PUBKEY || address?.toLowerCase() === BTC_PUBKEY.toLowerCase()
      
      // Default supply to 1 billion if not provided (but not for Bitcoin)
      const rawSupply = metadata?.max_supply 
        ? parseFloat(metadata.max_supply)
        : isBitcoin
          ? null // Don't default Bitcoin supply
          : (1_000_000_000 * Math.pow(10, decimals)) // 1B with decimals for tokens
      
      if (rawSupply === null || isNaN(rawSupply) || !isFinite(rawSupply)) return null
      
      // Supply is already in raw units (with decimals), adjust it
      const adjustedSupply = rawSupply / Math.pow(10, decimals)
      
      // Price should already be in USD terms (or in terms of the quote asset)
      // For now, if price seems way too high, it might be in wrong units
      const marketCap = adjustedSupply * price
      
      // Sanity check: if market cap is absurdly high, price calculation might be wrong
      if (marketCap > 1_000_000_000_000) {
        console.warn(`[Market Cap] Suspiciously high MC for ${side}:`, { supply: rawSupply, adjustedSupply, price, marketCap, decimals })
        return null
      }
      
      return marketCap
    } catch {
      return null
    }
  }

  const getLiquidity = (pool: FlashnetPool, side: 'a' | 'b') => {
    // For liquidity, calculate from reserves
    // Liquidity = reserve * price (in USD)
    const reserve = side === 'a' ? pool.asset_a_reserve : pool.asset_b_reserve
    const price = getTokenPrice(pool, side)
    
    if (!reserve || price === null || price === undefined) return null
    
    // Adjust for decimals
    const decimals = side === 'a' 
      ? (pool.asset_a_metadata?.decimals ?? pool.asset_a_decimals ?? 0)
      : (pool.asset_b_metadata?.decimals ?? pool.asset_b_decimals ?? 0)
    const adjustedReserve = reserve / Math.pow(10, decimals)
    
    const liquidity = adjustedReserve * price
    
    // Sanity check
    if (liquidity > 1_000_000_000_000) {
      console.warn(`[Liquidity] Suspiciously high liquidity for ${side}:`, { reserve, adjustedReserve, price, liquidity, decimals })
      return null
    }
    
    return liquidity
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortDirection(null)
        setSortColumn(null)
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 ml-1" />
    }
    if (sortDirection === 'desc') {
      return <ArrowDown className="h-3 w-3 ml-1" />
    }
    return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
  }

  // Server-side filtering is now handled by the API
  // We still filter out BTC/TOKEN pools client-side as a safety check
  // (though the API should also do this)
  const BTC_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202"
  const filteredPools = useMemo(() => {
    return pools.filter((pool) => {
      const assetA = pool.asset_a_address?.toLowerCase()
      return assetA !== BTC_PUBKEY.toLowerCase() && assetA !== null
    })
  }, [pools])
  
  // Update filtered total (from API response)
  useEffect(() => {
    setFilteredTotal(total)
  }, [total])

  // Server-sortable columns are already sorted by the API
  // Client-sortable columns (price, mc, liquidity, etc.) need client-side sorting
  const serverSortableColumns: SortColumn[] = ['volume', 'change', 'lpFee', 'hostFee', 'created']
  const isServerSortable = sortColumn && serverSortableColumns.includes(sortColumn)
  const sortedPools = [...filteredPools]
  const needsClientSort = sortColumn && sortDirection && !isServerSortable
  
  // Only sort client-side if it's not a server-sortable column
  // Server-sortable columns are already sorted by the API
  if (needsClientSort) {
    sortedPools.sort((a, b) => {
      let aValue: any = null
      let bValue: any = null

      switch (sortColumn) {
        case 'pair':
          aValue = getPoolName(a).toLowerCase()
          bValue = getPoolName(b).toLowerCase()
          break
        case 'token':
          aValue = getTokenName(a, 'a')?.toLowerCase() || ''
          bValue = getTokenName(b, 'a')?.toLowerCase() || ''
          break
        case 'price':
          aValue = getTokenPrice(a, 'a') ?? 0
          bValue = getTokenPrice(b, 'a') ?? 0
          break
        case 'mc':
          aValue = getMarketCap(a, 'a') ?? 0
          bValue = getMarketCap(b, 'a') ?? 0
          break
        case 'liquidity':
          aValue = getLiquidity(a, 'a') ?? 0
          bValue = getLiquidity(b, 'a') ?? 0
          break
        case 'supply': {
          const aDecimals = a.asset_a_metadata?.decimals ?? a.asset_a_decimals ?? 8
          const bDecimals = b.asset_a_metadata?.decimals ?? b.asset_b_decimals ?? 8
          const aSupply = a.asset_a_metadata?.max_supply 
            ? parseFloat(a.asset_a_metadata.max_supply) / Math.pow(10, aDecimals)
            : (metadataCache.get(a.asset_a_address || '')?.max_supply 
                ? parseFloat(metadataCache.get(a.asset_a_address || '')!.max_supply!) / Math.pow(10, aDecimals)
                : 1_000_000_000)
          const bSupply = b.asset_a_metadata?.max_supply 
            ? parseFloat(b.asset_a_metadata.max_supply) / Math.pow(10, bDecimals)
            : (metadataCache.get(b.asset_a_address || '')?.max_supply 
                ? parseFloat(metadataCache.get(b.asset_a_address || '')!.max_supply!) / Math.pow(10, bDecimals)
                : 1_000_000_000)
          aValue = aSupply
          bValue = bSupply
          break
        }
        case 'holders':
          aValue = a.asset_a_metadata?.holders ?? 0
          bValue = b.asset_a_metadata?.holders ?? 0
          break
        case 'volume': {
          // Volume is in Asset B (Bitcoin) raw units, need to adjust for decimals
          const aDecimalsB = a.asset_b_metadata?.decimals ?? a.asset_b_decimals ?? 8
          const bDecimalsB = b.asset_b_metadata?.decimals ?? b.asset_b_decimals ?? 8
          const aVolume = a.volume_24h_asset_b ? a.volume_24h_asset_b / Math.pow(10, aDecimalsB) : 0
          const bVolume = b.volume_24h_asset_b ? b.volume_24h_asset_b / Math.pow(10, bDecimalsB) : 0
          // Convert to USD for comparison if BTC price available
          aValue = btcPrice ? aVolume * btcPrice : aVolume
          bValue = btcPrice ? bVolume * btcPrice : bVolume
          break
        }
        case 'change':
          aValue = a.price_change_percent_24h ?? 0
          bValue = b.price_change_percent_24h ?? 0
          break
        case 'lpFee':
          aValue = a.lp_fee_bps ?? 0
          bValue = b.lp_fee_bps ?? 0
          break
        case 'hostFee':
          aValue = a.host_fee_bps ?? 0
          bValue = b.host_fee_bps ?? 0
          break
        case 'created':
          // Sort by creation date (newest first by default)
          const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
          const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
          aValue = aCreated
          bValue = bCreated
          break
      }

      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      const numA = Number(aValue)
      const numB = Number(bValue)
      return sortDirection === 'asc' ? numA - numB : numB - numA
    })
  }

  // Calculate total pages and pagination
  const isSorting = sortColumn && sortDirection
  
  // If using server-side sorting, pools are already paginated by the API
  // If using client-side sorting, we need to paginate the sorted/filtered results
  let paginatedPools: FlashnetPool[]
  let totalPages: number
  let displayablePools: number
  
  if (isServerSortable && isSorting) {
    // Server-side sorted and filtered: use pools directly (already paginated by API)
    paginatedPools = filteredPools
    displayablePools = total // Use total from API (already filtered)
    totalPages = Math.ceil(total / limit)
  } else {
    // Client-side sorted: paginate the sorted results
    displayablePools = sortedPools.length
    totalPages = Math.ceil(displayablePools / limit)
    paginatedPools = sortedPools.slice(page * limit, (page + 1) * limit)
  }
  
  // Ensure page doesn't exceed total pages when filter changes
  useEffect(() => {
    if (totalPages > 0 && page >= totalPages) {
      setPage(Math.max(0, totalPages - 1))
    }
  }, [totalPages, page])

  return (
    <div className="min-h-screen bg-black text-white">
      <Header showMusicControls={true} />
      
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black uppercase tracking-[0.3em] mb-4 flex items-center justify-center gap-4">
            <Coins className="h-12 w-12 text-yellow-500" />
            Spark Tokens
          </h1>
          <p className="text-gray-400 text-lg mb-2">
            Flashnet Spark Token Pools
          </p>
          {!loading && (
            <p className="text-yellow-500 font-semibold text-sm mb-6">
              {hideLowCap ? (
                <>
                  <span className="text-yellow-500">{total}</span> {total === 1 ? 'Token' : 'Tokens'} Available
                  <span className="text-gray-500 text-xs ml-2">(filtered)</span>
                </>
              ) : (
                <>
              {total} {total === 1 ? 'Token' : 'Tokens'} Available
                </>
              )}
            </p>
          )}
          {total === 0 && !loading && (
            <p className="text-gray-500 text-sm mb-6">
              No tokens found
            </p>
          )}
          {loading && (
            <p className="text-gray-500 text-sm mb-6">
              Loading tokens...
          </p>
          )}
          
          {/* Bitcoin Price Display */}
          {btcPrice && (
            <div className="inline-flex items-center gap-4 px-6 py-3 bg-yellow-500/10 border-2 border-yellow-500/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 font-bold text-lg">BTC</span>
                <span className="text-white font-mono text-lg">${formatNumber(btcPrice)}</span>
              </div>
            </div>
          )}
        </div>

        {loading && pools.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-yellow-500" />
            <span className="ml-4 text-gray-400">Loading pools from database...</span>
          </div>
        ) : pools.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-xl">No pools available yet. Syncing...</p>
          </div>
        ) : (
          <>
            {/* Filter Controls */}
            <div className="mb-4 flex items-center justify-end gap-4">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={hideLowCap}
                  onChange={(e) => setHideLowCap(e.target.checked)}
                  className="w-4 h-4 text-yellow-500 bg-black border-yellow-500/50 rounded focus:ring-yellow-500 focus:ring-2 cursor-pointer"
                />
                <span className="text-gray-300 text-sm font-medium group-hover:text-yellow-400 transition-colors">
                  Hide low cap (&lt; $4,000)
                </span>
              </label>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-yellow-500/50">
                    <th 
                      className="text-left py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('token')}
                    >
                      <div className="flex items-center">
                        Token
                        {getSortIcon('token')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('price')}
                    >
                      <div className="flex items-center justify-end">
                        Price
                        {getSortIcon('price')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('mc')}
                    >
                      <div className="flex items-center justify-end">
                        MC
                        {getSortIcon('mc')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('liquidity')}
                    >
                      <div className="flex items-center justify-end">
                        Liquidity
                        {getSortIcon('liquidity')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('supply')}
                    >
                      <div className="flex items-center justify-end">
                        Supply
                        {getSortIcon('supply')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('holders')}
                    >
                      <div className="flex items-center justify-end">
                        Holders
                        {getSortIcon('holders')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('volume')}
                    >
                      <div className="flex items-center justify-end">
                        24h Volume
                        {getSortIcon('volume')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('change')}
                    >
                      <div className="flex items-center justify-end">
                        24h Change
                        {getSortIcon('change')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('lpFee')}
                    >
                      <div className="flex items-center justify-end">
                        LP Fee
                        {getSortIcon('lpFee')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('hostFee')}
                    >
                      <div className="flex items-center justify-end">
                        Host Fee
                        {getSortIcon('hostFee')}
                      </div>
                    </th>
                    <th 
                      className="text-right py-2 px-3 text-yellow-400 font-bold text-sm cursor-pointer hover:bg-yellow-500/10 transition-colors select-none"
                      onClick={() => handleSort('created')}
                    >
                      <div className="flex items-center justify-end">
                        Created
                        {getSortIcon('created')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPools.map((pool) => {
                    const poolName = getPoolName(pool)
                    const iconA = getTokenIcon(pool, 'a')
                    const iconB = getTokenIcon(pool, 'b')
                    const priceChange = pool.price_change_percent_24h
                    const isPositive = priceChange !== null && priceChange >= 0
                    
                    // Get token A data (the actual token, not Bitcoin which is Asset B)
                    // After filtering, pools are TOKEN/BTC where Asset A = token, Asset B = Bitcoin
                    const BTC_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202"
                    const isAssetABitcoin = pool.asset_a_address === BTC_PUBKEY || pool.asset_a_address?.toLowerCase() === BTC_PUBKEY.toLowerCase()
                    
                    // Verify metadata is actually for this token (not incorrectly assigned Bitcoin metadata)
                    const assetAMetadataIsBitcoin = pool.asset_a_metadata?.ticker?.toLowerCase() === 'btc' || 
                                                    pool.asset_a_metadata?.name?.toLowerCase() === 'bitcoin' ||
                                                    (pool.asset_a_metadata?.token_identifier?.toLowerCase() ?? '') === BTC_PUBKEY.toLowerCase() ||
                                                    (pool.asset_a_metadata?.token_address?.toLowerCase() ?? '') === BTC_PUBKEY.toLowerCase()
                    
                    // Only use metadata if it matches the actual token (not Bitcoin metadata for non-Bitcoin tokens)
                    const useMetadata = pool.asset_a_metadata && (isAssetABitcoin === assetAMetadataIsBitcoin)
                    
                    // Check metadata cache for missing max_supply (check both original and lowercase)
                    const cachedMetadata = pool.asset_a_address 
                      ? (metadataCache.get(pool.asset_a_address) || metadataCache.get(pool.asset_a_address.toLowerCase()))
                      : null
                    const maxSupply = useMetadata && pool.asset_a_metadata?.max_supply 
                      ? pool.asset_a_metadata.max_supply 
                      : cachedMetadata?.max_supply || null
                    
                    // Use metadata decimals if available and valid, otherwise use pool decimals, default to 8 (common for tokens)
                    const decimalsA = useMetadata && pool.asset_a_metadata 
                      ? (pool.asset_a_metadata.decimals ?? pool.asset_a_decimals ?? 8) 
                      : cachedMetadata?.decimals ?? (pool.asset_a_decimals ?? 8)
                    
                    // Asset B decimals (Bitcoin, typically 8)
                    const decimalsB = pool.asset_b_metadata?.decimals ?? pool.asset_b_decimals ?? 8
                    
                    // Calculate supply: use metadata if valid, otherwise default to 1B for non-Bitcoin tokens
                    const tokenASupply = maxSupply
                      ? maxSupply
                      : isAssetABitcoin
                        ? null // Don't default Bitcoin supply
                        : (1_000_000_000 * Math.pow(10, decimalsA)).toString() // 1B with decimals for non-Bitcoin tokens
                    
                    // Note: Metadata fetching is handled in fetchPools useEffect
                    
                    // Get token data for display (Asset A = the token)
                    const tokenPrice = getTokenPrice(pool, 'a')
                    const tokenMarketCap = getMarketCap(pool, 'a')
                    const tokenLiquidity = getLiquidity(pool, 'a')
                    
                    // Get token name - prefer actual token data over potentially incorrect metadata
                    let tokenName = getTokenName(pool, 'a')
                    // If metadata says Bitcoin but this is not Bitcoin, ignore metadata name
                    if (!isAssetABitcoin && assetAMetadataIsBitcoin) {
                      tokenName = pool.asset_a_name || pool.asset_a_symbol || tokenName
                    }
                    
                    const tokenHolders = useMetadata && pool.asset_a_metadata ? (pool.asset_a_metadata.holders ?? null) : null
                    
                    // Debug: Log supply calculation for first few pools and UTXO token
                    const isUTXOToken = poolName.includes('UTXO') || pool.asset_a_symbol?.toUpperCase() === 'UTXO' || pool.asset_a_name?.toUpperCase().includes('UTXO')
                    
           

                    const isFav = isFavorite(pool.lp_public_key)

                    return (
                      <tr
                        key={pool.lp_public_key}
                        onClick={() => toggleFavorite(pool.lp_public_key)}
                        className={`border-b border-yellow-500/20 hover:bg-black/40 transition-colors cursor-pointer ${
                          isFav ? 'bg-yellow-500/10' : ''
                        }`}
                      >
                        {/* Token Name */}
                        <td className="py-1.5 px-3">
                          <div className="flex items-center gap-2">
                            <Star
                              className={`h-4 w-4 flex-shrink-0 transition-all ${
                                isFav 
                                  ? 'fill-yellow-500 text-yellow-500' 
                                  : 'text-gray-500 hover:text-yellow-500'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFavorite(pool.lp_public_key)
                              }}
                            />
                            {pool.lp_public_key ? (
                                <a
                                href={`https://luminex.io/spark/trade/${pool.lp_public_key}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                className="text-white text-sm font-semibold hover:text-yellow-400 hover:underline transition-colors"
                                  title={`Trade ${tokenName} on Luminex Spark`}
                                onClick={(e) => e.stopPropagation()}
                                >
                                  {tokenName || 'N/A'}
                                </a>
                            ) : (
                                <span className="text-white text-sm">{tokenName || 'N/A'}</span>
                            )}
                          </div>
                        </td>

                        {/* Price */}
                        <td className="py-1.5 px-3 text-right">
                          <span className="text-white font-mono text-sm">
                            {tokenPrice !== null ? `$${formatNumber(tokenPrice)}` : 'N/A'}
                          </span>
                        </td>

                        {/* Market Cap */}
                        <td className="py-1.5 px-3 text-right">
                          {tokenMarketCap !== null ? (() => {
                            // Calculate fill percentage: 0% at $4k, 100% at $100k+
                            const minCap = 4000
                            const maxCap = 100000
                            const fillPercent = tokenMarketCap < minCap 
                              ? 0 
                              : tokenMarketCap >= maxCap 
                                ? 100 
                                : ((tokenMarketCap - minCap) / (maxCap - minCap)) * 100
                            
                            return (
                              <div className="relative w-28 h-6 mx-auto flex items-center justify-center">
                                {/* Background bar */}
                                <div className="absolute inset-0 bg-gray-800 rounded-full border border-yellow-500/30"></div>
                                {/* Filled bar */}
                                <div 
                                  className="absolute inset-0 bg-yellow-500/40 rounded-full transition-all duration-300"
                                  style={{ width: `${fillPercent}%` }}
                                ></div>
                                {/* Market cap text overlay */}
                                <span className="relative z-10 text-yellow-400 font-bold text-xs px-1 whitespace-nowrap">
                                  {formatCurrency(tokenMarketCap)}
                          </span>
                              </div>
                            )
                          })() : (
                            <span className="text-gray-500 text-sm">N/A</span>
                          )}
                        </td>

                        {/* Liquidity */}
                        <td className="py-1.5 px-3 text-right">
                          <span className="text-white font-bold text-sm">
                            {tokenLiquidity !== null ? formatCurrency(tokenLiquidity * 2) : 'N/A'}
                          </span>
                        </td>

                         {/* Supply */}
                         <td className="py-1.5 px-3 text-right">
                           <span className="text-white font-mono text-xs">
                             {tokenASupply ? (() => {
                               // max_supply from SDK is in raw units (with decimals), so divide by 10^decimals
                               const rawSupply = parseFloat(tokenASupply)
                               const adjustedSupply = rawSupply / Math.pow(10, decimalsA)
                               
                               // Debug log for first few pools and UTXO token
                               const isUTXOToken = poolName.includes('UTXO') || pool.asset_a_symbol?.toUpperCase() === 'UTXO' || pool.asset_a_name?.toUpperCase().includes('UTXO')
                
                               
                               return formatNumber(adjustedSupply)
                             })() : 'N/A'}
                           </span>
                         </td>

                         {/* Holders */}
                         <td className="py-1.5 px-3 text-right">
                           <span className="text-white font-mono text-xs">
                             {tokenHolders !== null ? formatNumber(tokenHolders) : 'N/A'}
                           </span>
                         </td>

                        {/* 24h Volume */}
                        <td className="py-1.5 px-3 text-right">
                          <span className="text-white font-bold text-sm">
                            {(() => {
                              // volume_24h_asset_b is in Asset B (Bitcoin) raw units with decimals
                              // Need to divide by 10^decimalsB to get BTC amount, then convert to USD
                              if (pool.volume_24h_asset_b === null || pool.volume_24h_asset_b === undefined) {
                                return 'N/A'
                              }
                              const volumeInBTC = pool.volume_24h_asset_b / Math.pow(10, decimalsB)
                              const volumeInUSD = btcPrice ? volumeInBTC * btcPrice : volumeInBTC
                              return formatCurrency(volumeInUSD)
                            })()}
                          </span>
                        </td>

                        {/* 24h Change */}
                        <td className="py-1.5 px-3 text-right">
                          <div className={`flex items-center justify-end gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {isPositive ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            <span className="font-bold text-xs">
                              {formatPercent(priceChange)}
                            </span>
                          </div>
                        </td>

                        {/* LP Fee */}
                        <td className="py-1.5 px-3 text-right">
                          <span className="text-gray-400 text-xs">
                            {pool.lp_fee_bps !== null ? `${pool.lp_fee_bps} bps` : 'N/A'}
                          </span>
                        </td>

                        {/* Host Fee */}
                        <td className="py-1.5 px-3 text-right">
                          <span className="text-gray-400 text-xs">
                            {pool.host_fee_bps !== null ? `${pool.host_fee_bps} bps` : 'N/A'}
                          </span>
                        </td>

                        {/* Created */}
                        <td className="py-1.5 px-3 text-right">
                          <span className="text-gray-400 text-xs" title={pool.created_at ? new Date(pool.created_at).toLocaleString() : 'Unknown'}>
                            {(() => {
                              const minutes = getMinutesSinceCreation(pool.created_at)
                              return minutes !== null ? formatMinutesAgo(minutes) : 'N/A'
                            })()}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {paginatedPools.map((pool) => {
                const poolName = getPoolName(pool)
                const iconA = getTokenIcon(pool, 'a')
                const iconB = getTokenIcon(pool, 'b')
                const priceChange = pool.price_change_percent_24h
                const isPositive = priceChange !== null && priceChange >= 0
                
                const BTC_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202"
                const isAssetABitcoin = pool.asset_a_address === BTC_PUBKEY || pool.asset_a_address?.toLowerCase() === BTC_PUBKEY.toLowerCase()
                
                const assetAMetadataIsBitcoin = pool.asset_a_metadata?.ticker?.toLowerCase() === 'btc' || 
                                                pool.asset_a_metadata?.name?.toLowerCase() === 'bitcoin' ||
                                                (pool.asset_a_metadata?.token_identifier?.toLowerCase() ?? '') === BTC_PUBKEY.toLowerCase() ||
                                                (pool.asset_a_metadata?.token_address?.toLowerCase() ?? '') === BTC_PUBKEY.toLowerCase()
                
                const useMetadata = pool.asset_a_metadata && (isAssetABitcoin === assetAMetadataIsBitcoin)
                
                const cachedMetadata = pool.asset_a_address 
                  ? (metadataCache.get(pool.asset_a_address) || metadataCache.get(pool.asset_a_address.toLowerCase()))
                  : null
                const maxSupply = useMetadata && pool.asset_a_metadata?.max_supply 
                  ? pool.asset_a_metadata.max_supply 
                  : cachedMetadata?.max_supply || null
                
                const decimalsA = useMetadata && pool.asset_a_metadata 
                  ? (pool.asset_a_metadata.decimals ?? pool.asset_a_decimals ?? 8) 
                  : cachedMetadata?.decimals ?? (pool.asset_a_decimals ?? 8)
                
                const decimalsB = pool.asset_b_metadata?.decimals ?? pool.asset_b_decimals ?? 8
                
                const tokenASupply = maxSupply
                  ? maxSupply
                  : isAssetABitcoin
                    ? null
                    : (1_000_000_000 * Math.pow(10, decimalsA)).toString()
                
                const tokenPrice = getTokenPrice(pool, 'a')
                const tokenMarketCap = getMarketCap(pool, 'a')
                const tokenLiquidity = getLiquidity(pool, 'a')
                
                let tokenName = getTokenName(pool, 'a')
                if (!isAssetABitcoin && assetAMetadataIsBitcoin) {
                  tokenName = pool.asset_a_name || pool.asset_a_symbol || tokenName
                }
                
                const tokenHolders = useMetadata && pool.asset_a_metadata ? (pool.asset_a_metadata.holders ?? null) : null
                const isFav = isFavorite(pool.lp_public_key)

                return (
                  <div
                    key={pool.lp_public_key}
                    onClick={() => toggleFavorite(pool.lp_public_key)}
                    className={`bg-black/40 border border-yellow-500/30 rounded-lg p-4 cursor-pointer transition-all ${
                      isFav ? 'bg-yellow-500/10 border-yellow-500/50' : 'hover:bg-black/60'
                    }`}
                  >
                    {/* Header: Token Name & Star */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Star
                          className={`h-5 w-5 flex-shrink-0 transition-all ${
                            isFav 
                              ? 'fill-yellow-500 text-yellow-500' 
                              : 'text-gray-500'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(pool.lp_public_key)
                          }}
                        />
                        {pool.lp_public_key ? (
                          <a
                            href={`https://luminex.io/spark/trade/${pool.lp_public_key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white font-bold text-base hover:text-yellow-400 hover:underline transition-colors truncate"
                            title={`Trade ${tokenName} on Luminex Spark`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {tokenName || 'N/A'}
                          </a>
                        ) : (
                          <span className="text-white font-bold text-base truncate">{tokenName || 'N/A'}</span>
                        )}
                      </div>
                      {/* 24h Change */}
                      <div className={`flex items-center gap-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        <span className="font-bold text-sm">
                          {formatPercent(priceChange)}
                        </span>
                      </div>
                    </div>

                    {/* Main Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {/* Price */}
                      <div>
                        <div className="text-gray-400 text-xs mb-1">Price</div>
                        <div className="text-white font-mono text-sm font-semibold">
                          {tokenPrice !== null ? `$${formatNumber(tokenPrice)}` : 'N/A'}
                        </div>
                      </div>

                      {/* Market Cap */}
                      <div>
                        <div className="text-gray-400 text-xs mb-1">Market Cap</div>
                        {tokenMarketCap !== null ? (() => {
                          const minCap = 4000
                          const maxCap = 100000
                          const fillPercent = tokenMarketCap < minCap 
                            ? 0 
                            : tokenMarketCap >= maxCap 
                              ? 100 
                              : ((tokenMarketCap - minCap) / (maxCap - minCap)) * 100
                          
                          return (
                            <div className="relative h-5 flex items-center">
                              <div className="absolute inset-0 bg-gray-800 rounded-full border border-yellow-500/30"></div>
                              <div 
                                className="absolute inset-0 bg-yellow-500/40 rounded-full transition-all duration-300"
                                style={{ width: `${fillPercent}%` }}
                              ></div>
                              <span className="relative z-10 text-yellow-400 font-bold text-xs px-2 whitespace-nowrap">
                                {formatCurrency(tokenMarketCap)}
                              </span>
                            </div>
                          )
                        })() : (
                          <div className="text-gray-500 text-sm">N/A</div>
                        )}
                      </div>

                      {/* Liquidity */}
                      <div>
                        <div className="text-gray-400 text-xs mb-1">Liquidity</div>
                        <div className="text-white font-bold text-sm">
                          {tokenLiquidity !== null ? formatCurrency(tokenLiquidity * 2) : 'N/A'}
                        </div>
                      </div>

                      {/* Volume */}
                      <div>
                        <div className="text-gray-400 text-xs mb-1">24h Volume</div>
                        <div className="text-white font-bold text-sm">
                          {(() => {
                            if (pool.volume_24h_asset_b === null || pool.volume_24h_asset_b === undefined) {
                              return 'N/A'
                            }
                            const volumeInBTC = pool.volume_24h_asset_b / Math.pow(10, decimalsB)
                            const volumeInUSD = btcPrice ? volumeInBTC * btcPrice : volumeInBTC
                            return formatCurrency(volumeInUSD)
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Secondary Stats */}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-yellow-500/20 text-xs">
                      <div>
                        <div className="text-gray-400 mb-1">Supply</div>
                        <div className="text-white font-mono">
                          {tokenASupply ? (() => {
                            const rawSupply = parseFloat(tokenASupply)
                            const adjustedSupply = rawSupply / Math.pow(10, decimalsA)
                            return formatNumber(adjustedSupply)
                          })() : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400 mb-1">Holders</div>
                        <div className="text-white font-mono">
                          {tokenHolders !== null ? formatNumber(tokenHolders) : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400 mb-1">Created</div>
                        <div className="text-gray-300" title={pool.created_at ? new Date(pool.created_at).toLocaleString() : 'Unknown'}>
                          {(() => {
                            const minutes = getMinutesSinceCreation(pool.created_at)
                            return minutes !== null ? formatMinutesAgo(minutes) : 'N/A'
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination - Always show, works with both sorted and unsorted data */}
            {displayablePools > 0 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                {totalPages > 1 && (
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0 || loading}
                    className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/50 rounded hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                )}
                <span className="text-gray-400 text-sm">
                  {totalPages > 1 ? (
                    <>
                      Page <span className="text-yellow-500 font-semibold">{page + 1}</span> of <span className="text-yellow-500 font-semibold">{totalPages}</span>
                      <span className="ml-2 text-gray-500">
                        ({displayablePools} {displayablePools === 1 ? 'token' : 'tokens'} {isSorting ? 'sorted' : 'total'})
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-yellow-500 font-semibold">{displayablePools}</span> {displayablePools === 1 ? 'token' : 'tokens'} {isSorting ? 'sorted' : 'total'}
                    </>
                  )}
                </span>
                {totalPages > 1 && (
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1 || loading}
                    className="px-4 py-2 bg-yellow-500/20 border border-yellow-500/50 rounded hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

