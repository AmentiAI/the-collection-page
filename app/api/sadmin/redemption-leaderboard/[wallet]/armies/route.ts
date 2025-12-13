import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { wallet: string } }
) {
  let client
  try {
    const walletAddress = decodeURIComponent(params.wallet)
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Get all armies with their details, rewards, and stats
    const result = await client.query(`
      SELECT 
        bo.inscription_id,
        bo.trait,
        bo.status,
        bo.life_force,
        bo.life_force_cap,
        bo.is_dead,
        bo.resurrection_time,
        bo.created_at,
        bo.updated_at,
        -- Life force cap bonus (from rewards)
        COALESCE((
          SELECT SUM(dcr.reward_value)::int
          FROM dungeon_crawl_rewards dcr
          WHERE LOWER(dcr.wallet) = LOWER(bo.wallet_address)
            AND dcr.inscription_id = bo.inscription_id
            AND dcr.reward_type = 'life_force_cap'
            AND dcr.is_active = TRUE
            AND (dcr.expires_at IS NULL OR dcr.expires_at > NOW())
        ), 0) as life_force_cap_bonus,
        -- Block chance bonus (from rewards)
        COALESCE((
          SELECT SUM(dcr.reward_value)::int
          FROM dungeon_crawl_rewards dcr
          WHERE LOWER(dcr.wallet) = LOWER(bo.wallet_address)
            AND dcr.inscription_id = bo.inscription_id
            AND dcr.reward_type = 'block_chance'
            AND dcr.is_active = TRUE
            AND (dcr.expires_at IS NULL OR dcr.expires_at > NOW())
        ), 0) as block_chance_bonus,
        -- Total rewards count
        COALESCE((
          SELECT COUNT(*)::int
          FROM dungeon_crawl_rewards dcr
          WHERE LOWER(dcr.wallet) = LOWER(bo.wallet_address)
            AND dcr.inscription_id = bo.inscription_id
            AND dcr.is_active = TRUE
            AND (dcr.expires_at IS NULL OR dcr.expires_at > NOW())
        ), 0) as total_rewards_count
      FROM battle_ordinals bo
      WHERE LOWER(bo.wallet_address) = LOWER($1)
        AND bo.life_force > 0
        AND bo.is_dead = false
      ORDER BY bo.trait, bo.inscription_id
    `, [walletAddress])

    const armies = result.rows.map((row: any) => ({
      inscriptionId: row.inscription_id,
      trait: row.trait,
      status: row.status,
      lifeForce: Number(row.life_force) || 0,
      lifeForceCap: Number(row.life_force_cap) || 100,
      lifeForceCapBonus: Number(row.life_force_cap_bonus) || 0,
      blockChanceBonus: Number(row.block_chance_bonus) || 0,
      totalRewardsCount: Number(row.total_rewards_count) || 0,
      isDead: Boolean(row.is_dead),
      resurrectionTime: row.resurrection_time,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    return NextResponse.json({
      success: true,
      armies,
    })
  } catch (error) {
    console.error('Error fetching army details:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

