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

    const pool = getPool()
    client = await pool.connect()
    await client.query('BEGIN')

    // Mark chamber record as destroyed (exit removes from chamber)
    const result = await client.query(
      `UPDATE horde_chamber_records
       SET status = 'destroyed',
           updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($1)
         AND inscription_id = $2
         AND status = 'active'
       RETURNING id`,
      [walletAddress, inscriptionId]
    )

    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Ordinal not found in chamber' },
        { status: 404 }
      )
    }

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      message: 'Ordinal exited the chamber',
    })
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError)
      }
    }
    console.error('Error exiting chamber:', error)
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

