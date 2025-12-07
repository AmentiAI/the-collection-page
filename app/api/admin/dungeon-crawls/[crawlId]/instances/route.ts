import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET - Get instances for a specific crawl with detailed stats
export async function GET(
  request: NextRequest,
  { params }: { params: { crawlId: string } },
) {
  const pool = getPool()
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') // Optional filter by status

    const { crawlId } = params
    const client = await pool.connect()
    try {
      let whereClause = 'WHERE i.crawl_id = $1'
      const queryParams: any[] = [crawlId]

      if (status) {
        whereClause += ' AND i.status = $2'
        queryParams.push(status)
      }

      const instancesRes = await client.query(
        `
          SELECT 
            i.*,
            COUNT(DISTINCT p.id)::int AS participant_count,
            COUNT(DISTINCT CASE WHEN p.level_1_completed THEN p.id END)::int AS level_1_completed_count,
            COUNT(DISTINCT CASE WHEN p.level_2_completed THEN p.id END)::int AS level_2_completed_count,
            COUNT(DISTINCT CASE WHEN p.level_3_completed THEN p.id END)::int AS level_3_completed_count,
            COUNT(DISTINCT CASE WHEN p.reward_granted THEN p.id END)::int AS reward_granted_count,
            COUNT(DISTINCT ri.id)::int AS reward_items_dropped
          FROM dungeon_crawl_instances i
          LEFT JOIN dungeon_crawl_participants p ON p.instance_id = i.id
          LEFT JOIN dungeon_crawl_reward_items ri ON ri.instance_id = i.id
          ${whereClause}
          GROUP BY i.id
          ORDER BY i.started_at DESC
          LIMIT 50
        `,
        queryParams
      )

      const instances = instancesRes.rows.map((row) => ({
        id: row.id,
        crawlId: row.crawl_id,
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
        participantCount: Number(row.participant_count ?? 0),
        level1CompletedCount: Number(row.level_1_completed_count ?? 0),
        level2CompletedCount: Number(row.level_2_completed_count ?? 0),
        level3CompletedCount: Number(row.level_3_completed_count ?? 0),
        rewardGrantedCount: Number(row.reward_granted_count ?? 0),
        rewardItemsDropped: Number(row.reward_items_dropped ?? 0),
      }))

      return NextResponse.json({
        success: true,
        instances,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[admin/dungeon-crawls/instances][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch instances' },
      { status: 500 }
    )
  }
}

