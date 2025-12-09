import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const hours = Number(body?.hours ?? 20)
    const creditsOnly = Boolean(body?.creditsOnly ?? true)

    if (hours <= 0 || hours > 168) {
      return NextResponse.json(
        { success: false, error: 'Hours must be between 1 and 168 (7 days).' },
        { status: 400 },
      )
    }

    const pool = getPool()

    // First, deactivate any existing active burn windows
    await pool.query(
      `
        UPDATE damned_pool_burn_windows
        SET active = FALSE
        WHERE active = TRUE
      `,
    )

    // Find or create a dummy circle for the manual burn window
    // We'll use a special admin circle that won't interfere with normal operations
    let circleResult = await pool.query(
      `
        SELECT id FROM damned_pool_circles
        WHERE creator_wallet = 'admin_manual_window'
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )

    let circleId: string
    if (circleResult.rows.length > 0) {
      circleId = circleResult.rows[0].id
    } else {
      // Create a dummy circle for the manual burn window
      const newCircleResult = await pool.query(
        `
          INSERT INTO damned_pool_circles (
            creator_wallet,
            creator_inscription_id,
            status,
            required_participants,
            mode,
            burn_window_granted,
            completed_at
          )
          VALUES (
            'admin_manual_window',
            'admin_manual_window',
            'completed',
            1,
            $1,
            TRUE,
            NOW()
          )
          RETURNING id
        `,
        [creditsOnly ? 'bonus_credits' : 'open_all'],
      )
      circleId = newCircleResult.rows[0].id
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)

    // Create the burn window
    await pool.query(
      `
        INSERT INTO damned_pool_burn_windows (
          circle_id,
          expires_at,
          active,
          credits_only
        )
        VALUES ($1, $2, TRUE, $3)
      `,
      [circleId, expiresAt.toISOString(), creditsOnly],
    )

    return NextResponse.json({
      success: true,
      message: `Burn window created for ${hours} hours (credits-only: ${creditsOnly})`,
      expiresAt: expiresAt.toISOString(),
      creditsOnly,
    })
  } catch (error) {
    console.error('[admin/burn-window/create][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create burn window.' },
      { status: 500 },
    )
  }
}

