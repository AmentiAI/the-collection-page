import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()

    // Get all completed mints
    const result = await pool.query(
      `
        SELECT DISTINCT wallet_address
        FROM mint_inscriptions
        WHERE mint_status = 'completed'
          AND wallet_address IS NOT NULL
          AND wallet_address != ''
      `
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No completed mints found' },
        { status: 404 }
      )
    }

    // Randomly select a winner
    const randomIndex = Math.floor(Math.random() * result.rows.length)
    const winner = result.rows[randomIndex].wallet_address

    // Get count of completed mints for this wallet
    const walletCountResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM mint_inscriptions
        WHERE mint_status = 'completed'
          AND wallet_address = $1
      `,
      [winner]
    )

    const walletMintCount = Number(walletCountResult.rows[0]?.count ?? 0)

    return NextResponse.json({
      success: true,
      winner: winner,
      totalEligible: result.rows.length,
      walletMintCount: walletMintCount
    })
  } catch (error) {
    console.error('[admin/mint-inscriptions/pick-winner][GET] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pick winner'
      },
      { status: 500 }
    )
  }
}

