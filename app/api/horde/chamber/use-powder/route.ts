import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ASCENSION_TARGET = 25000
const MAX_POWDER_PER_USE = 20

async function ensureHordeChamberTable(pool: ReturnType<typeof getPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS horde_chamber_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address TEXT NOT NULL,
      inscription_id TEXT NOT NULL,
      entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ascension_powder_used INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'destroyed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { walletAddress, inscriptionId, amount } = body

    if (!walletAddress || !inscriptionId) {
      return NextResponse.json(
        { error: 'walletAddress and inscriptionId are required' },
        { status: 400 }
      )
    }

    const pool = getPool()
    await ensureHordeChamberTable(pool)
    client = await pool.connect()
    await client.query('BEGIN')

    // Get chamber record
    const recordResult = await client.query(
      `SELECT id, ascension_powder_used, status
       FROM horde_chamber_records
       WHERE LOWER(wallet_address) = LOWER($1)
         AND inscription_id = $2
         AND status = 'active'`,
      [walletAddress, inscriptionId]
    )

    if (recordResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Ordinal not found in chamber' },
        { status: 404 }
      )
    }

    const record = recordResult.rows[0]
    const currentPowder = Number(record.ascension_powder_used || 0)

    // Check if already at target
    if (currentPowder >= ASCENSION_TARGET) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'This ordinal has already reached the ascension target' },
        { status: 400 }
      )
    }

    // Get user's available powder
    const profileResult = await client.query(
      `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
      [walletAddress]
    )

    const availablePowder = Number(profileResult.rows[0]?.ascension_powder || 0)

    // Calculate amount to use
    const powderNeeded = ASCENSION_TARGET - currentPowder
    const amountToUse = Math.min(
      MAX_POWDER_PER_USE,
      availablePowder,
      amount || MAX_POWDER_PER_USE,
      powderNeeded
    )

    if (amountToUse <= 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Insufficient powder or already at target' },
        { status: 400 }
      )
    }

    // Update chamber record
    const newPowderUsed = currentPowder + amountToUse
    const reachedTarget = newPowderUsed >= ASCENSION_TARGET

    await client.query(
      `UPDATE horde_chamber_records
       SET ascension_powder_used = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [newPowderUsed, record.id]
    )

    // Deduct from profile
    await client.query(
      `UPDATE profiles
       SET ascension_powder = GREATEST(ascension_powder - $1, 0),
           updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($2)`,
      [amountToUse, walletAddress]
    )

    // Get updated profile powder
    const updatedProfileResult = await client.query(
      `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
      [walletAddress]
    )

    const updatedProfilePowder = Number(updatedProfileResult.rows[0]?.ascension_powder || 0)

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      message: reachedTarget 
        ? `Used ${amountToUse} powder. Ascension target reached!` 
        : `Used ${amountToUse} powder`,
      powderUsed: newPowderUsed,
      powderRemaining: updatedProfilePowder,
      reachedTarget,
    })
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError)
      }
    }
    console.error('Error using powder:', error)
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

