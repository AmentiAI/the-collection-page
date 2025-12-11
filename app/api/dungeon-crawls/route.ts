import { NextRequest, NextResponse } from 'next/server'
import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureDungeonCrawlInfrastructure(pool: ReturnType<typeof getPool>) {
  if (isTableInitialized('dungeon_crawls')) {
    return
  }
  // Tables should be created via migration script
  markTableInitialized('dungeon_crawls')
}

function mapCrawlRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    requiredParticipants: Number(row.required_participants ?? 60),
    allowMultipleFromStock: Boolean(row.allow_multiple_from_stock),
    allowedTraits: row.allowed_traits || 'all',
    restartAfterFailureHours: Number(row.restart_after_failure_hours ?? row.restart_interval_hours ?? 2),
    cooldownHours: Number(row.cooldown_hours ?? (row.cooldown_days ? row.cooldown_days * 24 : 168)),
    neverRestartAfterCompletion: Boolean(row.never_restart_after_completion ?? false),
    rewardType: row.reward_type,
    rewardValue: Number(row.reward_value),
    level1WindowStartMinutes: Number(row.level_1_window_start_minutes ?? 0),
    level1WindowDurationMinutes: Number(row.level_1_window_duration_minutes ?? 2),
    level2WindowStartMinutes: Number(row.level_2_window_start_minutes ?? 4),
    level2WindowDurationMinutes: Number(row.level_2_window_duration_minutes ?? 2),
    level3WindowStartMinutes: Number(row.level_3_window_start_minutes ?? 8),
    level3WindowDurationMinutes: Number(row.level_3_window_duration_minutes ?? 2),
    minParticipationPercent: Number(row.min_participation_percent ?? 80),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapInstanceRow(row: any, participants: any[] = [], rewardCount: number = 0) {
  const participantsArray = participants || []
  return {
    id: row.instance_id || row.id,
    crawlId: row.crawl_id,
    status: row.instance_status || row.status || 'open',
    startedAt: row.instance_started_at || row.started_at,
    level1StartedAt: row.level_1_started_at,
    level1CompletedAt: row.level_1_completed_at,
    level2StartedAt: row.level_2_started_at,
    level2CompletedAt: row.level_2_completed_at,
    level3StartedAt: row.level_3_started_at,
    level3CompletedAt: row.level_3_completed_at,
    completedAt: row.instance_completed_at || row.completed_at,
    expiresAt: row.instance_expires_at || row.expires_at,
    lastRestartAt: row.last_restart_at,
    nextRestartAt: row.next_restart_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants: participantsArray,
    participantCount: participantsArray.length,
    myRewardCount: rewardCount,
  }
}

// Helper function to check for expired windows and mark instances as failed
async function checkExpiredWindows(client: any) {
  const now = new Date()
  
  // Get all active instances that might have expired windows
  // Include 'ready' status - when instance becomes ready, level_1_started_at is set and timer starts
  // Windows start counting when level 1 actually begins (level_1_started_at is set)
  const instancesRes = await client.query(`
    SELECT 
      i.id,
      i.status,
      i.started_at,
      i.level_1_started_at,
      i.level_1_completed_at,
      i.level_2_started_at,
      i.level_2_completed_at,
      i.level_3_started_at,
      i.level_3_completed_at,
      c.level_1_window_start_minutes,
      c.level_1_window_duration_minutes,
      c.level_2_window_start_minutes,
      c.level_2_window_duration_minutes,
      c.level_3_window_start_minutes,
      c.level_3_window_duration_minutes,
      c.min_participation_percent
    FROM dungeon_crawl_instances i
    JOIN dungeon_crawls c ON c.id = i.crawl_id
    WHERE i.status IN ('ready', 'level_1', 'level_2', 'level_3')
      AND i.level_1_started_at IS NOT NULL
  `)

  for (const instance of instancesRes.rows) {
    // Use level_1_started_at as base time for all level calculations
    // This is when the crawl actually started (not when instance was created)
    const baseTime = new Date(instance.level_1_started_at)
    const elapsedMinutes = (now.getTime() - baseTime.getTime()) / (1000 * 60)

    // Check each level window
    for (let level = 1; level <= 3; level++) {
      let windowStart: number
      let windowDuration: number
      let levelColumn: string
      let levelCompletedAt: Date | null
      let requiredStatus: string

      if (level === 1) {
        windowStart = instance.level_1_window_start_minutes
        windowDuration = instance.level_1_window_duration_minutes
        levelColumn = 'level_1_completed'
        levelCompletedAt = instance.level_1_completed_at
        requiredStatus = 'ready'
      } else if (level === 2) {
        windowStart = instance.level_2_window_start_minutes
        windowDuration = instance.level_2_window_duration_minutes
        levelColumn = 'level_2_completed'
        levelCompletedAt = instance.level_2_completed_at
        requiredStatus = 'level_1'
      } else {
        windowStart = instance.level_3_window_start_minutes
        windowDuration = instance.level_3_window_duration_minutes
        levelColumn = 'level_3_completed'
        levelCompletedAt = instance.level_3_completed_at
        requiredStatus = 'level_2'
      }

      const windowEnd = windowStart + windowDuration

      // Check if window expired and level wasn't completed
      // We need to check ALL expired windows, even if the instance has moved forward
      // This catches cases where level 1 window expired with <80% participation but instance somehow moved to level_2
      // Only skip if the level was actually completed (levelCompletedAt is set)
      if (elapsedMinutes > windowEnd && !levelCompletedAt) {
        const participantsRes = await client.query(
          `SELECT COUNT(*)::int AS total, 
                  SUM(CASE WHEN ${levelColumn} = TRUE THEN 1 ELSE 0 END)::int AS completed
           FROM dungeon_crawl_participants
           WHERE instance_id = $1 AND archived_at IS NULL`,
          [instance.id]
        )

        const total = participantsRes.rows[0]?.total ?? 0
        const completed = participantsRes.rows[0]?.completed ?? 0
        const participationPercent = total > 0 ? (completed / total) * 100 : 0

        // Mark as failed if window expired and level wasn't completed
        // For 'ready' status with expired window, always fail if no one completed (window closed, no completions)
        // For other statuses, check participation threshold - if at or below min_participation_percent, it's a failure
        if (!levelCompletedAt) {
          let shouldFail = false
          let shouldAdvance = false
          
          if (instance.status === 'ready' && level === 1) {
            // 'ready' instance: if window expired and no one completed, it's a failure
            // Even if total is 0 (shouldn't happen for 'ready', but be safe)
            shouldFail = total > 0 && completed === 0
          } else if (total > 0) {
            // For level_1, level_2, level_3 statuses: check participation threshold
            // If participation is at or below min_participation_percent, it's a failure (must be OVER minimum)
            // This handles the case where window expired and not enough people completed
            shouldFail = participationPercent <= instance.min_participation_percent || completed === 0
            
            // If participation > minimum, advance to next level automatically when window closes
            // Only advance if instance is currently on the level we're checking
            // Level 1: status should be 'ready' or 'level_1' (level 1 in progress)
            // Level 2: status should be 'level_1' or 'level_2' (level 2 in progress)
            // Level 3: status should be 'level_2' or 'level_3' (level 3 in progress)
            let isOnCorrectLevel = false
            if (level === 1) {
              isOnCorrectLevel = instance.status === 'ready' || instance.status === 'level_1'
            } else if (level === 2) {
              isOnCorrectLevel = instance.status === 'level_1' || instance.status === 'level_2'
            } else {
              isOnCorrectLevel = instance.status === 'level_2' || instance.status === 'level_3'
            }
            
            // Must be OVER the minimum (not equal) to advance when window closes
            if (participationPercent > instance.min_participation_percent && isOnCorrectLevel) {
              shouldAdvance = true
            }
          } else if (total === 0) {
            // No participants at all - this shouldn't happen but mark as failed
            shouldFail = true
          }
          
          // Auto-advance level if window closed and participation > minimum (PRIORITY: do this before failing)
          if (shouldAdvance && !shouldFail) {
            const completedAt = new Date()
            
            if (level === 1) {
              // Advance from level 1 to level 2
              await client.query(
                `UPDATE dungeon_crawl_instances
                 SET status = 'level_2',
                     level_1_completed_at = $1,
                     level_2_started_at = COALESCE(level_2_started_at, NOW()),
                     updated_at = NOW()
                 WHERE id = $2`,
                [completedAt.toISOString(), instance.id]
              )
              console.log(`[checkExpiredWindows] Auto-advanced instance ${instance.id} from level_1 to level_2 - window expired, participation: ${participationPercent.toFixed(1)}% (${completed}/${total}), required: >${instance.min_participation_percent}%`)
              // Update instance status for next iteration
              instance.status = 'level_2'
              instance.level_1_completed_at = completedAt
              continue // Skip to next level check, don't mark as failed
            } else if (level === 2) {
              // Advance from level 2 to level 3
              await client.query(
                `UPDATE dungeon_crawl_instances
                 SET status = 'level_3',
                     level_2_completed_at = $1,
                     level_3_started_at = COALESCE(level_3_started_at, NOW()),
                     updated_at = NOW()
                 WHERE id = $2`,
                [completedAt.toISOString(), instance.id]
              )
              console.log(`[checkExpiredWindows] Auto-advanced instance ${instance.id} from level_2 to level_3 - window expired, participation: ${participationPercent.toFixed(1)}% (${completed}/${total}), required: >${instance.min_participation_percent}%`)
              // Update instance status for next iteration
              instance.status = 'level_3'
              instance.level_2_completed_at = completedAt
              continue // Skip to next level check, don't mark as failed
            } else if (level === 3) {
              // Complete the entire dungeon crawl
              await client.query(
                `UPDATE dungeon_crawl_instances
                 SET status = 'completed',
                     level_3_completed_at = $1,
                     completed_at = $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [completedAt.toISOString(), instance.id]
              )
              console.log(`[checkExpiredWindows] Auto-completed instance ${instance.id} - level 3 window expired, participation: ${participationPercent.toFixed(1)}% (${completed}/${total}), required: >${instance.min_participation_percent}%`)
              // Update instance status
              instance.status = 'completed'
              instance.level_3_completed_at = completedAt
              break // Instance is complete, no need to check further levels
            }
          }
          
          if (shouldFail) {
            // Archive all participants from this failed instance (don't delete for history)
          await client.query(
              `UPDATE dungeon_crawl_participants 
               SET archived_at = NOW() 
               WHERE instance_id = $1 AND archived_at IS NULL`,
            [instance.id]
          )
          await client.query(
            `UPDATE dungeon_crawl_instances
             SET status = 'failed', updated_at = NOW()
             WHERE id = $1 AND status != 'failed'`,
            [instance.id]
          )
            console.log(`[checkExpiredWindows] Marked instance ${instance.id} as failed - window expired (${elapsedMinutes.toFixed(1)}m > ${windowEnd}m), level ${level} not completed, participation: ${participationPercent.toFixed(1)}% (${completed}/${total}), required: >${instance.min_participation_percent}%`)
          break // Only mark once per instance
          }
        }
      }
    }
  }
}

// Helper function to cleanup invalid instances (created too early, before cooldown expired)
async function cleanupInvalidInstances(client: any) {
  // Find instances that were created but shouldn't exist yet (cooldown hasn't passed)
  // An instance is invalid if:
  // 1. There's a completed instance that completed before this instance was created, and it's still in cooldown
  // 2. There's a failed instance that failed before this instance was created, and it's still in cooldown
  // 3. There's a more recent completed/failed instance that's still in cooldown (takes priority)
  // 4. There's a failed instance that was updated recently (within last 5 minutes) - prevents spam loops
  const invalidInstancesRes = await client.query(`
    SELECT 
      i.id,
      i.crawl_id,
      i.status,
      i.created_at,
      c.restart_after_failure_hours,
      c.restart_interval_hours,
      c.cooldown_hours,
      c.cooldown_days,
      c.never_restart_after_completion
    FROM dungeon_crawl_instances i
    JOIN dungeon_crawls c ON c.id = i.crawl_id
    WHERE i.status IN ('open', 'filling', 'ready')
      AND (
        -- Safety check: if there's ANY failed instance updated in last 5 minutes, mark this as invalid
        -- This prevents spam loops where instances are created and immediately marked as failed
        EXISTS (
          SELECT 1 FROM dungeon_crawl_instances failed
          WHERE failed.crawl_id = i.crawl_id
            AND failed.status = 'failed'
            AND failed.updated_at > NOW() - '5 minutes'::INTERVAL
        )
        OR
        -- Check if there's a completed instance that's still in cooldown
        -- Priority: most recent completed instance
        EXISTS (
          SELECT 1 FROM (
            SELECT completed_at
            FROM dungeon_crawl_instances completed
            WHERE completed.crawl_id = i.crawl_id
              AND completed.status = 'completed'
              AND completed.completed_at IS NOT NULL
            ORDER BY completed.completed_at DESC
            LIMIT 1
          ) most_recent_completed
          WHERE most_recent_completed.completed_at > NOW() - (COALESCE(NULLIF(c.cooldown_hours, 0), c.cooldown_days * 24, 168) || ' hours')::INTERVAL
            AND COALESCE(c.never_restart_after_completion, FALSE) = FALSE
        )
        OR
        -- Check if there's a failed instance that's still in cooldown
        -- Priority: most recent failed instance (only if no completed instance is blocking)
        EXISTS (
          SELECT 1 FROM (
            SELECT updated_at
            FROM dungeon_crawl_instances failed
            WHERE failed.crawl_id = i.crawl_id
              AND failed.status = 'failed'
            ORDER BY failed.updated_at DESC
            LIMIT 1
          ) most_recent_failed
          WHERE most_recent_failed.updated_at > NOW() - (COALESCE(NULLIF(c.restart_after_failure_hours, 0), c.restart_interval_hours, 2) || ' hours')::INTERVAL
            -- Only block if there's no completed instance still in cooldown (completed takes priority)
            AND NOT EXISTS (
              SELECT 1 FROM (
                SELECT completed_at
                FROM dungeon_crawl_instances completed
                WHERE completed.crawl_id = i.crawl_id
                  AND completed.status = 'completed'
                  AND completed.completed_at IS NOT NULL
                ORDER BY completed.completed_at DESC
                LIMIT 1
              ) blocking_completed
              WHERE blocking_completed.completed_at > NOW() - (COALESCE(NULLIF(c.cooldown_hours, 0), c.cooldown_days * 24, 168) || ' hours')::INTERVAL
                AND COALESCE(c.never_restart_after_completion, FALSE) = FALSE
            )
        )
      )
  `)

  // Mark invalid instances as failed
  let markedCount = 0
  for (const invalid of invalidInstancesRes.rows) {
    // Archive participants
    await client.query(
      `UPDATE dungeon_crawl_participants 
       SET archived_at = NOW() 
       WHERE instance_id = $1 AND archived_at IS NULL`,
      [invalid.id]
    )
    // Mark instance as failed
    const updateResult = await client.query(
      `UPDATE dungeon_crawl_instances
       SET status = 'failed', updated_at = NOW()
       WHERE id = $1 AND status != 'failed'
       RETURNING id`,
      [invalid.id]
    )
    if (updateResult.rows.length > 0) {
      markedCount++
      console.log(`[cleanupInvalidInstances] Marked instance ${invalid.id} as failed - created too early (cooldown not expired)`)
    }
  }
  return markedCount
}

// Helper function to auto-restart overdue crawls
async function autoRestartOverdueCrawls(client: any) {
  // Get all active crawls that don't have an active instance
  // AND check if cooldown/restart period has passed
  const crawlsToRestart = await client.query(`
    SELECT DISTINCT 
      c.id,
      COALESCE(c.restart_after_failure_hours, c.restart_interval_hours, 2) as restart_after_failure_hours,
      COALESCE(c.cooldown_hours, c.cooldown_days * 24, 168) as cooldown_hours,
      COALESCE(c.never_restart_after_completion, FALSE) as never_restart_after_completion
    FROM dungeon_crawls c
    WHERE c.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM dungeon_crawl_instances i
        WHERE i.crawl_id = c.id
          AND i.status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
      )
      AND (
        -- No previous instances (first time) - allow restart
        NOT EXISTS (
          SELECT 1 FROM dungeon_crawl_instances i
          WHERE i.crawl_id = c.id
        )
        OR
        -- Check if we can restart: Completed instances take priority over failed
        (
          -- If there's a completed instance that's still in cooldown, don't restart
          -- Otherwise, check if most recent failed is past its cooldown
          (
            -- No completed instances exist, OR all completed instances are past cooldown
            NOT EXISTS (
              SELECT 1 FROM dungeon_crawl_instances i
              WHERE i.crawl_id = c.id
                AND i.status = 'completed'
                AND i.completed_at IS NOT NULL
                AND i.completed_at > NOW() - (COALESCE(NULLIF(c.cooldown_hours, 0), c.cooldown_days * 24, 168) || ' hours')::INTERVAL
            )
            AND COALESCE(c.never_restart_after_completion, FALSE) = FALSE
          )
          AND
          -- Most recent failed instance is past its cooldown (or no failed instances)
          (
            NOT EXISTS (
              SELECT 1 FROM dungeon_crawl_instances i
              WHERE i.crawl_id = c.id
                AND i.status = 'failed'
            )
            OR
            -- Check if the MOST RECENT failed instance is past its cooldown
            -- Also add a safety buffer: don't create if failed within last 5 minutes (prevents race conditions)
            NOT EXISTS (
              SELECT 1 FROM (
                SELECT updated_at
                FROM dungeon_crawl_instances i
                WHERE i.crawl_id = c.id
                  AND i.status = 'failed'
                ORDER BY i.updated_at DESC
                LIMIT 1
              ) most_recent_failed
              WHERE most_recent_failed.updated_at > NOW() - GREATEST(
                (COALESCE(NULLIF(c.restart_after_failure_hours, 0), c.restart_interval_hours, 2) || ' hours')::INTERVAL,
                '5 minutes'::INTERVAL
              )
            )
          )
        )
      )
  `)

  // Create new instance for each crawl that should be restarted
  // Double-check no active instances exist before creating (prevent race conditions)
  for (const row of crawlsToRestart.rows) {
    // Final safety check: ensure no active instance exists AND no recent failures
    const finalCheck = await client.query(
      `SELECT 
        COUNT(*)::int as active_count,
        COUNT(CASE WHEN status = 'failed' AND (updated_at > NOW() - '10 minutes'::INTERVAL OR created_at > NOW() - '10 minutes'::INTERVAL) THEN 1 END)::int as recent_failures
       FROM dungeon_crawl_instances 
       WHERE crawl_id = $1 
         AND (status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
           OR (status = 'failed' AND (updated_at > NOW() - '10 minutes'::INTERVAL OR created_at > NOW() - '10 minutes'::INTERVAL)))`,
      [row.id]
    )
    
    const hasActive = finalCheck.rows[0]?.active_count > 0
    const hasRecentFailures = finalCheck.rows[0]?.recent_failures > 0
    
    if (!hasActive && !hasRecentFailures) {
      await client.query(
        `INSERT INTO dungeon_crawl_instances (crawl_id, status)
         VALUES ($1, 'open')
         ON CONFLICT DO NOTHING`,
        [row.id]
      )
      console.log(`[autoRestartOverdueCrawls] Created new instance for crawl ${row.id}`)
    } else {
      if (hasRecentFailures) {
        console.log(`[autoRestartOverdueCrawls] Skipped creating instance for crawl ${row.id} - recent failure detected (within last 10 minutes)`)
      } else {
        console.log(`[autoRestartOverdueCrawls] Skipped creating instance for crawl ${row.id} - active instance exists`)
      }
    }
  }
}

// GET - List active dungeon crawls and their instances
export async function GET(request: NextRequest) {
  const pool = getPool()
  try {
    await ensureDungeonCrawlInfrastructure(pool)
    
    // Get wallet from query params if provided
    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')
    
    const client = await pool.connect()
    try {
      // Cleanup invalid instances (created too early, before cooldown expired)
      const cleanupResult = await cleanupInvalidInstances(client)
      
      // Check for expired windows and mark failed instances
      await checkExpiredWindows(client)
      
      // Auto-restart overdue crawls (create new instances if restart time has passed)
      // Only run if there are no active instances to prevent restart loops
      // Also check if any instance was just marked as failed (within last 10 minutes) to prevent race conditions
      const activeInstanceCheck = await client.query(
        `SELECT 
          COUNT(*)::int as active_count
         FROM dungeon_crawl_instances 
         WHERE status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')`
      )
      // Check for recent failures (updated or created) to prevent spam loops
      const recentFailureCheck = await client.query(
        `SELECT COUNT(*)::int as recent_failures
         FROM dungeon_crawl_instances 
         WHERE status = 'failed' 
           AND (updated_at > NOW() - '10 minutes'::INTERVAL OR created_at > NOW() - '10 minutes'::INTERVAL)`
      )
      const hasActiveInstances = activeInstanceCheck.rows[0]?.active_count > 0
      const hasRecentFailures = recentFailureCheck.rows[0]?.recent_failures > 0
      const justCleanedUp = cleanupResult > 0
      
      // Only auto-restart if:
      // 1. No active instances exist
      // 2. No instances were just marked as failed (prevents race condition where checkExpiredWindows just failed one)
      // 3. No instances were created recently that might be invalid
      // 4. cleanupInvalidInstances didn't just mark anything as failed (prevents immediate re-creation)
      if (!hasActiveInstances && !hasRecentFailures && !justCleanedUp) {
        await autoRestartOverdueCrawls(client)
      } else {
        if (justCleanedUp) {
          console.log(`[GET] Skipped autoRestartOverdueCrawls - cleanupInvalidInstances just marked ${cleanupResult} instance(s) as failed`)
        } else if (hasRecentFailures) {
          console.log(`[GET] Skipped autoRestartOverdueCrawls - recent failure detected (within last 10 minutes)`)
        }
      }
      
      // Get all active crawl configs with their current active instances
      const crawlsRes = await client.query(`
        SELECT 
          c.*,
          i.id as instance_id,
          i.status as instance_status,
          i.started_at as instance_started_at,
          i.level_1_started_at,
          i.level_1_completed_at,
          i.level_2_started_at,
          i.level_2_completed_at,
          i.level_3_started_at,
          i.level_3_completed_at,
          i.completed_at as instance_completed_at,
          i.expires_at as instance_expires_at,
          i.next_restart_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', p.id,
                'wallet', p.wallet,
                'inscriptionId', p.inscription_id,
                'image', COALESCE(
                  p.inscription_image,
                  CONCAT('https://ord-mirror.magiceden.dev/content/', p.inscription_id)
                ),
                'trait', p.trait,
                'joinedAt', p.joined_at,
                'level1Completed', p.level_1_completed,
                'level1CompletedAt', p.level_1_completed_at,
                'level2Completed', p.level_2_completed,
                'level2CompletedAt', p.level_2_completed_at,
                'level3Completed', p.level_3_completed,
                'level3CompletedAt', p.level_3_completed_at,
                'username', prof.username,
                'avatarUrl', prof.avatar_url
              )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::json
          ) AS participants
        FROM dungeon_crawls c
        LEFT JOIN dungeon_crawl_instances i ON i.crawl_id = c.id 
          AND i.status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
          AND i.status != 'failed'  -- Explicitly exclude failed instances
        LEFT JOIN dungeon_crawl_participants p ON p.instance_id = i.id AND p.archived_at IS NULL
        LEFT JOIN profiles prof ON LOWER(prof.wallet_address) = LOWER(p.wallet)
        WHERE c.is_active = TRUE
        GROUP BY c.id, i.id
        ORDER BY c.created_at DESC
      `)
      
      // Also get all active crawls that have no active instances at all
      // This ensures we include crawls that only have failed/completed instances
      const allActiveCrawlsRes = await client.query(`
        SELECT c.id
        FROM dungeon_crawls c
        WHERE c.is_active = TRUE
      `)
      
      const allActiveCrawlIds = new Set(allActiveCrawlsRes.rows.map(r => r.id))

      // Get failed/completed instances for history
      const historyRes = await client.query(`
        SELECT 
          c.*,
          i.id as instance_id,
          i.status as instance_status,
          i.started_at as instance_started_at,
          i.level_1_started_at,
          i.level_1_completed_at,
          i.level_2_started_at,
          i.level_2_completed_at,
          i.level_3_started_at,
          i.level_3_completed_at,
          i.completed_at as instance_completed_at,
          i.expires_at as instance_expires_at,
          i.next_restart_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', p.id,
                'wallet', p.wallet,
                'inscriptionId', p.inscription_id,
                'image', COALESCE(
                  p.inscription_image,
                  CONCAT('https://ord-mirror.magiceden.dev/content/', p.inscription_id)
                ),
                'trait', p.trait,
                'joinedAt', p.joined_at,
                'level1Completed', p.level_1_completed,
                'level1CompletedAt', p.level_1_completed_at,
                'level2Completed', p.level_2_completed,
                'level2CompletedAt', p.level_2_completed_at,
                'level3Completed', p.level_3_completed,
                'level3CompletedAt', p.level_3_completed_at,
                'username', prof.username,
                'avatarUrl', prof.avatar_url
              )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::json
          ) AS participants
        FROM dungeon_crawls c
        LEFT JOIN dungeon_crawl_instances i ON i.crawl_id = c.id 
          AND i.status IN ('failed', 'completed', 'expired')
        LEFT JOIN dungeon_crawl_participants p ON p.instance_id = i.id
        LEFT JOIN profiles prof ON LOWER(prof.wallet_address) = LOWER(p.wallet)
        WHERE c.is_active = TRUE
        GROUP BY c.id, i.id
        ORDER BY i.updated_at DESC
        LIMIT 20
      `)

      // Get last completed and last failed timestamps for all crawls (for display purposes)
      const lastInstanceTimestamps = await client.query(`
        SELECT 
          c.id as crawl_id,
          (
            SELECT i.completed_at 
            FROM dungeon_crawl_instances i 
            WHERE i.crawl_id = c.id AND i.status = 'completed' AND i.completed_at IS NOT NULL
            ORDER BY i.completed_at DESC 
            LIMIT 1
          ) as last_completed_at,
          (
            SELECT i.updated_at 
            FROM dungeon_crawl_instances i 
            WHERE i.crawl_id = c.id AND i.status = 'failed'
            ORDER BY i.updated_at DESC 
            LIMIT 1
          ) as last_failed_at
        FROM dungeon_crawls c
        WHERE c.is_active = TRUE
      `)

      const lastTimestampsMap = new Map()
      for (const row of lastInstanceTimestamps.rows) {
        lastTimestampsMap.set(row.crawl_id, {
          lastCompletedAt: row.last_completed_at,
          lastFailedAt: row.last_failed_at,
        })
      }

      // Get most recent failed/completed instance per crawl to calculate next restart time
      // This query finds crawls with no active instances and gets their most recent failed/completed instance
      const nextRestartRes = await client.query(`
        SELECT DISTINCT ON (c.id)
          c.id as crawl_id,
          c.restart_after_failure_hours,
          c.cooldown_hours,
          c.never_restart_after_completion,
          i.status,
          i.updated_at,
          i.completed_at
        FROM dungeon_crawls c
        INNER JOIN dungeon_crawl_instances i ON i.crawl_id = c.id
          AND i.status IN ('failed', 'completed')
        WHERE c.is_active = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM dungeon_crawl_instances active
            WHERE active.crawl_id = c.id
              AND active.status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
          )
        ORDER BY c.id, i.updated_at DESC
      `)

      const nextRestartMap = new Map()
      const now = new Date()
      for (const row of nextRestartRes.rows) {
        if (!row.updated_at && !row.completed_at) continue // No instances yet
        
        let nextRestartTime: Date | null = null
        if (row.status === 'failed') {
          const restartHours = row.restart_after_failure_hours || 2
          // Calculate restart time from when the instance was marked as failed (updated_at)
          const failedAt = new Date(row.updated_at).getTime()
          nextRestartTime = new Date(failedAt + restartHours * 60 * 60 * 1000)
        } else if (row.status === 'completed' && !row.never_restart_after_completion) {
          const cooldownHours = row.cooldown_hours || 168
          nextRestartTime = new Date(new Date(row.completed_at).getTime() + cooldownHours * 60 * 60 * 1000)
        }
        
        // Always set nextRestartTime, even if it's in the past (means restart is overdue)
        if (nextRestartTime) {
          nextRestartMap.set(row.crawl_id, nextRestartTime.toISOString())
        }
      }

      const crawlsMap = new Map()
      const historyMap = new Map()
      
      // Process active instances
      for (const row of crawlsRes.rows) {
        const crawlId = row.id
        if (!crawlsMap.has(crawlId)) {
          const crawlData = {
            ...mapCrawlRow(row),
            instances: [],
            nextRestartAt: null, // Will be set below if needed
          }
          crawlsMap.set(crawlId, crawlData)
        }
        
        if (row.instance_id) {
          const participants = Array.isArray(row.participants) ? row.participants : []
          const instance = mapInstanceRow(row, participants)
          const crawl = crawlsMap.get(crawlId)
          crawl.instances.push(instance)
        }
      }
      
      // Update all crawls with nextRestartAt and last timestamps
      for (const [crawlId, crawl] of Array.from(crawlsMap)) {
        if (crawl.instances.length === 0) {
          const nextRestartAt = nextRestartMap.get(crawlId)
          if (nextRestartAt) {
            crawl.nextRestartAt = nextRestartAt
          }
        }
        
        // Add last completed/failed timestamps
        const timestamps = lastTimestampsMap.get(crawlId)
        if (timestamps) {
          crawl.lastCompletedAt = timestamps.lastCompletedAt || null
          crawl.lastFailedAt = timestamps.lastFailedAt || null
        } else {
          crawl.lastCompletedAt = null
          crawl.lastFailedAt = null
        }
      }
      
      // Ensure all active crawls have instances - create if missing (but respect cooldown)
      // NOTE: This should NOT run if autoRestartOverdueCrawls already handled it
      // Only create if there's truly no active instance AND cooldown has passed
      for (const crawlId of Array.from(allActiveCrawlIds)) {
        const crawl = crawlsMap.get(crawlId)
        if (!crawl || crawl.instances.length === 0) {
          // Double-check there's no active instance (race condition protection)
          const activeInstanceCheck = await client.query(
            `SELECT 1 FROM dungeon_crawl_instances 
             WHERE crawl_id = $1 
             AND status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
             LIMIT 1`,
            [crawlId]
          )
          
          if (activeInstanceCheck.rows.length > 0) {
            // Active instance exists, skip
            continue
          }
          
          // Check if we should create a new instance (respect cooldown)
          // Must check MOST RECENT failed/completed instance to prevent loops
          const shouldCreateInstance = await client.query(`
            SELECT 
              CASE 
                -- No previous instances - allow creation
                WHEN NOT EXISTS (
                  SELECT 1 FROM dungeon_crawl_instances i
                  WHERE i.crawl_id = c.id
                ) THEN TRUE
                -- Check if MOST RECENT completed instance is past cooldown (completed takes priority)
                WHEN EXISTS (
                  SELECT 1 FROM (
                    SELECT completed_at
                    FROM dungeon_crawl_instances i
                    WHERE i.crawl_id = c.id
                      AND i.status = 'completed'
                      AND i.completed_at IS NOT NULL
                    ORDER BY i.completed_at DESC
                    LIMIT 1
                  ) most_recent_completed
                  WHERE most_recent_completed.completed_at <= NOW() - (COALESCE(NULLIF(c.cooldown_hours, 0), c.cooldown_days * 24, 168) || ' hours')::INTERVAL
                    AND COALESCE(c.never_restart_after_completion, FALSE) = FALSE
                ) THEN TRUE
                -- If no completed instances OR most recent completed is past cooldown, check MOST RECENT failed
                WHEN (
                  -- No completed instances exist, OR most recent completed is past cooldown
                  NOT EXISTS (
                    SELECT 1 FROM (
                      SELECT completed_at
                      FROM dungeon_crawl_instances i
                      WHERE i.crawl_id = c.id
                        AND i.status = 'completed'
                        AND i.completed_at IS NOT NULL
                      ORDER BY i.completed_at DESC
                      LIMIT 1
                    ) blocking_completed
                    WHERE blocking_completed.completed_at > NOW() - (COALESCE(NULLIF(c.cooldown_hours, 0), c.cooldown_days * 24, 168) || ' hours')::INTERVAL
                      AND COALESCE(c.never_restart_after_completion, FALSE) = FALSE
                  )
                  AND (
                    -- No failed instances, OR most recent failed is past cooldown
                    NOT EXISTS (
                      SELECT 1 FROM dungeon_crawl_instances i
                      WHERE i.crawl_id = c.id
                        AND i.status = 'failed'
                    )
                    OR
                    NOT EXISTS (
                      SELECT 1 FROM (
                        SELECT updated_at
                        FROM dungeon_crawl_instances i
                        WHERE i.crawl_id = c.id
                          AND i.status = 'failed'
                        ORDER BY i.updated_at DESC
                        LIMIT 1
                      ) most_recent_failed
                      WHERE most_recent_failed.updated_at > NOW() - GREATEST(
                        (COALESCE(NULLIF(c.restart_after_failure_hours, 0), c.restart_interval_hours, 2) || ' hours')::INTERVAL,
                        '5 minutes'::INTERVAL
                      )
                    )
                  )
                ) THEN TRUE
                ELSE FALSE
              END as should_create
            FROM dungeon_crawls c
            WHERE c.id = $1
          `, [crawlId])
          
          if (shouldCreateInstance.rows.length > 0 && shouldCreateInstance.rows[0].should_create) {
            // Final safety check: ensure no active instance exists AND no recent failures
            const finalCheck = await client.query(
              `SELECT 
                COUNT(*)::int as active_count,
                COUNT(CASE WHEN status = 'failed' AND (updated_at > NOW() - '10 minutes'::INTERVAL OR created_at > NOW() - '10 minutes'::INTERVAL) THEN 1 END)::int as recent_failures
               FROM dungeon_crawl_instances 
               WHERE crawl_id = $1 
                 AND (status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
                   OR (status = 'failed' AND (updated_at > NOW() - '10 minutes'::INTERVAL OR created_at > NOW() - '10 minutes'::INTERVAL)))`,
              [crawlId]
            )
            
            const hasActive = finalCheck.rows[0]?.active_count > 0
            const hasRecentFailures = finalCheck.rows[0]?.recent_failures > 0
            
            if (!hasActive && !hasRecentFailures) {
              // Create new instance only if cooldown has passed and no active instance exists
              await client.query(
                `INSERT INTO dungeon_crawl_instances (crawl_id, status)
                 VALUES ($1, 'open')
                 ON CONFLICT DO NOTHING`,
                [crawlId]
              )
              console.log(`[GET] Created new instance for crawl ${crawlId} (fallback logic)`)
            } else {
              if (hasRecentFailures) {
                console.log(`[GET] Skipped creating instance for crawl ${crawlId} - recent failure detected (within last 10 minutes) (fallback logic)`)
              } else {
                console.log(`[GET] Skipped creating instance for crawl ${crawlId} - active instance exists (fallback logic)`)
              }
            }
          }
          // If should_create is false, don't create - cooldown hasn't passed
          
          // Re-fetch this crawl's instance
          const instanceRes = await client.query(`
            SELECT 
              c.*,
              i.id as instance_id,
              i.status as instance_status,
              i.started_at as instance_started_at,
              i.level_1_started_at,
              i.level_1_completed_at,
              i.level_2_started_at,
              i.level_2_completed_at,
              i.level_3_started_at,
              i.level_3_completed_at,
              i.completed_at as instance_completed_at,
              i.expires_at as instance_expires_at,
              i.next_restart_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', p.id,
                    'wallet', p.wallet,
                    'inscriptionId', p.inscription_id,
                    'image', COALESCE(
                      p.inscription_image,
                      CONCAT('https://ord-mirror.magiceden.dev/content/', p.inscription_id)
                    ),
                    'trait', p.trait,
                    'joinedAt', p.joined_at,
                    'level1Completed', p.level_1_completed,
                    'level1CompletedAt', p.level_1_completed_at,
                    'level2Completed', p.level_2_completed,
                    'level2CompletedAt', p.level_2_completed_at,
                    'level3Completed', p.level_3_completed,
                    'level3CompletedAt', p.level_3_completed_at
                  )
                ) FILTER (WHERE p.id IS NOT NULL),
                '[]'::json
              ) AS participants
            FROM dungeon_crawls c
            LEFT JOIN dungeon_crawl_instances i ON i.crawl_id = c.id 
              AND i.status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
            LEFT JOIN dungeon_crawl_participants p ON p.instance_id = i.id
            WHERE c.id = $1 AND i.id IS NOT NULL
            GROUP BY c.id, i.id
          `, [crawlId])
          
          if (instanceRes.rows.length > 0) {
            const row = instanceRes.rows[0]
            if (!crawl) {
              crawlsMap.set(crawlId, {
                ...mapCrawlRow(row),
                instances: [],
                nextRestartAt: null,
              })
            }
            const participants = Array.isArray(row.participants) ? row.participants : []
            const instance = mapInstanceRow(row, participants)
            const updatedCrawl = crawlsMap.get(crawlId)
            if (updatedCrawl) {
              updatedCrawl.instances.push(instance)
            }
          } else if (!crawl) {
            // Get crawl config even if no instance yet
            const crawlConfigRes = await client.query(
              `SELECT * FROM dungeon_crawls WHERE id = $1 AND is_active = TRUE`,
              [crawlId]
            )
            if (crawlConfigRes.rows.length > 0) {
              crawlsMap.set(crawlId, {
                ...mapCrawlRow(crawlConfigRes.rows[0]),
                instances: [],
                nextRestartAt: null,
              })
            }
          }
        }
      }

      // Process history instances
      for (const row of historyRes.rows) {
        if (!row.instance_id) continue
        const crawlId = row.id
        if (!historyMap.has(crawlId)) {
          historyMap.set(crawlId, {
            ...mapCrawlRow(row),
            instances: [],
          })
        }
        
        const participants = Array.isArray(row.participants) ? row.participants : []
        
        // Get reward count for this wallet in this instance if wallet is provided
        let rewardCount = 0
        if (wallet) {
          const rewardRes = await client.query(
            `SELECT COUNT(*)::int as count
             FROM dungeon_crawl_reward_items
             WHERE instance_id = $1 AND LOWER(wallet) = LOWER($2)`,
            [row.instance_id, wallet]
          )
          rewardCount = rewardRes.rows[0]?.count ?? 0
        }
        
        const instance = mapInstanceRow(row, participants, rewardCount)
        const crawl = historyMap.get(crawlId)
        crawl.instances.push(instance)
      }

      return NextResponse.json({
        success: true,
        crawls: Array.from(crawlsMap.values()),
        history: Array.from(historyMap.values()),
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[dungeon-crawls][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dungeon crawls' },
      { status: 500 }
    )
  }
}

