import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    const pool = getPool()

    // Get all active chamber records for this wallet
    const recordsResult = await pool.query(
      `SELECT id, inscription_id, entered_at, ascension_powder_used, status
       FROM horde_chamber_records
       WHERE LOWER(wallet_address) = LOWER($1)
         AND status = 'active'
       ORDER BY entered_at DESC`,
      [walletAddress]
    )

    const records = recordsResult.rows.map((row) => ({
      id: row.id,
      inscriptionId: row.inscription_id,
      enteredAt: row.entered_at,
      ascensionPowderUsed: Number(row.ascension_powder_used || 0),
      status: row.status,
    }))

    return NextResponse.json({
      success: true,
      records,
    })
  } catch (error) {
    console.error('Error fetching chamber status:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

