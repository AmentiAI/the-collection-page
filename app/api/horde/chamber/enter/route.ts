import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ASCENSION_TARGET = 25000

async function ensureHordeChamberTable(pool: ReturnType<typeof getPool>) {
  // DDL operations - tables must exist in production
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
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_horde_chamber_wallet 
    ON horde_chamber_records(LOWER(wallet_address), status)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_horde_chamber_inscription 
    ON horde_chamber_records(inscription_id, status)
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_horde_chamber_unique_active 
    ON horde_chamber_records(LOWER(wallet_address), inscription_id) 
    WHERE status = 'active'
  `)
}

// Check if ordinal is original damned (not ascended, not horde)
// Check in abyss_burns table like graveyard does
async function isOriginalDamned(inscriptionId: string, walletAddress: string): Promise<boolean> {
  try {
    const pool = getPool()
    
    // Check if ordinal exists in abyss_burns for this wallet
    // Original damned ordinals have inscription_id that does NOT start with 'ascended_'
    const result = await pool.query(
      `SELECT inscription_id, status, hidden
       FROM abyss_burns
       WHERE LOWER(ordinal_wallet) = LOWER($1)
         AND inscription_id = $2
         AND hidden = FALSE
         AND status = 'confirmed'`,
      [walletAddress, inscriptionId]
    )

    if (result.rows.length === 0) {
      return false // Not found in abyss_burns
    }

    // Check if it's ascended (inscription_id starts with 'ascended_')
    if (inscriptionId.toLowerCase().startsWith('ascended_')) {
      return false // Ascended, not original
    }

    // If it's in abyss_burns and doesn't start with 'ascended_', it's original damned
    return true
  } catch (error) {
    console.error('Error checking ordinal type:', error)
    return false
  }
}

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
    await ensureHordeChamberTable(pool)
    client = await pool.connect()
    await client.query('BEGIN')

    // Check if ordinal is original damned (not ascended, not horde)
    const isOriginal = await isOriginalDamned(inscriptionId, walletAddress)
    if (!isOriginal) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Only original Damned ordinals can enter the chamber. Ascended demons/angels and horde ordinals are not allowed.' },
        { status: 400 }
      )
    }

    // Check if already in active chamber
    const existingCheck = await client.query(
      `SELECT id FROM horde_chamber_records
       WHERE LOWER(wallet_address) = LOWER($1)
         AND inscription_id = $2
         AND status = 'active'`,
      [walletAddress, inscriptionId]
    )

    if (existingCheck.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'This ordinal is already in the chamber' },
        { status: 409 }
      )
    }

    // Insert chamber record
    const result = await client.query(
      `INSERT INTO horde_chamber_records (wallet_address, inscription_id, entered_at, ascension_powder_used, status)
       VALUES ($1, $2, NOW(), 0, 'active')
       RETURNING id, entered_at, ascension_powder_used`,
      [walletAddress, inscriptionId]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      message: 'Ordinal entered the chamber',
      record: {
        id: result.rows[0].id,
        enteredAt: result.rows[0].entered_at,
        ascensionPowderUsed: result.rows[0].ascension_powder_used,
      },
    })
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError)
      }
    }
    console.error('Error entering chamber:', error)
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

