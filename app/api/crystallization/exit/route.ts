import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { walletAddress, inscriptionId } = body

    if (!walletAddress || !inscriptionId) {
      return NextResponse.json(
        { error: 'walletAddress and inscriptionId are required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Find active crystallization record
    const recordResult = await client.query(
      `SELECT id, entered_at, status
       FROM crystallization_records
       WHERE LOWER(wallet_address) = LOWER($1)
         AND inscription_id = $2
         AND status = 'active'`,
      [walletAddress, inscriptionId]
    )

    if (recordResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'No active crystallization found for this ordinal' },
        { status: 404 }
      )
    }

    // Delete the crystallization record (or mark as exited)
    // Since we're using status='claimed' for claimed ones, we'll just delete active ones on exit
    await client.query(
      `DELETE FROM crystallization_records
       WHERE id = $1`,
      [recordResult.rows[0].id]
    )

    return NextResponse.json({
      success: true,
      message: 'Ordinal exited crystallization',
    })
  } catch (error) {
    console.error('Error exiting crystallization:', error)
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

