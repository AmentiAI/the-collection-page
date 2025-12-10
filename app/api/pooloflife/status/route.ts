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

    // Get most recent heal time from heal_history table (source of truth)
    // This matches what the history endpoint uses
    const result = await client.query(
      `SELECT healed_at,
              EXTRACT(EPOCH FROM (NOW() - healed_at)) / 3600 as hours_since_heal
       FROM heal_history 
       WHERE LOWER(wallet_address) = LOWER($1)
       ORDER BY healed_at DESC 
       LIMIT 1`,
      [walletAddress]
    )

    const lastHealTime = result.rows.length > 0 ? result.rows[0].healed_at : null
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

