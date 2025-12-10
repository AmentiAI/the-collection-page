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

    // Heal all armies for this wallet (exclude dead armies - they must be resurrected first)
    const healResult = await client.query(
      `UPDATE battle_ordinals
       SET 
         life_force = 100,
         is_dead = false,
         last_heal_time = NOW(),
         updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($1)
         AND status = 'ready'
         AND life_force > 0
         AND life_force < 100
         AND is_dead = false
       RETURNING id`,
      [walletAddress]
    )

    const healedCount = healResult.rows.length

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

