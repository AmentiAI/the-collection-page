import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COMPLETION_WINDOW_MS = 2 * 60 * 1000 // Last 2 minutes
const MIN_COMPLETION_COUNT = 45 // 45 out of 50 must complete
const BURN_WINDOW_DURATION_MS = 60 * 60 * 1000 // 1 hour

async function ensureDamnedPoolInfrastructure(pool: ReturnType<typeof getPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS damned_pool_circles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_wallet TEXT NOT NULL,
      creator_inscription_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      required_participants INTEGER NOT NULL DEFAULT 50,
      locked_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      burn_window_granted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS damned_pool_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      circle_id UUID NOT NULL REFERENCES damned_pool_circles(id) ON DELETE CASCADE,
      wallet TEXT NOT NULL,
      inscription_id TEXT NOT NULL,
      inscription_image TEXT,
      role TEXT NOT NULL DEFAULT 'participant',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TIMESTAMPTZ,
      UNIQUE(circle_id, wallet),
      UNIQUE(circle_id, inscription_id)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS damned_pool_burn_windows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      circle_id UUID NOT NULL REFERENCES damned_pool_circles(id) ON DELETE CASCADE,
      granted_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_damned_pool_burn_windows_active ON damned_pool_burn_windows(active, expires_at)`)
}

function mapCircleRow(row: any) {
  return {
    id: row.id,
    creatorWallet: row.creator_wallet,
    creatorInscriptionId: row.creator_inscription_id,
    status: row.status,
    requiredParticipants: Number(row.required_participants ?? 50),
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    burnWindowGranted: Boolean(row.burn_window_granted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants: Array.isArray(row.participants) ? row.participants : [],
  }
}

function buildCircleSelect(whereClause = '', values: unknown[] = []) {
  return {
    text: `
      SELECT
        c.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', p.id,
              'wallet', p.wallet,
              'inscriptionId', p.inscription_id,
              'image', p.inscription_image,
              'role', p.role,
              'joinedAt', p.joined_at,
              'completed', p.completed,
              'completedAt', p.completed_at,
              'username', pr.username,
              'avatarUrl', pr.avatar_url
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS participants
      FROM damned_pool_circles c
      LEFT JOIN damned_pool_participants p ON p.circle_id = c.id
      LEFT JOIN profiles pr ON LOWER(pr.wallet_address) = LOWER(p.wallet)
      ${whereClause}
      GROUP BY c.id
    `,
    values,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { circleId: string } },
) {
  const pool = getPool()
  try {
    const body = await request.json().catch(() => ({}))
    const wallet = (body?.wallet ?? '').toString().trim()

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 })
    }

    const { circleId } = params
    if (!circleId) {
      return NextResponse.json({ success: false, error: 'Missing circleId' }, { status: 400 })
    }

    await ensureDamnedPoolInfrastructure(pool)

    await pool.query('BEGIN')

    const circleRes = await pool.query('SELECT * FROM damned_pool_circles WHERE id = $1 FOR UPDATE', [circleId])
    if (circleRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Circle not found' }, { status: 404 })
    }

    const circle = circleRes.rows[0]

    if (circle.status !== 'ready') {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This damned pool cannot be completed.' },
        { status: 409 },
      )
    }

    const participantRes = await pool.query(
      `
        SELECT *
        FROM damned_pool_participants
        WHERE circle_id = $1 AND LOWER(wallet) = LOWER($2)
        FOR UPDATE
      `,
      [circleId, wallet],
    )

    if (participantRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'You are not part of this damned pool.' },
        { status: 403 },
      )
    }

    const participant = participantRes.rows[0]
    if (participant.completed) {
      await pool.query('ROLLBACK')
      const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))
      return NextResponse.json({
        success: true,
        message: 'Completion already recorded for this wallet.',
        summon: mapCircleRow(refreshed.rows[0]),
      })
    }

    const now = new Date()
    const expiresAt = circle.expires_at ? new Date(circle.expires_at) : null

    if (!expiresAt) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Damned pool has not entered completion phase yet.' },
        { status: 409 },
      )
    }

    const finalWindowStart = new Date(expiresAt.getTime() - COMPLETION_WINDOW_MS)
    const timeUntilExpiry = expiresAt.getTime() - now.getTime()
    const timeUntilWindow = finalWindowStart.getTime() - now.getTime()

    if (timeUntilWindow > 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: `Final window has not opened. Window opens in ${Math.ceil(timeUntilWindow / 1000)} seconds.`,
          timeUntilWindow: Math.ceil(timeUntilWindow / 1000),
        },
        { status: 409 },
      )
    }

    if (timeUntilExpiry <= 0) {
      await pool.query(
        `UPDATE damned_pool_circles SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [circleId],
      )
      await pool.query('COMMIT')
      return NextResponse.json({ success: false, error: 'Damned pool has expired.' }, { status: 410 })
    }

    // Mark participant as completed
    await pool.query(
      `
        UPDATE damned_pool_participants
        SET completed = TRUE,
            completed_at = NOW()
        WHERE id = $1
      `,
      [participant.id],
    )

    const participantsRes = await pool.query(
      `SELECT wallet, completed FROM damned_pool_participants WHERE circle_id = $1 FOR UPDATE`,
      [circleId],
    )
    const participants = participantsRes.rows
    const completedCount = participants.filter((row) => row.completed).length
    // Allow completion if 45 out of 50 participants have marked complete
    const allCompleted = participants.length >= circle.required_participants && completedCount >= MIN_COMPLETION_COUNT

    let burnWindowGranted = Boolean(circle.burn_window_granted)

    if (allCompleted && !burnWindowGranted) {
      // Grant 1 hour burn window
      const burnWindowExpiresAt = new Date(now.getTime() + BURN_WINDOW_DURATION_MS)

      await pool.query(
        `
          UPDATE damned_pool_circles
          SET status = 'completed',
              completed_at = NOW(),
              burn_window_granted = TRUE,
              updated_at = NOW()
          WHERE id = $1
        `,
        [circleId],
      )

      // Create burn window record
      await pool.query(
        `
          INSERT INTO damned_pool_burn_windows (circle_id, expires_at)
          VALUES ($1, $2)
        `,
        [circleId, burnWindowExpiresAt.toISOString()],
      )

      burnWindowGranted = true
    }

    await pool.query('COMMIT')

    const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))

    return NextResponse.json({
      success: true,
      summon: mapCircleRow(refreshed.rows[0]),
      burnWindowGranted,
    })
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {})
    console.error('[damned-pool/circles/complete]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to complete damned pool.' },
      { status: 500 },
    )
  }
}

