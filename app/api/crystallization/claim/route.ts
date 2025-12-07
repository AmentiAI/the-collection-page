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
    await client.query('BEGIN')

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
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'No active crystallization found for this ordinal' },
        { status: 404 }
      )
    }

    const record = recordResult.rows[0]
    const enteredAt = new Date(record.entered_at)

    // Calculate powder earned (1 per 30 minutes)
    // EXTRACT(EPOCH FROM ...) gives seconds, divide by 1800 (30 min * 60 sec)
    const powderResult = await client.query(
      `SELECT FLOOR(EXTRACT(EPOCH FROM (NOW() - $1::TIMESTAMPTZ)) / 1800)::INTEGER as powder_earned`,
      [enteredAt]
    )

    const powderEarned = Math.max(0, Number(powderResult.rows[0]?.powder_earned ?? 0))

    if (powderEarned === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'No powder earned yet. Wait at least 30 minutes.' },
        { status: 400 }
      )
    }

    // Update crystallization record - keep it active but reset timer and record claim
    // Reset entered_at to NOW() so powder calculation starts fresh after claim
    // Keep status as 'active' so ordinal stays in chamber
    await client.query(
      `UPDATE crystallization_records
       SET claimed_at = NOW(),
           entered_at = NOW(), -- Reset timer so they start earning from 0 again
           ascension_powder_earned = $1, -- Record this claim amount
           status = 'active', -- Keep active so it stays in chamber
           updated_at = NOW()
       WHERE id = $2`,
      [powderEarned, record.id]
    )

    // Ensure profile exists
    await client.query(
      `INSERT INTO profiles (wallet_address, ascension_powder)
       VALUES ($1, 0)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [walletAddress]
    )

    // Add powder to profile
    const profileUpdate = await client.query(
      `UPDATE profiles
       SET ascension_powder = COALESCE(ascension_powder, 0) + $1,
           updated_at = NOW()
       WHERE LOWER(wallet_address) = LOWER($2)
       RETURNING ascension_powder`,
      [powderEarned, walletAddress]
    )

    const newBalance = Number(profileUpdate.rows[0]?.ascension_powder ?? 0)

    // Update daily history (upsert by date)
    await client.query(
      `INSERT INTO crystallization_daily_history (wallet_address, date, total_ascension_powder)
       VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (wallet_address, date)
       DO UPDATE SET 
         total_ascension_powder = crystallization_daily_history.total_ascension_powder + EXCLUDED.total_ascension_powder,
         updated_at = NOW()`,
      [walletAddress, powderEarned]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      message: `Claimed ${powderEarned} ascension powder`,
      powderEarned,
      newBalance,
    })
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError)
      }
    }
    console.error('Error claiming crystallization powder:', error)
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

