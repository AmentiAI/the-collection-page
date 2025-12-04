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

    // Get last heal time
    const result = await client.query(
      `SELECT last_heal_time 
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
      const lastHeal = new Date(lastHealTime)
      const now = new Date()
      const hoursSinceHeal = (now.getTime() - lastHeal.getTime()) / (1000 * 60 * 60)
      canHealToday = hoursSinceHeal >= 24
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

