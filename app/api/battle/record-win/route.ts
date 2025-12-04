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

    // Ensure profile exists
    await client.query(
      `INSERT INTO profiles (wallet_address)
       VALUES (LOWER($1))
       ON CONFLICT (wallet_address) DO NOTHING`,
      [walletAddress]
    )

    // Increment battles won
    await client.query(
      `UPDATE profiles
       SET 
         battles_won = COALESCE(battles_won, 0) + 1,
         updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($1)`,
      [walletAddress]
    )

    return NextResponse.json({
      success: true,
      message: 'Battle win recorded',
    })
  } catch (error) {
    console.error('Error recording battle win:', error)
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

