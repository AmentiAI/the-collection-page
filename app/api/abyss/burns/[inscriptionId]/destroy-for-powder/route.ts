import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { inscriptionId: string } },
) {
  let client
  try {
    const body = await request.json()
    const { walletAddress } = body

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'walletAddress is required' },
        { status: 400 },
      )
    }

    const inscriptionId = params.inscriptionId

    const pool = getPool()
    client = await pool.connect()
    await client.query('BEGIN')

    // Check if the burn record exists and belongs to this wallet
    const burnResult = await client.query(
      `SELECT id, ascension_powder, hidden, status
       FROM abyss_burns
       WHERE LOWER(ordinal_wallet) = LOWER($1)
         AND inscription_id = $2`,
      [walletAddress, inscriptionId],
    )

    if (burnResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Ordinal not found in your graveyard' },
        { status: 404 },
      )
    }

    const burn = burnResult.rows[0]

    // Check if already hidden (already destroyed)
    if (burn.hidden === true) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This ordinal has already been destroyed' },
        { status: 400 },
      )
    }

    // Check if status is confirmed
    if (burn.status !== 'confirmed') {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Can only destroy confirmed ordinals' },
        { status: 400 },
      )
    }

    const ascensionPowder = Number(burn.ascension_powder || 0)

    // Set hidden = TRUE
    await client.query(
      `UPDATE abyss_burns
       SET hidden = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [burn.id],
    )

    // Ensure profile exists
    await client.query(
      `INSERT INTO profiles (wallet_address, ascension_powder)
       VALUES ($1, 0)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [walletAddress],
    )

    // Add ascension powder to profile
    await client.query(
      `UPDATE profiles
       SET ascension_powder = COALESCE(ascension_powder, 0) + $1,
           updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($2)
       RETURNING ascension_powder`,
      [ascensionPowder, walletAddress],
    )

    // Get updated profile powder
    const updatedProfileResult = await client.query(
      `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
      [walletAddress],
    )

    const updatedProfilePowder = Number(updatedProfileResult.rows[0]?.ascension_powder || 0)

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      message: `Destroyed ordinal and granted ${ascensionPowder} ascension powder`,
      powderGranted: ascensionPowder,
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
    console.error('Error destroying ordinal for powder:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  } finally {
    if (client) client.release()
  }
}

