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

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  // Check if this is a Vercel cron job (Vercel sends x-vercel-cron header)
  const vercelCron = request.headers.get('x-vercel-cron')
  if (vercelCron === '1') {
    return true // Allow Vercel cron jobs
  }
  
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // If no secret is set, allow in development
  if (!cronSecret) {
    return process.env.NODE_ENV === 'development'
  }
  
  // If secret is set, require matching authorization header
  if (authHeader && authHeader === `Bearer ${cronSecret}`) {
    return true
  }
  
  return false
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

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

    const allPools: any[] = []
    let offset = 0
    const PAGE_SIZE = 50 // SDK page size
    const MAX_POOLS = 200 // Only fetch top 200 pools by TVL (most active/relevant)

    console.log('[Flashnet Sync] Step 3: Fetching pools from SDK (limiting to top 200 by TVL)...')
    // Fetch top pools from SDK with pagination
    while (allPools.length < MAX_POOLS) {
      // Check if we're running out of time
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.warn(`[Flashnet Sync] Approaching timeout, stopping at ${allPools.length} pools`)
        break
      }

      try {
        console.log(`[Flashnet Sync] Fetching pools at offset ${offset}...`)
        const sdkResponse = await withTimeout(
          client.listPools({
            limit: PAGE_SIZE,
            offset,
            sort: 'TVL_DESC',
          }),
          20000, // 20 second timeout per SDK call
          `SDK listPools call at offset ${offset}`
        )
        console.log(`[Flashnet Sync] SDK response received for offset ${offset}`)

        const pools = Array.isArray(sdkResponse?.pools) 
          ? sdkResponse.pools 
          : Array.isArray(sdkResponse) 
          ? sdkResponse 
          : []

        if (!pools.length) {
          console.log(`[Flashnet Sync] No more pools at offset ${offset}`)
          break
        }

        allPools.push(...pools)
        console.log(`[Flashnet Sync] Fetched ${pools.length} pools (total: ${allPools.length})`)

        // If we got fewer pools than requested, we've reached the end
        if (pools.length < PAGE_SIZE) {
          break
        }

        offset += PAGE_SIZE

        // Small delay between requests to avoid overwhelming the connection
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`[Flashnet Sync] Error fetching pools at offset ${offset}:`, error)
        // Continue with what we have
        break
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

    // Metadata enrichment: Only run every 5 minutes (metadata changes rarely)
    // This reduces API calls while keeping trading data fresh every minute
    const METADATA_SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds
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
    if (shouldSyncMetadata) {
      console.log(`[Flashnet Sync] Enriching pools with metadata (runs every 5 min)...`)
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
      console.log(`[Flashnet Sync] Skipping metadata sync (only updates every 5 min, trading data updated every 1 min)`)
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

