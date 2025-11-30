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

    // Check if user has healed in the last 24 hours
    const lastHealResult = await client.query(
      `SELECT last_heal_time 
       FROM battle_ordinals 
       WHERE LOWER(wallet_address) = LOWER($1) 
         AND last_heal_time IS NOT NULL
       ORDER BY last_heal_time DESC 
       LIMIT 1`,
      [walletAddress]
    )

    if (lastHealResult.rows.length > 0) {
      const lastHealTime = new Date(lastHealResult.rows[0].last_heal_time)
      const now = new Date()
      const hoursSinceHeal = (now.getTime() - lastHealTime.getTime()) / (1000 * 60 * 60)

      if (hoursSinceHeal < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceHeal)
        return NextResponse.json(
          { error: `You can only use the Pool of Life once per day. Try again in ${hoursRemaining} hour(s).` },
          { status: 403 }
        )
      }
    }

    // Heal all armies for this wallet
    const healResult = await client.query(
      `UPDATE battle_ordinals
       SET 
         life_force = 100,
         is_dead = false,
         last_heal_time = NOW(),
         updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($1)
         AND status = 'ready'
         AND life_force < 100
       RETURNING id`,
      [walletAddress]
    )

    return NextResponse.json({
      success: true,
      healedCount: healResult.rows.length,
      message: `Healed ${healResult.rows.length} armies to full health`,
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

