import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET - Get participants for a specific instance
export async function GET(
  request: NextRequest,
  { params }: { params: { instanceId: string } },
) {
  const pool = getPool()
  try {

    const { instanceId } = params
    const client = await pool.connect()
    try {
      const participantsRes = await client.query(
        `
          SELECT 
            p.*,
            ri.id as reward_item_id,
            ri.is_applied as reward_item_applied
          FROM dungeon_crawl_participants p
          LEFT JOIN dungeon_crawl_reward_items ri ON 
            ri.instance_id = p.instance_id 
            AND ri.inscription_id = p.inscription_id
          WHERE p.instance_id = $1
          ORDER BY p.joined_at ASC
        `,
        [instanceId]
      )

      const participants = participantsRes.rows.map((row) => ({
        id: row.id,
        wallet: row.wallet,
        inscriptionId: row.inscription_id,
        inscriptionImage: row.inscription_image,
        trait: row.trait,
        joinedAt: row.joined_at,
        level1Completed: Boolean(row.level_1_completed),
        level1CompletedAt: row.level_1_completed_at,
        level2Completed: Boolean(row.level_2_completed),
        level2CompletedAt: row.level_2_completed_at,
        level3Completed: Boolean(row.level_3_completed),
        level3CompletedAt: row.level_3_completed_at,
        rewardGranted: Boolean(row.reward_granted),
        rewardItemId: row.reward_item_id,
        rewardItemApplied: row.reward_item_id ? Boolean(row.reward_item_applied) : null,
      }))

      return NextResponse.json({
        success: true,
        participants,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[admin/dungeon-crawls/instances/participants][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch participants' },
      { status: 500 }
    )
  }
}

