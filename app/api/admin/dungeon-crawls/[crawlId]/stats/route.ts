import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET - Get statistics for a crawl
export async function GET(
  request: NextRequest,
  { params }: { params: { crawlId: string } },
) {
  const pool = getPool()
  try {

    const { crawlId } = params
    const client = await pool.connect()
    try {
      // Overall stats
      const statsRes = await client.query(
        `
          SELECT 
            COUNT(*)::int AS total_instances,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_instances,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_instances,
            COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_instances,
            COUNT(*) FILTER (WHERE status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3'))::int AS active_instances,
            AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60)::numeric AS avg_completion_time_minutes
          FROM dungeon_crawl_instances
          WHERE crawl_id = $1
        `,
        [crawlId]
      )

      // Participant stats
      const participantStatsRes = await client.query(
        `
          SELECT 
            COUNT(DISTINCT p.wallet)::int AS unique_wallets,
            COUNT(DISTINCT p.inscription_id)::int AS unique_inscriptions,
            AVG(participant_count)::numeric AS avg_participants_per_instance
          FROM (
            SELECT 
              i.id,
              COUNT(p.id)::int AS participant_count
            FROM dungeon_crawl_instances i
            LEFT JOIN dungeon_crawl_participants p ON p.instance_id = i.id
            WHERE i.crawl_id = $1
            GROUP BY i.id
          ) sub
        `,
        [crawlId]
      )

      // Level completion stats
      const levelStatsRes = await client.query(
        `
          SELECT 
            AVG(CASE WHEN sub.participant_count > 0 THEN (sub.level_1_completed_count::float / sub.participant_count * 100) ELSE 0 END)::numeric AS avg_level_1_percent,
            AVG(CASE WHEN sub.participant_count > 0 THEN (sub.level_2_completed_count::float / sub.participant_count * 100) ELSE 0 END)::numeric AS avg_level_2_percent,
            AVG(CASE WHEN sub.participant_count > 0 THEN (sub.level_3_completed_count::float / sub.participant_count * 100) ELSE 0 END)::numeric AS avg_level_3_percent
          FROM (
            SELECT 
              i.id,
              COUNT(DISTINCT p.id)::int AS participant_count,
              COUNT(DISTINCT CASE WHEN p.level_1_completed THEN p.id END)::int AS level_1_completed_count,
              COUNT(DISTINCT CASE WHEN p.level_2_completed THEN p.id END)::int AS level_2_completed_count,
              COUNT(DISTINCT CASE WHEN p.level_3_completed THEN p.id END)::int AS level_3_completed_count
            FROM dungeon_crawl_instances i
            LEFT JOIN dungeon_crawl_participants p ON p.instance_id = i.id
            WHERE i.crawl_id = $1 AND i.status = 'completed'
            GROUP BY i.id
          ) sub
        `,
        [crawlId]
      )

      // Reward stats
      const rewardStatsRes = await client.query(
        `
          SELECT 
            COUNT(*)::int AS total_reward_items,
            COUNT(*) FILTER (WHERE is_applied = TRUE)::int AS applied_items,
            COUNT(*) FILTER (WHERE is_applied = FALSE)::int AS unapplied_items
          FROM dungeon_crawl_reward_items
          WHERE instance_id IN (SELECT id FROM dungeon_crawl_instances WHERE crawl_id = $1)
        `,
        [crawlId]
      )

      const stats = statsRes.rows[0] || {}
      const participantStats = participantStatsRes.rows[0] || {}
      const levelStats = levelStatsRes.rows[0] || {}
      const rewardStats = rewardStatsRes.rows[0] || {}

      return NextResponse.json({
        success: true,
        stats: {
          totalInstances: Number(stats.total_instances ?? 0),
          completedInstances: Number(stats.completed_instances ?? 0),
          failedInstances: Number(stats.failed_instances ?? 0),
          expiredInstances: Number(stats.expired_instances ?? 0),
          activeInstances: Number(stats.active_instances ?? 0),
          successRate: stats.total_instances > 0 
            ? ((Number(stats.completed_instances ?? 0) / Number(stats.total_instances ?? 1)) * 100).toFixed(2)
            : '0.00',
          avgCompletionTimeMinutes: Number(stats.avg_completion_time_minutes ?? 0).toFixed(2),
          uniqueWallets: Number(participantStats.unique_wallets ?? 0),
          uniqueInscriptions: Number(participantStats.unique_inscriptions ?? 0),
          avgParticipantsPerInstance: Number(participantStats.avg_participants_per_instance ?? 0).toFixed(2),
          avgLevel1Percent: Number(levelStats.avg_level_1_percent ?? 0).toFixed(2),
          avgLevel2Percent: Number(levelStats.avg_level_2_percent ?? 0).toFixed(2),
          avgLevel3Percent: Number(levelStats.avg_level_3_percent ?? 0).toFixed(2),
          totalRewardItems: Number(rewardStats.total_reward_items ?? 0),
          appliedRewardItems: Number(rewardStats.applied_items ?? 0),
          unappliedRewardItems: Number(rewardStats.unapplied_items ?? 0),
        },
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[admin/dungeon-crawls/stats][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}

