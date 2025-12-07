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

    // Get daily history (last 30 days)
    const result = await client.query(
      `SELECT 
         id,
         date,
         total_ascension_powder,
         created_at,
         updated_at
       FROM crystallization_daily_history
       WHERE LOWER(wallet_address) = LOWER($1)
       ORDER BY date DESC
       LIMIT 30`,
      [walletAddress]
    )

    return NextResponse.json({
      success: true,
      history: result.rows,
    })
  } catch (error) {
    console.error('Error fetching crystallization history:', error)
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

