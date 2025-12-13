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
    const crawlDetails: any[] = []

    for (const crawl of crawlsRes.rows) {
      // Get detailed information about this crawl
      let timing = await getCrawlTiming(client, crawl.id)
      
      // Get last failed and completed instances
      const lastInstancesRes = await client.query(
        `SELECT 
          id,
          status,
          completed_at,
          updated_at,
          started_at
         FROM dungeon_crawl_instances
         WHERE crawl_id = $1
           AND status IN ('failed', 'completed')
         ORDER BY 
           CASE WHEN status = 'completed' THEN 1 ELSE 2 END,
           COALESCE(completed_at, updated_at) DESC
         LIMIT 2`,
        [crawl.id]
      )
      
      const lastCompleted = lastInstancesRes.rows.find((r: any) => r.status === 'completed')
      const lastFailed = lastInstancesRes.rows.find((r: any) => r.status === 'failed')
      
      // Check for active instance
      const activeCheck = await client.query(
        `SELECT COUNT(*)::int as count
         FROM dungeon_crawl_instances 
         WHERE crawl_id = $1 
           AND status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')`,
        [crawl.id]
      )
      const hasActiveInstance = activeCheck.rows[0]?.count > 0
      
      // Calculate expected restart times
      let expectedRestartAt: Date | null = null
      let timeSinceLastInstance: number | null = null
      let lastInstanceType: 'completed' | 'failed' | null = null
      let lastInstanceEndedAt: Date | null = null
      
      if (lastCompleted) {
        const completedAt = new Date(lastCompleted.completed_at)
        lastInstanceType = 'completed'
        lastInstanceEndedAt = completedAt
        timeSinceLastInstance = now.getTime() - completedAt.getTime()
        
        if (!crawl.never_restart_after_completion) {
          expectedRestartAt = new Date(completedAt.getTime() + crawl.cooldown_hours * 60 * 60 * 1000)
        }
      } else if (lastFailed) {
        const failedAt = new Date(lastFailed.updated_at)
        lastInstanceType = 'failed'
        lastInstanceEndedAt = failedAt
        timeSinceLastInstance = now.getTime() - failedAt.getTime()
        expectedRestartAt = new Date(failedAt.getTime() + crawl.restart_after_failure_hours * 60 * 60 * 1000)
      }
      
      // If timing table says 'active' but no actual instance exists, fix the timing table
      let timingInconsistencyFixed = false
      if (timing?.instanceStatus === 'active' && !hasActiveInstance) {
        console.log(`[cron/dungeon-crawl-restart] ⚠️ Timing table inconsistency detected for crawl ${crawl.id} (${crawl.name}): timing says 'active' but no actual instance exists. Fixing...`)
        
        // Update timing table to reflect actual state
        if (lastCompleted) {
          await upsertCrawlTiming(client, crawl.id, {
            instanceStatus: 'completed',
            instanceEndedAt: new Date(lastCompleted.completed_at),
            nextInstanceStartsAt: expectedRestartAt || null,
          })
        } else if (lastFailed) {
          await upsertCrawlTiming(client, crawl.id, {
            instanceStatus: 'failed',
            instanceEndedAt: new Date(lastFailed.updated_at),
            nextInstanceStartsAt: expectedRestartAt || null,
          })
        } else {
          // No previous instance, clear timing
          await upsertCrawlTiming(client, crawl.id, {
            instanceStatus: null,
            instanceEndedAt: null,
            nextInstanceStartsAt: null,
          })
        }
        
        // Refresh timing after fix
        const updatedTiming = await getCrawlTiming(client, crawl.id)
        timing = updatedTiming
        timingInconsistencyFixed = true
        console.log(`[cron/dungeon-crawl-restart] ✅ Fixed timing table for crawl ${crawl.id} (${crawl.name}) - new status: ${timing?.instanceStatus}`)
      }
      
      // Check timing table to see if we should create a new instance
      // But if we just fixed an inconsistency and it's overdue, skip the check and create immediately
      let finalShouldCreate = false
      let finalReason = ''
      
      if (timingInconsistencyFixed && expectedRestartAt && expectedRestartAt <= now) {
        // Timing table was inconsistent and it's overdue - create immediately
        finalShouldCreate = true
        finalReason = 'OVERDUE - timing table was inconsistent, now fixed and overdue'
      } else {
        // Normal check
        const shouldCreate = await shouldCreateNewInstance(
          client,
          crawl.id,
          crawl.restart_after_failure_hours,
          crawl.cooldown_hours,
          crawl.never_restart_after_completion
        )
        finalShouldCreate = shouldCreate.shouldCreate
        finalReason = shouldCreate.reason || ''
        
        // Override if no actual instance exists and it's overdue (safety check)
        if (!hasActiveInstance && !finalShouldCreate && expectedRestartAt && expectedRestartAt <= now) {
          finalShouldCreate = true
          finalReason = 'OVERDUE - expected restart time has passed'
        }
      }
      
      // Store crawl details for response
      crawlDetails.push({
        id: crawl.id,
        name: crawl.name,
        hasActiveInstance,
        shouldCreate: finalShouldCreate,
        reason: finalReason,
        lastInstanceType,
        lastInstanceEndedAt: lastInstanceEndedAt?.toISOString() || null,
        timeSinceLastInstanceMs: timeSinceLastInstance,
        timeSinceLastInstanceFormatted: timeSinceLastInstance 
          ? `${Math.floor(timeSinceLastInstance / (1000 * 60 * 60))}h ${Math.floor((timeSinceLastInstance % (1000 * 60 * 60)) / (1000 * 60))}m`
          : null,
        expectedRestartAt: expectedRestartAt?.toISOString() || null,
        timeUntilRestartMs: expectedRestartAt ? expectedRestartAt.getTime() - now.getTime() : null,
        timeUntilRestartFormatted: expectedRestartAt && expectedRestartAt > now
          ? `${Math.floor((expectedRestartAt.getTime() - now.getTime()) / (1000 * 60 * 60))}h ${Math.floor(((expectedRestartAt.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60))}m`
          : expectedRestartAt && expectedRestartAt <= now
          ? 'OVERDUE'
          : null,
        restartAfterFailureHours: crawl.restart_after_failure_hours,
        cooldownHours: crawl.cooldown_hours,
        neverRestartAfterCompletion: crawl.never_restart_after_completion,
        timingTableStatus: timing?.instanceStatus || 'no_timing_record',
        timingTableNextStart: timing?.nextInstanceStartsAt?.toISOString() || null,
      })

      if (hasActiveInstance) {
        // Active instance exists, skip
        continue
      }

      if (!finalShouldCreate) {
        // Not time yet, skip
        continue
      }

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
        
        createdCount++
        
        // Update crawl details to reflect creation
        const crawlDetail = crawlDetails.find(c => c.id === crawl.id)
        if (crawlDetail) {
          crawlDetail.created = true
          crawlDetail.createdInstanceId = instanceId
        }
      } else {
        console.log(`[cron/dungeon-crawl-restart] ⚠️ Failed to create instance for crawl ${crawl.id} - INSERT returned no rows`)
      }
    }

    return NextResponse.json({
      success: true,
      message: createdCount > 0 ? `Created ${createdCount} new instance(s)` : 'No instances needed',
      created: createdCount,
      timestamp: now.toISOString(),
      crawls: crawlDetails,
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

