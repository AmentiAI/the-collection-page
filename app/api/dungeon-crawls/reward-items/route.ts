import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET - Get available reward items for a wallet
export async function GET(request: NextRequest) {
  const pool = getPool()
  try {
    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      // Get unapplied reward items
      const itemsRes = await client.query(
        `
          SELECT 
            id,
            instance_id,
            inscription_id as earned_by_inscription_id,
            reward_type,
            reward_value,
            earned_at
          FROM dungeon_crawl_reward_items
          WHERE LOWER(wallet) = LOWER($1)
            AND is_applied = FALSE
          ORDER BY earned_at DESC
        `,
        [wallet]
      )

      const items = itemsRes.rows.map((row) => ({
        id: row.id,
        instanceId: row.instance_id,
        earnedByInscriptionId: row.earned_by_inscription_id,
        rewardType: row.reward_type,
        rewardValue: Number(row.reward_value),
        earnedAt: row.earned_at,
      }))

      return NextResponse.json({
        success: true,
        items,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[dungeon-crawls/reward-items][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reward items' },
      { status: 500 }
    )
  }
}

// POST - Apply a reward item to an ordinal
export async function POST(request: NextRequest) {
  const pool = getPool()
  try {
    const body = await request.json().catch(() => ({}))
    const { wallet, itemId, inscriptionId } = body

    if (!wallet || !itemId || !inscriptionId) {
      return NextResponse.json(
        { success: false, error: 'wallet, itemId, and inscriptionId are required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Verify the item belongs to this wallet and is not applied
      const itemRes = await client.query(
        `
          SELECT id, reward_type, reward_value
          FROM dungeon_crawl_reward_items
          WHERE id = $1
            AND LOWER(wallet) = LOWER($2)
            AND is_applied = FALSE
          FOR UPDATE
        `,
        [itemId, wallet]
      )

      if (itemRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'Reward item not found or already applied' },
          { status: 404 }
        )
      }

      const item = itemRes.rows[0]

      // Mark item as applied (rewards are permanent, no expiration)
      await client.query(
        `
          UPDATE dungeon_crawl_reward_items
          SET is_applied = TRUE,
              applied_to_inscription_id = $1,
              applied_at = NOW()
          WHERE id = $2
        `,
        [inscriptionId, itemId]
      )

      // Create active reward record (for querying active buffs) - permanent, no expiration
      await client.query(
        `
          INSERT INTO dungeon_crawl_rewards 
          (instance_id, wallet, inscription_id, reward_type, reward_value, expires_at)
          VALUES (
            (SELECT instance_id FROM dungeon_crawl_reward_items WHERE id = $1),
            $2,
            $3,
            $4,
            $5,
            NULL
          )
        `,
        [
          itemId,
          wallet,
          inscriptionId,
          item.reward_type,
          item.reward_value,
        ]
      )

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: 'Reward item applied successfully',
      })
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {})
      }
      console.error('[dungeon-crawls/reward-items][POST]', error)
      return NextResponse.json(
        { success: false, error: 'Failed to apply reward item' },
        { status: 500 }
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  } catch (error) {
    console.error('[dungeon-crawls/reward-items][POST] Infrastructure error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to initialize infrastructure' },
      { status: 500 }
    )
  }
}

