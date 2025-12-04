import { NextRequest, NextResponse } from 'next/server'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

const AFK_CIRCLE_ID = '00000000-0000-0000-0000-000000000000' // Fixed UUID for the single AFK circle
const MAX_AFK_PARTICIPANTS = 120

// Cron job endpoint: Grant +2 ascension_powder per ordinal in AFK circle
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

    // Check if abyss-summon is currently closed (7:00 PM to 12:00 PM EST)
    const now = new Date()
    const estFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false,
    })
    const estHour = parseInt(estFormatter.formatToParts(now).find(p => p.type === 'hour')?.value || '0')
    const isAbyssClosed = estHour >= 19 || estHour < 12
    
    // Don't grant rewards during closed hours
    if (isAbyssClosed) {
      return NextResponse.json({
        success: true,
        message: 'Abyss-summon is closed. No rewards granted.',
        granted: 0,
        errors: 0,
        skipped: true
      })
    }

    const pool = getPool()

    // Ensure infrastructure exists
    if (!isTableInitialized('afk_reward_tables')) {
      // DDL operations commented out for performance - tables must exist in production
      // await pool.query(`
      //   CREATE TABLE IF NOT EXISTS afk_circles (
      //     id UUID PRIMARY KEY,
      //     status TEXT NOT NULL DEFAULT 'open',
      //     required_participants INTEGER NOT NULL DEFAULT ${MAX_AFK_PARTICIPANTS},
      //     created_at TIMESTAMPTZ DEFAULT NOW(),
      //     updated_at TIMESTAMPTZ DEFAULT NOW()
      //   )
      // `)
      
      // await pool.query(`
      //   INSERT INTO afk_circles (id, status, required_participants, created_at, updated_at)
      //   VALUES ($1, 'open', $2, NOW(), NOW())
      //   ON CONFLICT (id) DO NOTHING
      // `, [AFK_CIRCLE_ID, MAX_AFK_PARTICIPANTS])
      
      // await pool.query(`
      //   CREATE TABLE IF NOT EXISTS afk_circle_participants (
      //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      //     circle_id UUID NOT NULL REFERENCES afk_circles(id) ON DELETE CASCADE,
      //     wallet TEXT NOT NULL,
      //     inscription_id TEXT NOT NULL,
      //     inscription_image TEXT,
      //     joined_at TIMESTAMPTZ DEFAULT NOW(),
      //     last_reward_at TIMESTAMPTZ,
      //     UNIQUE(circle_id, wallet, inscription_id)
      //   )
      // `)
      // await pool.query(`
      //   CREATE TABLE IF NOT EXISTS profiles (
      //     wallet_address TEXT PRIMARY KEY,
      //     ascension_powder INTEGER NOT NULL DEFAULT 0,
      //     created_at TIMESTAMPTZ DEFAULT NOW(),
      //     updated_at TIMESTAMPTZ DEFAULT NOW()
      //   )
      // `)
      // await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)

      markTableInitialized('afk_reward_tables')
    }

    await pool.query('BEGIN')

    try {
      // Get all participants from the AFK circle
      const participantsRes = await pool.query(`
        SELECT wallet, inscription_id
        FROM afk_circle_participants
        WHERE circle_id = $1
      `, [AFK_CIRCLE_ID])

      const participants = participantsRes.rows
      let granted = 0
      let errors = 0

      // Grant +2 powder per ordinal
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

        // Grant +2 ascension powder
        await pool.query(
          `
            UPDATE profiles
            SET ascension_powder = COALESCE(ascension_powder, 0) + 2,
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
            WHERE circle_id = $1 AND LOWER(wallet) = LOWER($2) AND inscription_id = $3
          `,
          [AFK_CIRCLE_ID, wallet, participant.inscription_id],
        )

        granted++
      }

      await pool.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: `Granted +2 ascension powder to ${granted} participants.`,
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

