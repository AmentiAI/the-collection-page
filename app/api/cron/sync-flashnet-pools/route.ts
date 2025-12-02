import { NextRequest, NextResponse } from 'next/server'
import {
  ensureFlashnetTables,
  getFlashnetClient,
  upsertFlashnetPools,
  enrichPoolsWithMetadata,
  normalizePool,
  type FlashnetPoolRecord,
} from '@/lib/flashnet'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Helper function to add timeout to promises
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${errorMessage} (timeout after ${timeoutMs}ms)`)), timeoutMs)
    }),
  ])
}

export async function GET(request: NextRequest) {

  const startTime = Date.now()
  const MAX_EXECUTION_TIME = 4 * 60 * 1000 // 4 minutes max (Vercel has 5 min limit for serverless)

  try {
    console.log('[Flashnet Sync] Starting pool sync from SDK...')
    console.log('[Flashnet Sync] Step 1: Ensuring tables exist...')
    await ensureFlashnetTables()
    console.log('[Flashnet Sync] Step 1: Tables ensured')

    console.log('[Flashnet Sync] Step 2: Getting Flashnet client...')
    const client = await withTimeout(
      getFlashnetClient(),
      30000, // 30 second timeout for client initialization
      'Flashnet client initialization'
    )
    console.log('[Flashnet Sync] Step 2: Client obtained')

    const PAGE_SIZE = 50 // SDK page size
    const MAX_POOLS = 500 // Fetch top 500 pools by TVL (increased from 200 to catch more pools)
    const PARALLEL_BATCH_SIZE = 5 // Fetch 5 pages in parallel at once (250 pools per batch)
    const TOTAL_BATCHES = Math.ceil(MAX_POOLS / (PAGE_SIZE * PARALLEL_BATCH_SIZE)) // How many parallel batches we need

    console.log(`[Flashnet Sync] Step 3: Fetching pools from SDK (up to ${MAX_POOLS} pools, ${PARALLEL_BATCH_SIZE} pages in parallel)...`)
    
    const allPools: any[] = []
    const poolSet = new Set<string>() // Track unique pools by lp_public_key to avoid duplicates
    
    // Fetch pools in parallel batches
    for (let batchIndex = 0; batchIndex < TOTAL_BATCHES; batchIndex++) {
      // Check if we're running out of time
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.warn(`[Flashnet Sync] Approaching timeout, stopping at ${allPools.length} pools`)
        break
      }
      
      // Check if we have enough pools
      if (allPools.length >= MAX_POOLS) {
        break
      }
      
      const batchStartOffset = batchIndex * PAGE_SIZE * PARALLEL_BATCH_SIZE
      console.log(`[Flashnet Sync] Fetching batch ${batchIndex + 1}/${TOTAL_BATCHES} (offsets ${batchStartOffset}-${batchStartOffset + (PAGE_SIZE * PARALLEL_BATCH_SIZE) - 1})...`)
      
      // Create parallel requests for this batch
      const batchPromises = []
      for (let i = 0; i < PARALLEL_BATCH_SIZE; i++) {
        const offset = batchStartOffset + (i * PAGE_SIZE)
        if (offset >= MAX_POOLS) break // Don't fetch beyond our limit
        
        batchPromises.push(
          withTimeout(
            client.listPools({
              limit: PAGE_SIZE,
              offset,
              sort: 'TVL_DESC',
            }),
            20000, // 20 second timeout per SDK call
            `SDK listPools call at offset ${offset}`
          ).then((sdkResponse) => {
            const pools = Array.isArray(sdkResponse?.pools) 
              ? sdkResponse.pools 
              : Array.isArray(sdkResponse) 
              ? sdkResponse 
              : []
            return { offset, pools }
          }).catch((error) => {
            console.error(`[Flashnet Sync] Error fetching pools at offset ${offset}:`, error)
            return { offset, pools: [] }
          })
        )
      }
      
      // Wait for all parallel requests in this batch to complete
      const batchResults = await Promise.all(batchPromises)
      
      // Process results and add unique pools
      let batchTotal = 0
      for (const { offset, pools } of batchResults) {
        if (!pools.length) {
          console.log(`[Flashnet Sync] No more pools at offset ${offset}`)
          continue
        }
        
        // Add only unique pools (by lp_public_key)
        for (const pool of pools) {
          const poolKey = pool.lp_public_key || pool.lpPublicKey || pool.id
          if (poolKey && !poolSet.has(poolKey)) {
            poolSet.add(poolKey)
            allPools.push(pool)
            batchTotal++
          }
        }
      }
      
      console.log(`[Flashnet Sync] Batch ${batchIndex + 1} complete: ${batchTotal} new pools (total: ${allPools.length})`)
      
      // If any batch returned fewer pools than expected, we've likely reached the end
      const hasIncompleteBatch = batchResults.some(({ pools }) => pools.length > 0 && pools.length < PAGE_SIZE)
      if (hasIncompleteBatch && batchTotal === 0) {
        console.log(`[Flashnet Sync] Reached end of available pools`)
        break
      }
      
      // If we got fewer pools than expected across the batch, we might be at the end
      if (batchTotal < PAGE_SIZE * PARALLEL_BATCH_SIZE * 0.5) {
        console.log(`[Flashnet Sync] Low pool count in batch, likely near end of available pools`)
      }
    }

    if (!allPools.length) {
      return NextResponse.json({
        success: true,
        message: 'No pools found in SDK',
        inserted: 0,
        updated: 0,
        total: 0,
      })
    }

    console.log(`[Flashnet Sync] Step 4: Normalizing ${allPools.length} pools...`)
    
    // Normalize all pools
    const normalizedPools = allPools
      .map((pool: any) => normalizePool(pool))
      .filter((pool): pool is FlashnetPoolRecord => pool !== null)
    console.log(`[Flashnet Sync] Step 4: Normalized ${normalizedPools.length} pools`)

    console.log(`[Flashnet Sync] Step 5: Upserting ${normalizedPools.length} pools to database...`)
    
    // Upsert to database (updates fast-changing fields: prices, volume, TVL, reserves)
    const result = await upsertFlashnetPools(normalizedPools)
    console.log(`[Flashnet Sync] Step 5: Upsert complete - inserted: ${result.inserted}, updated: ${result.updated}`)

    // Metadata enrichment: Only run every 15 minutes (metadata changes rarely)
    // This reduces API calls while keeping trading data fresh every minute
    const METADATA_SYNC_INTERVAL = 15 * 60 * 1000 // 15 minutes in milliseconds
    const BTC_PRICE_SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds
    
    console.log('[Flashnet Sync] Step 6: Setting up sync state table...')
    const db = getPool()
    
    // Ensure sync_state table exists with btc_price column
    await db.query(`
      CREATE TABLE IF NOT EXISTS flashnet_sync_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        last_metadata_sync TIMESTAMPTZ,
        btc_price_usd NUMERIC,
        btc_price_updated_at TIMESTAMPTZ,
        CONSTRAINT single_row CHECK (id = 1)
      )
    `)
    await db.query(`
      ALTER TABLE flashnet_sync_state ADD COLUMN IF NOT EXISTS btc_price_usd NUMERIC
    `)
    await db.query(`
      ALTER TABLE flashnet_sync_state ADD COLUMN IF NOT EXISTS btc_price_updated_at TIMESTAMPTZ
    `)
    
    // Ensure a row exists in flashnet_sync_state (initialize if needed)
    await db.query(`
      INSERT INTO flashnet_sync_state (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `)
    console.log('[Flashnet Sync] Step 6: Sync state table ready')
    
    // Check if BTC price needs updating (only if older than 5 minutes)
    let shouldUpdateBtcPrice = false
    try {
      const btcPriceResult = await db.query<{ btc_price_updated_at: Date | null }>(
        `SELECT btc_price_updated_at FROM flashnet_sync_state WHERE id = 1 LIMIT 1`
      )
      const lastBtcUpdate = btcPriceResult.rows[0]?.btc_price_updated_at
      
      if (!lastBtcUpdate) {
        shouldUpdateBtcPrice = true
        console.log('[Flashnet Sync] No BTC price in database, will fetch from CoinGecko')
      } else {
        const timeSinceLastUpdate = Date.now() - new Date(lastBtcUpdate).getTime()
        shouldUpdateBtcPrice = timeSinceLastUpdate >= BTC_PRICE_SYNC_INTERVAL
        if (shouldUpdateBtcPrice) {
          console.log(`[Flashnet Sync] BTC price is ${Math.round(timeSinceLastUpdate / 1000 / 60)} minutes old, will update`)
        }
      }
    } catch (error) {
      console.warn('[Flashnet Sync] Error checking BTC price age:', error)
      shouldUpdateBtcPrice = true
    }
    
    // Fetch and store BTC price from CoinGecko only if needed
    if (shouldUpdateBtcPrice) {
      console.log('[Flashnet Sync] Fetching BTC price from CoinGecko...')
      let btcPrice: number | null = null
      try {
        const btcResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        if (btcResponse.ok) {
          const btcData = await btcResponse.json()
          btcPrice = btcData.bitcoin?.usd ?? null
          if (btcPrice) {
            console.log(`[Flashnet Sync] BTC price updated: $${btcPrice.toLocaleString()}`)
            await db.query(`
              INSERT INTO flashnet_sync_state (id, btc_price_usd, btc_price_updated_at)
              VALUES (1, $1, NOW())
              ON CONFLICT (id) DO UPDATE SET 
                btc_price_usd = EXCLUDED.btc_price_usd,
                btc_price_updated_at = NOW()
            `, [btcPrice])
          } else {
            console.warn('[Flashnet Sync] CoinGecko returned no BTC price')
          }
        } else {
          console.warn(`[Flashnet Sync] CoinGecko API returned status ${btcResponse.status}`)
        }
      } catch (error) {
        console.warn('[Flashnet Sync] Failed to fetch BTC price:', error)
      }
    } else {
      console.log('[Flashnet Sync] Skipping BTC price update (price is less than 5 minutes old)')
    }
    
    // Check last metadata sync time from database
    let shouldSyncMetadata = false
    try {
      const lastSyncResult = await db.query<{ last_metadata_sync: Date | null }>(
        `SELECT last_metadata_sync FROM flashnet_sync_state LIMIT 1`
      )
      const lastSync = lastSyncResult.rows[0]?.last_metadata_sync
      
      if (!lastSync) {
        shouldSyncMetadata = true
      } else {
        const timeSinceLastSync = Date.now() - new Date(lastSync).getTime()
        shouldSyncMetadata = timeSinceLastSync >= METADATA_SYNC_INTERVAL
      }
    } catch (error) {
      shouldSyncMetadata = true
    }
    
    console.log('[Flashnet Sync] Step 7: Checking metadata sync...')
    
    // Always check for pools with missing token names and retry metadata for them
    console.log('[Flashnet Sync] Checking for pools with missing token names...')
    let poolsNeedingMetadata: FlashnetPoolRecord[] = []
    try {
      // Find pools where asset_a_address doesn't have metadata with a name/ticker
      const missingMetadataResult = await db.query<{
        lp_public_key: string
        asset_a_address: string
        asset_b_address: string
        network: string | null
        host_name: string | null
        host_namespace: string | null
        curve_type: string | null
        asset_a_name: string | null
        asset_b_name: string | null
        asset_a_symbol: string | null
        asset_b_symbol: string | null
        asset_a_decimals: number | null
        asset_b_decimals: number | null
        asset_a_reserve: number | null
        asset_b_reserve: number | null
        tvl_asset_b: number | null
        volume_24h_asset_b: number | null
        price_change_percent_24h: number | null
        current_price_a_in_b: number | null
        lp_fee_bps: number | null
        host_fee_bps: number | null
        created_at: string | null
        updated_at: string | null
      }>(
        `
          SELECT DISTINCT p.lp_public_key, p.asset_a_address, p.asset_b_address,
                 p.network, p.host_name, p.host_namespace, p.curve_type,
                 p.asset_a_name, p.asset_b_name, p.asset_a_symbol, p.asset_b_symbol,
                 p.asset_a_decimals, p.asset_b_decimals, p.asset_a_reserve, p.asset_b_reserve,
                 p.tvl_asset_b, p.volume_24h_asset_b, p.price_change_percent_24h,
                 p.current_price_a_in_b, p.lp_fee_bps, p.host_fee_bps,
                 p.created_at, p.updated_at
          FROM flashnet_pools p
          LEFT JOIN flashnet_token_metadata tm ON (
            LOWER(tm.token_identifier) = LOWER(p.asset_a_address) 
            OR LOWER(tm.token_address) = LOWER(p.asset_a_address)
          )
          WHERE p.asset_a_address IS NOT NULL
            AND p.asset_a_address != '020202020202020202020202020202020202020202020202020202020202020202'
            AND (tm.name IS NULL OR tm.name = '' OR tm.ticker IS NULL OR tm.ticker = '')
          LIMIT 50
        `
      )
      poolsNeedingMetadata = missingMetadataResult.rows as FlashnetPoolRecord[]
      if (poolsNeedingMetadata.length > 0) {
        console.log(`[Flashnet Sync] Found ${poolsNeedingMetadata.length} pools with missing/null token names, will retry metadata fetch`)
      }
    } catch (error) {
      console.warn('[Flashnet Sync] Error checking for pools with missing metadata:', error)
    }
    
    if (shouldSyncMetadata) {
      console.log(`[Flashnet Sync] Enriching pools with metadata (runs every 15 min)...`)
      try {
        await enrichPoolsWithMetadata(client, result.records)
        await db.query(`
          INSERT INTO flashnet_sync_state (id, last_metadata_sync)
          VALUES (1, NOW())
          ON CONFLICT (id) DO UPDATE SET last_metadata_sync = NOW()
        `)
        console.log(`[Flashnet Sync] Metadata enrichment complete`)
      } catch (error) {
        console.warn('[Flashnet Sync] Metadata enrichment failed:', error)
        // Continue even if metadata enrichment fails
      }
    } else {
      console.log(`[Flashnet Sync] Skipping full metadata sync (only updates every 15 min, trading data updated every 1 min)`)
    }
    
    // Always retry metadata for pools with missing names (even if full sync was skipped)
    if (poolsNeedingMetadata.length > 0) {
      console.log(`[Flashnet Sync] Retrying metadata fetch for ${poolsNeedingMetadata.length} pools with missing names...`)
      try {
        await enrichPoolsWithMetadata(client, poolsNeedingMetadata)
        console.log(`[Flashnet Sync] Metadata retry complete for pools with missing names`)
      } catch (error) {
        console.warn('[Flashnet Sync] Metadata retry failed for pools with missing names:', error)
        // Continue even if retry fails
      }
    }

    const duration = Date.now() - startTime
    console.log(`[Flashnet Sync] Sync completed in ${duration}ms`)

    return NextResponse.json({
      success: true,
      message: 'Pool sync completed',
      inserted: result.inserted,
      updated: result.updated,
      total: normalizedPools.length,
      durationMs: duration,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[Flashnet Sync] Sync error after ${duration}ms:`, error)
    console.error('[Flashnet Sync] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: duration,
      },
      { status: 500 }
    )
  }
}

