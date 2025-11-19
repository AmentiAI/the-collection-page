import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Cron job endpoint: Grant +1 ascension_powder per ordinal in AFK circle
// Should be called hourly
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if set
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const pool = getPool()

    // Ensure infrastructure exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS afk_circle_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet TEXT NOT NULL,
        inscription_id TEXT NOT NULL,
        inscription_image TEXT,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        last_reward_at TIMESTAMPTZ,
        UNIQUE(wallet, inscription_id)
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        wallet_address TEXT PRIMARY KEY,
        ascension_powder INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)

    await pool.query('BEGIN')

    try {
      // Get all participants
      const participantsRes = await pool.query(`
        SELECT wallet, inscription_id
        FROM afk_circle_participants
      `)

      const participants = participantsRes.rows
      let granted = 0
      let errors = 0

      // Grant +1 powder per ordinal
      for (const participant of participants) {
        const wallet = participant.wallet

        // Ensure profile exists
        await pool.query(
          `
            INSERT INTO profiles (wallet_address, ascension_powder)
            VALUES ($1, 0)
            ON CONFLICT (wallet_address) DO NOTHING
          `,
          [wallet],
        )

        // Grant +1 ascension powder
        await pool.query(
          `
            UPDATE profiles
            SET ascension_powder = COALESCE(ascension_powder, 0) + 1,
                updated_at = NOW()
            WHERE LOWER(wallet_address) = LOWER($1)
          `,
          [wallet],
        )

        // Update last_reward_at
        await pool.query(
          `
            UPDATE afk_circle_participants
            SET last_reward_at = NOW()
            WHERE LOWER(wallet) = LOWER($1) AND inscription_id = $2
          `,
          [wallet, participant.inscription_id],
        )

        granted++
      }

      await pool.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: `Granted +1 ascension powder to ${granted} participants.`,
        granted,
        errors,
      })
    } catch (error) {
      await pool.query('ROLLBACK')
      throw error
    }
  } catch (error) {
    console.error('[afk-circle/reward][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process AFK circle rewards.' },
      { status: 500 },
    )
  }
}

