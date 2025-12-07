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

    // Get resurrection history for this wallet (most recent first)
    const result = await client.query(
      `SELECT 
         id,
         wallet_address,
         inscription_id,
         trait,
         resurrected_at,
         created_at
       FROM resurrection_history
       WHERE LOWER(wallet_address) = LOWER($1)
       ORDER BY resurrected_at DESC
       LIMIT 50`,
      [walletAddress]
    )

    return NextResponse.json({
      success: true,
      history: result.rows,
    })
  } catch (error) {
    console.error('Error fetching resurrection history:', error)
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

