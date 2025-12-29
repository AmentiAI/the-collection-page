import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

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
    const powderUsed = Number(record.ascension_powder_used || 0)

    // Check if in graveyard (abyss_burns) - if so, get its ascension powder value
    const graveyardResult = await client.query(
      `SELECT ascension_powder, hidden
       FROM abyss_burns
       WHERE LOWER(ordinal_wallet) = LOWER($1)
         AND inscription_id = $2
         AND (hidden IS NULL OR hidden = FALSE)`,
      [walletAddress, inscriptionId]
    )

    let powderToReturn = powderUsed // Default: return powder used in chamber

    if (graveyardResult.rows.length > 0) {
      // If in graveyard, return its graveyard ascension powder value
      const graveyardPowder = Number(graveyardResult.rows[0]?.ascension_powder || 0)
      powderToReturn = graveyardPowder
    }

    // Mark chamber record as destroyed
    await client.query(
      `UPDATE horde_chamber_records
       SET status = 'destroyed',
           updated_at = NOW()
       WHERE id = $1`,
      [record.id]
    )

    // If in graveyard, mark it as hidden
    if (graveyardResult.rows.length > 0) {
      await client.query(
        `UPDATE abyss_burns
         SET hidden = TRUE,
             updated_at = NOW()
         WHERE LOWER(ordinal_wallet) = LOWER($1)
           AND inscription_id = $2`,
        [walletAddress, inscriptionId]
      )
    }

    // Add powder to profile
    await client.query(
      `INSERT INTO profiles (wallet_address, ascension_powder)
       VALUES ($1, 0)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [walletAddress]
    )

    await client.query(
      `UPDATE profiles
       SET ascension_powder = COALESCE(ascension_powder, 0) + $1,
           updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($2)
       RETURNING ascension_powder`,
      [powderToReturn, walletAddress]
    )

    const updatedProfileResult = await client.query(
      `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
      [walletAddress]
    )

    const updatedProfilePowder = Number(updatedProfileResult.rows[0]?.ascension_powder || 0)

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      message: `Destroyed ordinal and returned ${powderToReturn} ascension powder`,
      powderReturned: powderToReturn,
      newBalance: updatedProfilePowder,
    })
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError)
      }
    }
    console.error('Error destroying ordinal:', error)
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

