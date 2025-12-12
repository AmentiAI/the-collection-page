import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { walletAddress } = body

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Check if user has healed in the last 6 hours using heal_history table (source of truth)
    // This matches what the status endpoint uses
    const lastHealResult = await client.query(
      `SELECT healed_at,
              EXTRACT(EPOCH FROM (NOW() - healed_at)) / 3600 as hours_since_heal
       FROM heal_history 
       WHERE LOWER(wallet_address) = LOWER($1)
       ORDER BY healed_at DESC 
       LIMIT 1`,
      [walletAddress]
    )

    if (lastHealResult.rows.length > 0) {
      const hoursSinceHeal = parseFloat(lastHealResult.rows[0].hours_since_heal || '0')
      
      if (hoursSinceHeal < 6) {
        const hoursRemaining = Math.ceil(6 - hoursSinceHeal)
        const minutesRemaining = Math.ceil((6 - hoursSinceHeal) * 60)
        
        if (hoursRemaining > 0) {
          return NextResponse.json(
            { error: `You can only use the Pool of Life once every 6 hours. Try again in ${hoursRemaining} hour(s).` },
            { status: 403 }
          )
        } else if (minutesRemaining > 0) {
          return NextResponse.json(
            { error: `You can only use the Pool of Life once every 6 hours. Try again in ${minutesRemaining} minute(s).` },
            { status: 403 }
          )
        }
      }
    }

    // Get all armies with their life force caps (including bonuses)
    const armiesWithCaps = await client.query(
      `
        SELECT 
          bo.id,
          bo.inscription_id,
          bo.life_force,
          COALESCE(SUM(dcr.reward_value)::int, 0) AS life_force_cap_increase
        FROM battle_ordinals bo
        LEFT JOIN dungeon_crawl_rewards dcr ON 
          dcr.inscription_id = bo.inscription_id
          AND dcr.reward_type = 'life_force_cap'
          AND dcr.is_active = TRUE
          AND (dcr.expires_at IS NULL OR dcr.expires_at > NOW())
        WHERE LOWER(bo.wallet_address) = LOWER($1)
          AND bo.status = 'ready'
          AND bo.life_force > 0
          AND bo.is_dead = false
        GROUP BY bo.id, bo.inscription_id, bo.life_force
      `,
      [walletAddress]
    )

    // Heal each army to its individual max life force (100 + bonuses)
    let healedCount = 0
    for (const army of armiesWithCaps.rows) {
      const lifeForceCapIncrease = Number(army.life_force_cap_increase ?? 0)
      const maxLifeForce = 100 + lifeForceCapIncrease
      const currentLifeForce = Number(army.life_force)
      
      // Only heal if below max
      if (currentLifeForce < maxLifeForce) {
        await client.query(
          `UPDATE battle_ordinals
           SET 
             life_force = $1,
             is_dead = false,
             last_heal_time = NOW(),
             updated_at = NOW()
           WHERE id = $2`,
          [maxLifeForce, army.id]
        )
        healedCount++
      }
    }

    // Record heal history
    if (healedCount > 0) {
      await client.query(
        `INSERT INTO heal_history (wallet_address, healed_count, healed_at)
         VALUES ($1, $2, NOW())`,
        [walletAddress, healedCount]
      )
    }

    return NextResponse.json({
      success: true,
      healedCount,
      message: `Healed ${healedCount} armies to full health`,
    })
  } catch (error) {
    console.error('Error healing armies:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

