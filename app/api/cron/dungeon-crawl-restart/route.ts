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
    let completedCount = 0
    const now = new Date()
    const crawlDetails: any[] = []

    // First, check for level 3 instances that should be completed
    const level3InstancesRes = await client.query(`
      SELECT 
        i.id,
        i.crawl_id,
        i.level_1_started_at,
        i.status,
        c.level_3_window_start_minutes,
        c.level_3_window_duration_minutes,
        c.min_participation_percent,
        c.name as crawl_name
      FROM dungeon_crawl_instances i
      JOIN dungeon_crawls c ON c.id = i.crawl_id
      WHERE i.status = 'level_3'
        AND i.level_1_started_at IS NOT NULL
    `)

    for (const instance of level3InstancesRes.rows) {
      const baseTime = new Date(instance.level_1_started_at)
      const elapsedMinutes = (now.getTime() - baseTime.getTime()) / (1000 * 60)
      const windowStart = instance.level_3_window_start_minutes
      const windowDuration = instance.level_3_window_duration_minutes
      const windowEnd = windowStart + windowDuration

      // Check if window has closed
      if (elapsedMinutes > windowEnd) {
        // Check participation
        const participantsRes = await client.query(
          `SELECT COUNT(*)::int AS total, 
                  SUM(CASE WHEN level_3_completed = TRUE THEN 1 ELSE 0 END)::int AS completed
           FROM dungeon_crawl_participants
           WHERE instance_id = $1 AND archived_at IS NULL`,
          [instance.id]
        )

        const total = participantsRes.rows[0]?.total ?? 0
        const completed = participantsRes.rows[0]?.completed ?? 0
        const participationPercent = total > 0 ? (completed / total) * 100 : 0

        // If participation meets or exceeds minimum, complete the instance
        if (participationPercent >= instance.min_participation_percent && total > 0) {
          const completedAt = new Date()
          await client.query(
            `UPDATE dungeon_crawl_instances
             SET status = 'completed',
                 level_3_completed_at = $1,
                 completed_at = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [completedAt.toISOString(), instance.id]
          )
          
          // Update timing table
          await upsertCrawlTiming(client, instance.crawl_id, {
            instanceStatus: 'completed',
            instanceEndedAt: completedAt,
            nextInstanceStartsAt: null, // Will be calculated based on cooldown
          })
          
          console.log(`[cron/dungeon-crawl-restart] ✅ Auto-completed instance ${instance.id} (${instance.crawl_name}) - level 3 window expired, participation: ${participationPercent.toFixed(1)}% (${completed}/${total}), required: >=${instance.min_participation_percent}%`)
          completedCount++
        }
      }
    }

    for (const crawl of crawlsRes.rows) {
      // Get detailed information about this crawl
      let timing = await getCrawlTiming(client, crawl.id)
      
      // Get the MOST RECENT instance (failed or completed) - prioritize by date, not status
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
         ORDER BY COALESCE(completed_at, updated_at) DESC
         LIMIT 1`,
        [crawl.id]
      )
      
      const lastInstance = lastInstancesRes.rows[0] || null
      
      // Also get separate instances for reporting
      const lastCompletedRes = await client.query(
        `SELECT id, status, completed_at, updated_at, started_at
         FROM dungeon_crawl_instances
         WHERE crawl_id = $1 AND status = 'completed'
         ORDER BY completed_at DESC
         LIMIT 1`,
        [crawl.id]
      )
      const lastCompleted = lastCompletedRes.rows[0] || null
      
      const lastFailedRes = await client.query(
        `SELECT id, status, completed_at, updated_at, started_at
         FROM dungeon_crawl_instances
         WHERE crawl_id = $1 AND status = 'failed'
         ORDER BY updated_at DESC
         LIMIT 1`,
        [crawl.id]
      )
      const lastFailed = lastFailedRes.rows[0] || null
      
      // Check for active instance
      const activeCheck = await client.query(
        `SELECT COUNT(*)::int as count
         FROM dungeon_crawl_instances 
         WHERE crawl_id = $1 
           AND status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')`,
        [crawl.id]
      )
      const hasActiveInstance = activeCheck.rows[0]?.count > 0
      
      // Calculate expected restart times based on MOST RECENT instance
      let expectedRestartAt: Date | null = null
      let timeSinceLastInstance: number | null = null
      let lastInstanceType: 'completed' | 'failed' | null = null
      let lastInstanceEndedAt: Date | null = null
      
      if (lastInstance) {
        // Use the most recent instance (whether failed or completed)
        if (lastInstance.status === 'completed') {
          const completedAt = new Date(lastInstance.completed_at)
        lastInstanceType = 'completed'
        lastInstanceEndedAt = completedAt
        timeSinceLastInstance = now.getTime() - completedAt.getTime()
        
        if (!crawl.never_restart_after_completion) {
          expectedRestartAt = new Date(completedAt.getTime() + crawl.cooldown_hours * 60 * 60 * 1000)
        }
        } else if (lastInstance.status === 'failed') {
          const failedAt = new Date(lastInstance.updated_at)
        lastInstanceType = 'failed'
        lastInstanceEndedAt = failedAt
        timeSinceLastInstance = now.getTime() - failedAt.getTime()
        expectedRestartAt = new Date(failedAt.getTime() + crawl.restart_after_failure_hours * 60 * 60 * 1000)
        }
      }
      
      // If timing table says 'active' but no actual instance exists, fix the timing table
      let timingInconsistencyFixed = false
      if (timing?.instanceStatus === 'active' && !hasActiveInstance) {
        console.log(`[cron/dungeon-crawl-restart] ⚠️ Timing table inconsistency detected for crawl ${crawl.id} (${crawl.name}): timing says 'active' but no actual instance exists. Fixing...`)
        
        // Update timing table to reflect actual state using the most recent instance
        if (lastInstance) {
          await upsertCrawlTiming(client, crawl.id, {
            instanceStatus: lastInstance.status,
            instanceEndedAt: lastInstance.status === 'completed' 
              ? new Date(lastInstance.completed_at)
              : new Date(lastInstance.updated_at),
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
      message: 
        completedCount > 0 && createdCount > 0 
          ? `Completed ${completedCount} instance(s) and created ${createdCount} new instance(s)`
          : completedCount > 0 
          ? `Completed ${completedCount} instance(s)`
          : createdCount > 0 
          ? `Created ${createdCount} new instance(s)` 
          : 'No instances needed',
      completed: completedCount,
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

