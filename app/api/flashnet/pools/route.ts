import { NextRequest, NextResponse } from 'next/server'
import {
  ensureFlashnetTables,
  listFlashnetPools,
  searchFlashnetPools,
  countFlashnetPools,
  upsertFlashnetPools,
  attachStoredMetadataToPools,
  getFlashnetClient,
  enrichPoolsWithMetadata,
  normalizePool,
  type FlashnetPoolRecord,
} from '@/lib/flashnet'

export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim() ?? ''
    
    // Support both page-based and offset-based pagination
    const pageParam = url.searchParams.get('page')
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    
    // Support sortType and sortDirection (new format) or sortBy/sortDirection (legacy)
    const sortType = url.searchParams.get('sortType') || url.searchParams.get('sortBy')
    const sortDirectionParam = url.searchParams.get('sortDirection')
    const filterParam = url.searchParams.get('filter')
    
    // Map sortType to internal sortBy format
    const sortTypeMap: Record<string, 'tvl' | 'volume' | 'price_change' | 'lp_fee' | 'host_fee' | 'created_at'> = {
      '24_hr_change': 'price_change',
      'volume': 'volume',
      'lp_fee': 'lp_fee',
      'host_fee': 'host_fee',
      'created': 'created_at',
      'tvl': 'tvl',
      // Legacy mappings
      'price_change': 'price_change',
    }
    const sortBy = sortType ? (sortTypeMap[sortType] || null) : null
    const sortDirection = (sortDirectionParam === '0' || sortDirectionParam === 'asc') ? 'asc' : 
                         (sortDirectionParam === '1' || sortDirectionParam === 'desc') ? 'desc' : 'desc'
    
    // Parse filter parameters (can be comma-separated)
    const filters = filterParam ? filterParam.split(',').map(f => f.trim()) : []
    const minMarketCap = filters.includes('low_caps') ? 4000 : undefined
    const hideOldPools = filters.includes('old_pools') // Hide pools created > 4 hours ago

    // Calculate limit and offset
    let limit = pageParam 
      ? Math.min(Math.max(1, Number(limitParam ?? 20)), 200) // Default 20 per page
      : Number(limitParam ?? (search ? 5 : 25))
    let offset = pageParam
      ? (Number(pageParam) - 1) * limit // Page-based: page 1 = offset 0
      : Number(offsetParam ?? 0)

    if (!Number.isFinite(limit) || limit <= 0) {
      limit = search ? 5 : 25
    }
    if (!Number.isFinite(offset) || offset < 0) {
      offset = 0
    }

    const finalLimit = Math.min(Math.max(1, limit), 200)
    const finalOffset = Math.max(0, offset)

    await ensureFlashnetTables()

    if (search) {
      const rawPools = await searchFlashnetPools(search, limit)
      const pools = await attachStoredMetadataToPools(rawPools)
      return NextResponse.json({
        success: true,
        pools,
        count: pools.length,
        total: pools.length,
      })
    }

    // Fetch BTC price if we need to filter by market cap
    let btcPrice: number | null = null
    if (minMarketCap) {
      try {
        const btcResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {
          next: { revalidate: 60 } // Cache for 60 seconds
        })
        if (btcResponse.ok) {
          const btcData = await btcResponse.json()
          btcPrice = btcData.bitcoin?.usd ?? null
        }
      } catch (error) {
        console.warn('[Flashnet Pools API] Failed to fetch BTC price:', error)
      }
    }

    // Get all pools (we need to filter by market cap, so fetch all first)
    // Filter out BTC/TOKEN pools and apply market cap filter if needed
    const BTC_PUBKEY = "020202020202020202020202020202020202020202020202020202020202020202"
    let allPools = await listFlashnetPools({ limit: 500, offset: 0, sortBy: sortBy || undefined, sortDirection })
    
    // Attach metadata to pools
    allPools = await attachStoredMetadataToPools(allPools)
    
    // Filter out BTC/TOKEN pools (where Asset A is Bitcoin)
    let filteredPools = allPools.filter(pool => {
      const assetA = pool.asset_a_address?.toLowerCase()
      return assetA !== BTC_PUBKEY.toLowerCase() && assetA !== null
    })
    
    // Filter by market cap if needed
    if (minMarketCap && btcPrice) {
      filteredPools = filteredPools.filter(pool => {
        // Calculate market cap
        const decimalsA = pool.asset_a_decimals ?? 8
        const decimalsB = pool.asset_b_decimals ?? 8
        
        // Get supply from metadata
        const metadata = (pool as any).asset_a_metadata
        const maxSupply = metadata?.max_supply 
          ? parseFloat(metadata.max_supply) 
          : null
        
        // Default to 1B if no supply
        const supply = maxSupply ? maxSupply / Math.pow(10, decimalsA) : 1_000_000_000
        
        // Calculate price in USD
        // If Asset B is BTC, price = (reserve_B * BTC_price) / reserve_A
        if (pool.asset_b_address?.toLowerCase() === BTC_PUBKEY.toLowerCase() && 
            pool.asset_a_reserve && pool.asset_b_reserve && pool.asset_a_reserve > 0) {
          const adjustedReserveA = pool.asset_a_reserve / Math.pow(10, decimalsA)
          const adjustedReserveB = pool.asset_b_reserve / Math.pow(10, decimalsB)
          const priceInUSD = (adjustedReserveB * btcPrice) / adjustedReserveA
          
          const marketCap = supply * priceInUSD
          return marketCap >= minMarketCap
        }
        
        return false // Can't calculate market cap, exclude
      })
    }
    
    // Filter out old pools (created > 4 hours ago) if needed
    if (hideOldPools) {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000) // 4 hours in milliseconds
      filteredPools = filteredPools.filter(pool => {
        if (!pool.created_at) {
          return false // Exclude pools without creation date
        }
        const createdAt = new Date(pool.created_at)
        return createdAt >= fourHoursAgo // Only include pools created within last 4 hours
      })
    }
    
    // Apply sorting if not already sorted (for client-sortable columns, we sort here)
    // Server-sortable columns are already sorted by listFlashnetPools
    if (sortBy && !['tvl', 'volume', 'price_change', 'lp_fee', 'host_fee', 'created_at'].includes(sortBy)) {
      // Client-sortable columns - sort here
      // This shouldn't happen with current implementation, but handle it
    }
    
    // Get total count (before pagination)
    const filteredTotal = filteredPools.length
    
    // Apply pagination
    const paginatedPools = filteredPools.slice(finalOffset, finalOffset + finalLimit)

    return NextResponse.json({
      success: true,
      pools: paginatedPools,
      count: paginatedPools.length,
      total: filteredTotal, // Return filtered total, not dbTotal
    })
  } catch (error) {
    console.error('Flashnet pools GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json().catch(() => ({}))
    const pools = Array.isArray(body?.pools) ? body.pools : []

    if (!pools.length) {
      return NextResponse.json(
        { success: false, error: 'No pools provided' },
        { status: 400 },
      )
    }

    await ensureFlashnetTables()
    const result = await upsertFlashnetPools(pools)

    try {
      const client = await getFlashnetClient()
      await enrichPoolsWithMetadata(client, result.records)
    } catch (error) {
      console.warn('[Flashnet] Metadata enrichment skipped:', (error as Error).message ?? error)
    }

    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      updated: result.updated,
    })
  } catch (error) {
    console.error('Flashnet pools POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}


