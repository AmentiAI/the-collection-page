import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const walletAddress = (body?.walletAddress ?? '').toString().trim()

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required.' },
        { status: 400 },
      )
    }

    const pool = getPool()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // Get current ascension powder
      const profileRes = await client.query(
        `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
        [walletAddress],
      )

      if (profileRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'Profile not found.' },
          { status: 404 },
        )
      }

      const currentPowder = Number(profileRes.rows[0]?.ascension_powder ?? 0)
      const REQUIRED_POWDER = 1000

      if (currentPowder < REQUIRED_POWDER) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { 
            success: false, 
            error: `Insufficient ascension powder. Required: ${REQUIRED_POWDER}, Available: ${currentPowder}`,
            required: REQUIRED_POWDER,
            available: currentPowder,
          },
          { status: 400 },
        )
      }

      // Deduct 1000 powder
      await client.query(
        `UPDATE profiles 
         SET ascension_powder = GREATEST(ascension_powder - $1, 0),
             updated_at = NOW()
         WHERE LOWER(wallet_address) = LOWER($2)`,
        [REQUIRED_POWDER, walletAddress],
      )

      // Add +1 bonus burn credit
      await client.query(
        `
          INSERT INTO abyss_bonus_allowances (wallet, available, updated_at)
          VALUES ($1, 1, NOW())
          ON CONFLICT (wallet)
          DO UPDATE SET
            available = abyss_bonus_allowances.available + 1,
            updated_at = NOW()
        `,
        [walletAddress],
      )

      // Get updated values
      const updatedProfileRes = await client.query(
        `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
        [walletAddress],
      )
      const updatedPowder = Number(updatedProfileRes.rows[0]?.ascension_powder ?? 0)

      const allowanceRes = await client.query(
        `SELECT available FROM abyss_bonus_allowances WHERE LOWER(wallet) = LOWER($1)`,
        [walletAddress],
      )
      const updatedAllowance = Number(allowanceRes.rows[0]?.available ?? 0)

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: 'Bonus burn credit purchased successfully!',
        ascensionPowder: updatedPowder,
        bonusAllowance: updatedAllowance,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[graveyard/purchase-bonus-burn] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to purchase bonus burn credit.',
      },
      { status: 500 },
    )
  }
}

