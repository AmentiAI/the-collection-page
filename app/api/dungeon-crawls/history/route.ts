import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { ensureDungeonCrawlInfrastructure } from '../route'

export const dynamic = 'force-dynamic'

// GET - Fetch dungeon crawl history (failed/completed instances)
export async function GET(request: NextRequest) {
  const pool = getPool()
  try {
    await ensureDungeonCrawlInfrastructure(pool)
    
    // Get pagination params
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const offset = (page - 1) * limit
    
    const client = await pool.connect()
    try {
      // Get total count for pagination
      const countRes = await client.query(`
        SELECT COUNT(DISTINCT i.id)::int as total
        FROM dungeon_crawls c
        INNER JOIN dungeon_crawl_instances i ON i.crawl_id = c.id
        WHERE c.is_active = TRUE
          AND i.status IN ('failed', 'completed')
      `)
      const total = countRes.rows[0]?.total || 0
      
      // Get failed/completed instances for history with pagination
      const historyRes = await client.query(`
        SELECT 
          c.id as crawl_id,
          c.name,
          c.description,
          c.required_participants,
          c.allow_multiple_from_stock,
          c.allowed_traits,
          c.restart_after_failure_hours,
          c.cooldown_hours,
          c.never_restart_after_completion,
          c.reward_type,
          c.reward_value,
          c.level_1_window_start_minutes,
          c.level_1_window_duration_minutes,
          c.level_2_window_start_minutes,
          c.level_2_window_duration_minutes,
          c.level_3_window_start_minutes,
          c.level_3_window_duration_minutes,
          c.min_participation_percent,
          c.is_active,
          c.created_at,
          c.updated_at,
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
          CASE 
            WHEN i.status = 'completed' AND i.completed_at IS NOT NULL THEN i.completed_at
            WHEN i.status = 'failed' AND i.updated_at IS NOT NULL THEN i.updated_at
            ELSE i.started_at
          END as sort_timestamp,
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
              ) ORDER BY p.joined_at
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::json
          ) as participants
        FROM dungeon_crawls c
        INNER JOIN dungeon_crawl_instances i ON i.crawl_id = c.id
        LEFT JOIN dungeon_crawl_participants p ON p.instance_id = i.id AND p.archived_at IS NULL
        LEFT JOIN profiles prof ON LOWER(prof.wallet_address) = LOWER(p.wallet)
        WHERE c.is_active = TRUE
          AND i.status IN ('failed', 'completed')
        GROUP BY 
          c.id, c.name, c.description, c.required_participants, c.allow_multiple_from_stock,
          c.allowed_traits, c.restart_after_failure_hours, c.cooldown_hours,
          c.never_restart_after_completion, c.reward_type, c.reward_value,
          c.level_1_window_start_minutes, c.level_1_window_duration_minutes,
          c.level_2_window_start_minutes, c.level_2_window_duration_minutes,
          c.level_3_window_start_minutes, c.level_3_window_duration_minutes,
          c.min_participation_percent, c.is_active, c.created_at, c.updated_at,
          i.id, i.status, i.started_at, i.level_1_started_at, i.level_1_completed_at,
          i.level_2_started_at, i.level_2_completed_at, i.level_3_started_at,
          i.level_3_completed_at, i.completed_at, i.expires_at, i.next_restart_at
        ORDER BY 
          sort_timestamp DESC NULLS LAST,
          i.started_at DESC NULLS LAST
        LIMIT $1 OFFSET $2
      `,
      [limit, offset]
      )

      const historyMap = new Map()

      // Process history instances
      for (const row of historyRes.rows) {
        const crawlId = row.crawl_id
        const participants = row.participants || []
        const participantCount = Array.isArray(participants) ? participants.length : 0

        if (!historyMap.has(crawlId)) {
          historyMap.set(crawlId, {
            id: crawlId,
            name: row.name,
            description: row.description,
            requiredParticipants: Number(row.required_participants),
            allowMultipleFromStock: Boolean(row.allow_multiple_from_stock),
            allowedTraits: row.allowed_traits || 'all',
            restartAfterFailureHours: Number(row.restart_after_failure_hours),
            cooldownHours: Number(row.cooldown_hours),
            neverRestartAfterCompletion: Boolean(row.never_restart_after_completion),
            rewardType: row.reward_type,
            rewardValue: Number(row.reward_value),
            level1WindowStartMinutes: Number(row.level_1_window_start_minutes),
            level1WindowDurationMinutes: Number(row.level_1_window_duration_minutes),
            level2WindowStartMinutes: Number(row.level_2_window_start_minutes),
            level2WindowDurationMinutes: Number(row.level_2_window_duration_minutes),
            level3WindowStartMinutes: Number(row.level_3_window_start_minutes),
            level3WindowDurationMinutes: Number(row.level_3_window_duration_minutes),
            minParticipationPercent: Number(row.min_participation_percent),
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            instances: [],
          })
        }

        const crawl = historyMap.get(crawlId)
        crawl.instances.push({
          id: row.instance_id,
          status: row.instance_status,
          startedAt: row.instance_started_at,
          level1StartedAt: row.level_1_started_at,
          level1CompletedAt: row.level_1_completed_at,
          level2StartedAt: row.level_2_started_at,
          level2CompletedAt: row.level_2_completed_at,
          level3StartedAt: row.level_3_started_at,
          level3CompletedAt: row.level_3_completed_at,
          completedAt: row.instance_completed_at,
          expiresAt: row.instance_expires_at,
          nextRestartAt: row.next_restart_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          participants: participants,
          participantCount: participantCount,
          myRewardCount: 0, // Not needed for global history
        })
      }

      return NextResponse.json({
        success: true,
        history: Array.from(historyMap.values()),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[dungeon-crawls][history]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dungeon crawl history' },
      { status: 500 }
    )
  }
}

