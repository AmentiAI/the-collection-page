import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { instanceId: string } },
) {
  const pool = getPool()
  try {
    const body = await request.json().catch(() => ({}))
    const { wallet, level } = body

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 }
      )
    }

    if (![1, 2, 3].includes(Number(level))) {
      return NextResponse.json(
        { success: false, error: 'level must be 1, 2, or 3' },
        { status: 400 }
      )
    }

    const levelNum = Number(level)
    const { instanceId } = params

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get instance with crawl config
      const instanceRes = await client.query(
        `
          SELECT 
            i.*,
            c.level_1_window_start_minutes,
            c.level_1_window_duration_minutes,
            c.level_2_window_start_minutes,
            c.level_2_window_duration_minutes,
            c.level_3_window_start_minutes,
            c.level_3_window_duration_minutes,
            c.min_participation_percent,
            c.reward_type,
            c.reward_value,
            c.reward_drop_chance_1_ordinal,
            c.reward_drop_chance_2_ordinals,
            c.reward_drop_chance_3plus_ordinals
          FROM dungeon_crawl_instances i
          JOIN dungeon_crawls c ON c.id = i.crawl_id
          WHERE i.id = $1
          FOR UPDATE OF i
        `,
        [instanceId]
      )

      if (instanceRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'Dungeon crawl instance not found' },
          { status: 404 }
        )
      }

      const row = instanceRes.rows[0]
      const instance = {
        id: row.id,
        status: row.status,
        startedAt: new Date(row.started_at),
        level1StartedAt: row.level_1_started_at ? new Date(row.level_1_started_at) : null,
        level1CompletedAt: row.level_1_completed_at ? new Date(row.level_1_completed_at) : null,
        level2StartedAt: row.level_2_started_at ? new Date(row.level_2_started_at) : null,
        level2CompletedAt: row.level_2_completed_at ? new Date(row.level_2_completed_at) : null,
        level3StartedAt: row.level_3_started_at ? new Date(row.level_3_started_at) : null,
        level3CompletedAt: row.level_3_completed_at ? new Date(row.level_3_completed_at) : null,
        expiresAt: row.expires_at ? new Date(row.expires_at) : null, // null = permanent
      }

      const config = {
        level1WindowStart: Number(row.level_1_window_start_minutes),
        level1WindowDuration: Number(row.level_1_window_duration_minutes),
        level2WindowStart: Number(row.level_2_window_start_minutes),
        level2WindowDuration: Number(row.level_2_window_duration_minutes),
        level3WindowStart: Number(row.level_3_window_start_minutes),
        level3WindowDuration: Number(row.level_3_window_duration_minutes),
        minParticipationPercent: Number(row.min_participation_percent),
        rewardType: row.reward_type,
        rewardValue: Number(row.reward_value),
        rewardDropChance1Ordinal: Number(row.reward_drop_chance_1_ordinal ?? 20),
        rewardDropChance2Ordinals: Number(row.reward_drop_chance_2_ordinals ?? 10),
        rewardDropChance3PlusOrdinals: Number(row.reward_drop_chance_3plus_ordinals ?? 5),
        // Rewards are now permanent, no duration
      }

      // Check if user is a participant
      const participantRes = await client.query(
        `SELECT id, wallet FROM dungeon_crawl_participants 
         WHERE instance_id = $1 AND LOWER(wallet) = LOWER($2) AND archived_at IS NULL`,
        [instanceId, wallet]
      )

      if (participantRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'You are not a participant in this dungeon crawl' },
          { status: 403 }
        )
      }

      const now = new Date()
      // For level 1, use level_1_started_at if available (when first person completes), otherwise use started_at
      // For levels 2 and 3, use level_1_started_at as the base time
      const baseTime = levelNum === 1 
        ? (instance.level1StartedAt || instance.startedAt)
        : (instance.level1StartedAt || instance.startedAt)
      const elapsedMinutes = (now.getTime() - baseTime.getTime()) / (1000 * 60)

      // Validate level completion timing
      let windowStart: number
      let windowDuration: number
      let levelStatus: string
      let levelCompletedAt: Date | null
      let levelColumn: string
      let levelCompletedColumn: string
      let nextStatus: string

      if (levelNum === 1) {
        windowStart = config.level1WindowStart
        windowDuration = config.level1WindowDuration
        levelStatus = 'ready'
        levelCompletedAt = instance.level1CompletedAt
        levelColumn = 'level_1_completed'
        levelCompletedColumn = 'level_1_completed_at'
        nextStatus = 'level_2'
        
        // Level 1 can only start when status is 'ready' (60/60 reached)
        if (instance.status !== 'ready') {
          await client.query('ROLLBACK')
          return NextResponse.json(
            {
              success: false,
              error: 'Level 1 cannot start until 60/60 participants are ready',
            },
            { status: 409 }
          )
        }
      } else if (levelNum === 2) {
        windowStart = config.level2WindowStart
        windowDuration = config.level2WindowDuration
        levelStatus = 'level_1'
        levelCompletedAt = instance.level2CompletedAt
        levelColumn = 'level_2_completed'
        levelCompletedColumn = 'level_2_completed_at'
        nextStatus = 'level_3'
      } else {
        windowStart = config.level3WindowStart
        windowDuration = config.level3WindowDuration
        levelStatus = 'level_2'
        levelCompletedAt = instance.level3CompletedAt
        levelColumn = 'level_3_completed'
        levelCompletedColumn = 'level_3_completed_at'
        nextStatus = 'completed'
      }

      // Check instance status
      // For level 2, allow both 'level_1' (when level 1 just completed) and 'level_2' (current status)
      // For level 3, allow both 'level_2' (when level 2 just completed) and 'level_3' (current status)
      const allowedStatuses = levelNum === 2 
        ? [levelStatus, 'level_2', nextStatus]
        : levelNum === 3
        ? [levelStatus, 'level_3', nextStatus]
        : [levelStatus, nextStatus]
      
      if (!allowedStatuses.includes(instance.status)) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: `Level ${levelNum} is not available. Current status: ${instance.status}`,
          },
          { status: 409 }
        )
      }

      // Check if level window is open
      const windowStartTime = windowStart
      const windowEndTime = windowStart + windowDuration

      // If window has closed, check if participation was sufficient
      if (elapsedMinutes > windowEndTime) {
        // Window closed - check if level was completed
        const allParticipantsRes = await client.query(
          `SELECT COUNT(*)::int AS total, 
                  SUM(CASE WHEN ${levelColumn} = TRUE THEN 1 ELSE 0 END)::int AS completed
           FROM dungeon_crawl_participants
           WHERE instance_id = $1 AND archived_at IS NULL`,
          [instanceId]
        )

        const total = allParticipantsRes.rows[0]?.total ?? 0
        const completed = allParticipantsRes.rows[0]?.completed ?? 0
        const participationPercent = total > 0 ? (completed / total) * 100 : 0

        // If participation is below threshold, mark instance as failed and archive participants
        if (participationPercent < config.minParticipationPercent) {
          // Archive all participants from this failed instance (preserve history)
          await client.query(
            `UPDATE dungeon_crawl_participants 
             SET archived_at = NOW() 
             WHERE instance_id = $1 AND archived_at IS NULL`,
            [instanceId]
          )
          await client.query(
            `
              UPDATE dungeon_crawl_instances
              SET status = 'failed',
                  updated_at = NOW()
              WHERE id = $1
            `,
            [instanceId]
          )
          await client.query('COMMIT')
          return NextResponse.json(
            {
              success: false,
              error: `Level ${levelNum} window closed with insufficient participation (${Math.round(participationPercent)}% < ${config.minParticipationPercent}%). Dungeon crawl failed.`,
              instanceFailed: true,
            },
            { status: 409 }
          )
        }
      }

      if (elapsedMinutes < windowStartTime || elapsedMinutes > windowEndTime) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: `Level ${levelNum} completion window is not open. Window: ${windowStartTime}-${windowEndTime} minutes`,
            elapsedMinutes: Math.round(elapsedMinutes * 100) / 100,
          },
          { status: 409 }
        )
      }

      // Check if already completed this level
      const participantLevelCheck = await client.query(
        `SELECT ${levelColumn} FROM dungeon_crawl_participants 
         WHERE instance_id = $1 AND LOWER(wallet) = LOWER($2) AND archived_at IS NULL`,
        [instanceId, wallet]
      )

      if (participantLevelCheck.rows[0]?.[levelColumn]) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: true,
          message: `Level ${levelNum} already completed`,
          alreadyCompleted: true,
        })
      }

      // Note: level_1_started_at should already be set when the instance status becomes 'ready'
      // (when 60/60 participants join). We don't set it here to avoid resetting the timer.

      // Mark participant as completed for this level
      await client.query(
        `
          UPDATE dungeon_crawl_participants
          SET ${levelColumn} = TRUE,
              ${levelCompletedColumn} = NOW()
          WHERE instance_id = $1 AND LOWER(wallet) = LOWER($2)
        `,
        [instanceId, wallet]
      )

      // Check if level should be completed (>= min_participation_percent)
      // BUT only mark as completed and move to next level if:
      // 1. Participation is >= min_participation_percent AND
      // 2. Either participation is 100% OR the window has closed
      const allParticipantsRes = await client.query(
        `SELECT COUNT(*)::int AS total, 
                SUM(CASE WHEN ${levelColumn} = TRUE THEN 1 ELSE 0 END)::int AS completed
         FROM dungeon_crawl_participants
         WHERE instance_id = $1 AND archived_at IS NULL`,
        [instanceId]
      )

      const total = allParticipantsRes.rows[0]?.total ?? 0
      const completed = allParticipantsRes.rows[0]?.completed ?? 0
      const participationPercent = total > 0 ? (completed / total) * 100 : 0

      // Check if window has closed
      const windowEndTime = windowStartTime + windowDuration
      const windowClosed = elapsedMinutes > windowEndTime

      let levelCompleted = false
      let instanceCompleted = false

      // Only mark level as completed and move forward if:
      // - Minimum participation is met AND
      // - Either 100% participation OR window has closed
      if (participationPercent >= config.minParticipationPercent && (participationPercent >= 100 || windowClosed)) {
        levelCompleted = true
        const completedAt = new Date()

        // Update instance level completion
        if (levelNum === 1) {
          // Level 1 is completed - move to level 2
          // level_1_started_at should already be set by the code above
          await client.query(
            `
              UPDATE dungeon_crawl_instances
              SET status = 'level_2',
              level_1_completed_at = $1,
              updated_at = NOW()
              WHERE id = $2
            `,
            [completedAt.toISOString(), instanceId]
          )
        } else if (levelNum === 2) {
          await client.query(
            `
              UPDATE dungeon_crawl_instances
              SET status = 'level_3',
              level_2_started_at = COALESCE(level_2_started_at, NOW()),
              level_2_completed_at = $1,
              updated_at = NOW()
              WHERE id = $2
            `,
            [completedAt.toISOString(), instanceId]
          )
        } else {
          // Level 3 completed - dungeon crawl is complete!
          instanceCompleted = true
          const completedAtTime = new Date()
          
          await client.query(
            `
              UPDATE dungeon_crawl_instances
              SET status = 'completed',
              level_3_started_at = COALESCE(level_3_started_at, NOW()),
              level_3_completed_at = $1,
              completed_at = $1,
              updated_at = NOW()
              WHERE id = $2
            `,
            [completedAtTime.toISOString(), instanceId]
          )

          // Grant reward items with chance-based drops to participants who completed all 3 levels
          const eligibleParticipantsRes = await client.query(
            `
              SELECT wallet, inscription_id
              FROM dungeon_crawl_participants
              WHERE instance_id = $1
                AND level_1_completed = TRUE
                AND level_2_completed = TRUE
                AND level_3_completed = TRUE
                AND reward_granted = FALSE
                AND archived_at IS NULL
            `,
            [instanceId]
          )

          // Group participants by wallet to calculate drop chances
          const participantsByWallet = new Map<string, typeof eligibleParticipantsRes.rows>()
          for (const participant of eligibleParticipantsRes.rows) {
            const wallet = participant.wallet.toLowerCase()
            if (!participantsByWallet.has(wallet)) {
              participantsByWallet.set(wallet, [])
            }
            participantsByWallet.get(wallet)!.push(participant)
          }

          // Calculate drop chance per ordinal based on how many they used (configurable per crawl)
          for (const [wallet, walletParticipants] of Array.from(participantsByWallet.entries())) {
            const participantCount = walletParticipants.length
            let dropChancePerOrdinal: number

            if (participantCount === 1) {
              dropChancePerOrdinal = config.rewardDropChance1Ordinal / 100 // Convert percentage to decimal
            } else if (participantCount === 2) {
              dropChancePerOrdinal = config.rewardDropChance2Ordinals / 100
            } else {
              dropChancePerOrdinal = config.rewardDropChance3PlusOrdinals / 100 // For 3+ ordinals
            }

            // Roll for each ordinal
            for (const participant of walletParticipants) {
              const roll = Math.random()
              if (roll < dropChancePerOrdinal) {
                // Grant reward item
                await client.query(
                  `
                    INSERT INTO dungeon_crawl_reward_items 
                    (instance_id, wallet, inscription_id, reward_type, reward_value)
                    VALUES ($1, $2, $3, $4, $5)
                  `,
                  [
                    instanceId,
                    participant.wallet,
                    participant.inscription_id,
                    config.rewardType,
                    config.rewardValue,
                  ]
                )
              }
            }

            // Mark all participants as reward processed (even if they didn't get an item)
            await client.query(
              `
                UPDATE dungeon_crawl_participants
                SET reward_granted = TRUE,
                    reward_granted_at = NOW()
                WHERE instance_id = $1 AND LOWER(wallet) = LOWER($2)
              `,
              [instanceId, wallet]
            )
          }

          // Note: Restart logic is now handled by the cron job based on:
          // - restart_after_failure_hours for failed instances
          // - cooldown_hours for completed instances (unless never_restart_after_completion is true)
          // No need to set next_restart_at here anymore
        }
      }

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: `Level ${levelNum} completion recorded`,
        levelCompleted,
        instanceCompleted,
        participation: {
          completed,
          total,
          percent: Math.round(participationPercent * 100) / 100,
          required: config.minParticipationPercent,
        },
      })
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {})
      }
      console.error('[dungeon-crawls][complete-level]', error)
      return NextResponse.json(
        { success: false, error: 'Failed to complete level' },
        { status: 500 }
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  } catch (error) {
    console.error('[dungeon-crawls][complete-level] Infrastructure error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to initialize infrastructure' },
      { status: 500 }
    )
  }
}

