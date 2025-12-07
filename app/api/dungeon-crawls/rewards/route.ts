import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET - Get active rewards for a wallet or inscription
export async function GET(request: NextRequest) {
  const pool = getPool()
  try {
    const searchParams = request.nextUrl.searchParams
    const wallet = searchParams.get('wallet')
    const inscriptionId = searchParams.get('inscriptionId')

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      const now = new Date()

      // Get wallet-wide rewards (block_chance)
      const walletRewardsRes = await client.query(
        `
          SELECT 
            id,
            instance_id,
            reward_type,
            reward_value,
            granted_at,
            expires_at
          FROM dungeon_crawl_rewards
          WHERE LOWER(wallet) = LOWER($1)
            AND inscription_id IS NULL
            AND is_active = TRUE
            AND (expires_at IS NULL OR expires_at > $2)
          ORDER BY expires_at DESC NULLS LAST
        `,
        [wallet, now.toISOString()]
      )

      // Get inscription-specific rewards (life_force_cap)
      let inscriptionRewardsRes
      if (inscriptionId) {
        inscriptionRewardsRes = await client.query(
          `
            SELECT 
              id,
              instance_id,
              reward_type,
              reward_value,
              granted_at,
              expires_at
            FROM dungeon_crawl_rewards
            WHERE LOWER(wallet) = LOWER($1)
              AND inscription_id = $2
              AND is_active = TRUE
              AND (expires_at IS NULL OR expires_at > $3)
            ORDER BY expires_at DESC NULLS LAST
          `,
          [wallet, inscriptionId, now.toISOString()]
        )
      }

      const walletRewards = walletRewardsRes.rows.map((row) => ({
        id: row.id,
        instanceId: row.instance_id,
        rewardType: row.reward_type,
        rewardValue: Number(row.reward_value),
        grantedAt: row.granted_at,
        expiresAt: row.expires_at,
      }))

      const inscriptionRewards = inscriptionRewardsRes
        ? inscriptionRewardsRes.rows.map((row) => ({
            id: row.id,
            instanceId: row.instance_id,
            rewardType: row.reward_type,
            rewardValue: Number(row.reward_value),
            grantedAt: row.granted_at,
            expiresAt: row.expires_at,
          }))
        : []

      // Calculate total bonuses
      const totalBlockChance = walletRewards
        .filter((r) => r.rewardType === 'block_chance')
        .reduce((sum, r) => sum + r.rewardValue, 0)

      const totalLifeForceCap = inscriptionRewards
        .filter((r) => r.rewardType === 'life_force_cap')
        .reduce((sum, r) => sum + r.rewardValue, 0)

      return NextResponse.json({
        success: true,
        walletRewards,
        inscriptionRewards,
        totals: {
          blockChance: totalBlockChance,
          lifeForceCap: totalLifeForceCap,
        },
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[dungeon-crawls/rewards][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rewards' },
      { status: 500 }
    )
  }
}

