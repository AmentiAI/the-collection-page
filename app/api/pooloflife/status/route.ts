import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let client
  try {
    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Get last heal time and check if 6 hours have passed (database-level check)
    const result = await client.query(
      `SELECT last_heal_time,
              EXTRACT(EPOCH FROM (NOW() - last_heal_time)) / 3600 as hours_since_heal
       FROM battle_ordinals 
       WHERE LOWER(wallet_address) = LOWER($1) 
         AND last_heal_time IS NOT NULL
       ORDER BY last_heal_time DESC 
       LIMIT 1`,
      [walletAddress]
    )

    const lastHealTime = result.rows.length > 0 ? result.rows[0].last_heal_time : null
    let canHealToday = true

    if (lastHealTime) {
      const hoursSinceHeal = parseFloat(result.rows[0].hours_since_heal || '0')
      canHealToday = hoursSinceHeal >= 6
    }

    return NextResponse.json({
      success: true,
      lastHealTime,
      canHealToday,
    })
  } catch (error) {
    console.error('Error fetching heal status:', error)
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

