import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const walletAddress = searchParams.get('walletAddress')?.trim()

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 },
      )
    }

    const pool = getPool()

    // Check if wallet has any abyss_burns records
    const burnsResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM abyss_burns WHERE LOWER(ordinal_wallet) = LOWER($1)`,
      [walletAddress],
    )

    const burnCount = burnsResult.rows[0]?.count ?? 0
    const hasBurns = burnCount > 0

    return NextResponse.json({
      success: true,
      hasBurns,
      burnCount,
    })
  } catch (error) {
    console.error('[holders/check-access][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to check access status' },
      { status: 500 },
    )
  }
}

