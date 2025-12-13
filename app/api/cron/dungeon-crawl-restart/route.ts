import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { getCrawlTiming, upsertCrawlTiming, shouldCreateNewInstance } from '@/lib/dungeon-crawl-timing'
import { ensureDungeonCrawlInfrastructure } from '@/app/api/dungeon-crawls/route'

export const dynamic = 'force-dynamic'

// Cron job to restart dungeon crawls every minute
// Uses timing table to properly track when instances should restart
export async function GET(request: NextRequest) {
  const pool = getPool()
  let client
  try {
    await ensureDungeonCrawlInfrastructure(pool)
    client = await pool.connect()
    
    // Get all active crawls
    const crawlsRes = await client.query(`
      SELECT 
        c.id,
        c.name,
        COALESCE(c.restart_after_failure_hours, 2) as restart_after_failure_hours,
        COALESCE(c.cooldown_hours, 168) as cooldown_hours,
        COALESCE(c.never_restart_after_completion, FALSE) as never_restart_after_completion
      FROM dungeon_crawls c
      WHERE c.is_active = TRUE
    `)

    let createdCount = 0
    const now = new Date()

    for (const crawl of crawlsRes.rows) {
      // Final safety check: ensure no active instance exists
      const activeCheck = await client.query(
        `SELECT COUNT(*)::int as count
         FROM dungeon_crawl_instances 
         WHERE crawl_id = $1 
           AND status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')`,
        [crawl.id]
      )

      if (activeCheck.rows[0]?.count > 0) {
        // Active instance exists, skip
        continue
      }

      // Check timing table to see if we should create a new instance
      const shouldCreate = await shouldCreateNewInstance(
        client,
        crawl.id,
        crawl.restart_after_failure_hours,
        crawl.cooldown_hours,
        crawl.never_restart_after_completion
      )

      if (!shouldCreate.shouldCreate) {
        // Not time yet, skip
        continue
      }

      // Get the most recent failed or completed instance to determine restart time
      const lastInstanceRes = await client.query(
        `SELECT 
          id,
          status,
          completed_at,
          updated_at
         FROM dungeon_crawl_instances
         WHERE crawl_id = $1
           AND status IN ('failed', 'completed')
         ORDER BY 
           CASE WHEN status = 'completed' THEN 1 ELSE 2 END,
           COALESCE(completed_at, updated_at) DESC
         LIMIT 1`,
        [crawl.id]
      )

      // Create new instance
      console.log(`[cron/dungeon-crawl-restart] 🔄 Creating new instance for crawl ${crawl.id} (${crawl.name})`)
      const instanceResult = await client.query(
        `INSERT INTO dungeon_crawl_instances (crawl_id, status, started_at)
         VALUES ($1, 'open', NOW())
         RETURNING id, crawl_id, status, created_at, started_at`,
        [crawl.id]
      )

      if (instanceResult.rows.length > 0) {
        const instance = instanceResult.rows[0]
        const instanceId = instance.id
        
        console.log(`[cron/dungeon-crawl-restart] ✅ Created instance ${instanceId} for crawl ${crawl.id} (${crawl.name})`)
        
        // Update timing table with new active instance
        await upsertCrawlTiming(client, crawl.id, {
          instanceId,
          instanceStartedAt: new Date(instance.started_at || instance.created_at),
          instanceStatus: 'active',
          level1Active: false,
          level2Active: false,
          level3Active: false,
          nextInstanceStartsAt: null, // Clear next start time since we just started
        })
        
        // If there was a previous instance, update its timing record to mark it as ended
        if (lastInstanceRes.rows.length > 0) {
          const lastInstance = lastInstanceRes.rows[0]
          const timing = await getCrawlTiming(client, crawl.id)
          
          // If timing record exists and references the old instance, update it
          if (timing && timing.instanceId === lastInstance.id) {
            await upsertCrawlTiming(client, crawl.id, {
              instanceId,
              instanceStartedAt: new Date(instance.started_at || instance.created_at),
              instanceStatus: 'active',
              level1Active: false,
              level2Active: false,
              level3Active: false,
              nextInstanceStartsAt: null,
            })
          }
        }
        
        createdCount++
      } else {
        console.log(`[cron/dungeon-crawl-restart] ⚠️ Failed to create instance for crawl ${crawl.id} - INSERT returned no rows`)
      }
    }

    return NextResponse.json({
      success: true,
      message: createdCount > 0 ? `Created ${createdCount} new instance(s)` : 'No instances needed',
      created: createdCount,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error('[cron/dungeon-crawl-restart]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to restart dungeon crawls', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

