import { NextRequest, NextResponse } from 'next/server'
import {
  ensureFlashnetTables,
  getFlashnetClient,
  upsertFlashnetPools,
  enrichPoolsWithMetadata,
  normalizePool,
  type FlashnetPoolRecord,
} from '@/lib/flashnet'

export const dynamic = 'force-dynamic'

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

  try {
    await ensureFlashnetTables()

    console.log('[Flashnet Sync] Starting pool sync from SDK...')
    const startTime = Date.now()

    const client = await getFlashnetClient()
    const allPools: any[] = []
    let offset = 0
    const PAGE_SIZE = 50 // SDK page size
    const MAX_POOLS = 1000 // Safety limit to prevent infinite loops

    // Fetch all pools from SDK with pagination
    while (allPools.length < MAX_POOLS) {
      try {
        const sdkResponse = await client.listPools({
          limit: PAGE_SIZE,
          offset,
          sort: 'TVL_DESC',
        })

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

    console.log(`[Flashnet Sync] Normalizing ${allPools.length} pools...`)
    
    // Normalize all pools
    const normalizedPools = allPools
      .map((pool: any) => normalizePool(pool))
      .filter((pool): pool is FlashnetPoolRecord => pool !== null)

    console.log(`[Flashnet Sync] Upserting ${normalizedPools.length} pools to database...`)
    
    // Upsert to database
    const result = await upsertFlashnetPools(normalizedPools)

    console.log(`[Flashnet Sync] Enriching pools with metadata...`)
    
    // Enrich with metadata (this will also fetch and store metadata)
    try {
      await enrichPoolsWithMetadata(client, result.records)
      console.log(`[Flashnet Sync] Metadata enrichment complete`)
    } catch (error) {
      console.warn('[Flashnet Sync] Metadata enrichment failed:', error)
      // Continue even if metadata enrichment fails
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: 'Pool sync completed',
      inserted: result.inserted,
      updated: result.updated,
      total: normalizedPools.length,
      durationMs: duration,
    })
  } catch (error) {
    console.error('[Flashnet Sync] Sync error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

