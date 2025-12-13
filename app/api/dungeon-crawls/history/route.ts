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
      // First, get all active crawls
      const crawlsRes = await client.query(`
        SELECT 
          id,
          name,
          description,
          required_participants,
          allow_multiple_from_stock,
          allowed_traits,
          restart_after_failure_hours,
          cooldown_hours,
          never_restart_after_completion,
          reward_type,
          reward_value,
          level_1_window_start_minutes,
          level_1_window_duration_minutes,
          level_2_window_start_minutes,
          level_2_window_duration_minutes,
          level_3_window_start_minutes,
          level_3_window_duration_minutes,
          min_participation_percent,
          is_active,
          created_at,
          updated_at
        FROM dungeon_crawls
        WHERE is_active = TRUE
        ORDER BY created_at DESC
      `)

      // Get total count of failed/completed instances for pagination
      const countRes = await client.query(`
        SELECT COUNT(*)::int as total
        FROM dungeon_crawl_instances
        WHERE status IN ('failed', 'completed')
      `)
      const total = countRes.rows[0]?.total || 0

      const history: any[] = []

      // For each crawl, get its instances ordered by started_at DESC
      for (const crawl of crawlsRes.rows) {
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
            i.completed_at,
            i.expires_at,
            i.next_restart_at,
            i.created_at,
            i.updated_at,
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
          FROM dungeon_crawl_instances i
          LEFT JOIN dungeon_crawl_participants p ON p.instance_id = i.id AND p.archived_at IS NULL
          LEFT JOIN profiles prof ON LOWER(prof.wallet_address) = LOWER(p.wallet)
          WHERE i.crawl_id = $1
            AND i.status IN ('failed', 'completed')
          GROUP BY 
            i.id, i.status, i.started_at, i.level_1_started_at, i.level_1_completed_at,
            i.level_2_started_at, i.level_2_completed_at, i.level_3_started_at,
            i.level_3_completed_at, i.completed_at, i.expires_at, i.next_restart_at,
            i.created_at, i.updated_at
          ORDER BY i.started_at DESC
        `, [crawl.id])

        const instances = instancesRes.rows.map((row: any) => {
          const participants = row.participants || []
          return {
            id: row.id,
            status: row.status,
            startedAt: row.started_at,
            level1StartedAt: row.level_1_started_at,
            level1CompletedAt: row.level_1_completed_at,
            level2StartedAt: row.level_2_started_at,
            level2CompletedAt: row.level_2_completed_at,
            level3StartedAt: row.level_3_started_at,
            level3CompletedAt: row.level_3_completed_at,
            completedAt: row.completed_at,
            expiresAt: row.expires_at,
            nextRestartAt: row.next_restart_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            participants: participants,
            participantCount: Array.isArray(participants) ? participants.length : 0,
            myRewardCount: 0,
          }
        })

        // Only include crawls that have instances
        if (instances.length > 0) {
          history.push({
            id: crawl.id,
            name: crawl.name,
            description: crawl.description,
            requiredParticipants: Number(crawl.required_participants),
            allowMultipleFromStock: Boolean(crawl.allow_multiple_from_stock),
            allowedTraits: crawl.allowed_traits || 'all',
            restartAfterFailureHours: Number(crawl.restart_after_failure_hours),
            cooldownHours: Number(crawl.cooldown_hours),
            neverRestartAfterCompletion: Boolean(crawl.never_restart_after_completion),
            rewardType: crawl.reward_type,
            rewardValue: Number(crawl.reward_value),
            level1WindowStartMinutes: Number(crawl.level_1_window_start_minutes),
            level1WindowDurationMinutes: Number(crawl.level_1_window_duration_minutes),
            level2WindowStartMinutes: Number(crawl.level_2_window_start_minutes),
            level2WindowDurationMinutes: Number(crawl.level_2_window_duration_minutes),
            level3WindowStartMinutes: Number(crawl.level_3_window_start_minutes),
            level3WindowDurationMinutes: Number(crawl.level_3_window_duration_minutes),
            minParticipationPercent: Number(crawl.min_participation_percent),
            isActive: Boolean(crawl.is_active),
            createdAt: crawl.created_at,
            updatedAt: crawl.updated_at,
            instances: instances,
          })
        }
      }

      // Apply pagination to the flattened instances
      const allInstances = history.flatMap((crawl) => 
        crawl.instances.map((instance: any) => ({ ...instance, crawlId: crawl.id, crawlName: crawl.name }))
      )
      
      // Sort all instances by started_at DESC
      allInstances.sort((a, b) => {
        const aTime = new Date(a.startedAt).getTime()
        const bTime = new Date(b.startedAt).getTime()
        return bTime - aTime
      })

      // Apply pagination
      const paginatedInstances = allInstances.slice(offset, offset + limit)

      // Group paginated instances back by crawl
      const paginatedHistoryMap = new Map()
      for (const instance of paginatedInstances) {
        if (!paginatedHistoryMap.has(instance.crawlId)) {
          const crawl = history.find(c => c.id === instance.crawlId)
          if (crawl) {
            paginatedHistoryMap.set(instance.crawlId, {
              ...crawl,
              instances: [],
            })
          }
        }
        const crawl = paginatedHistoryMap.get(instance.crawlId)
        if (crawl) {
          // Remove crawlId and crawlName from instance before adding
          const { crawlId, crawlName, ...instanceData } = instance
          crawl.instances.push(instanceData)
        }
      }

      return NextResponse.json({
        success: true,
        history: Array.from(paginatedHistoryMap.values()),
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

