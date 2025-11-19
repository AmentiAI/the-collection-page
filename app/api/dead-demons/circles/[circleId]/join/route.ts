import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const REQUIRED_PARTICIPANTS = 10
const CIRCLE_DURATION_MS = 10 * 60 * 1000

async function ensureDeadDemonsInfrastructure(pool: ReturnType<typeof getPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dead_demons_circles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_wallet TEXT NOT NULL,
      creator_inscription_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      required_participants INTEGER NOT NULL DEFAULT ${REQUIRED_PARTICIPANTS},
      locked_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dead_demons_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      circle_id UUID NOT NULL REFERENCES dead_demons_circles(id) ON DELETE CASCADE,
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
}

function mapCircleRow(row: any) {
  return {
    id: row.id,
    creatorWallet: row.creator_wallet,
    creatorInscriptionId: row.creator_inscription_id,
    status: row.status,
    requiredParticipants: Number(row.required_participants ?? REQUIRED_PARTICIPANTS),
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    bonusGranted: Boolean(row.reward_granted),
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
      FROM dead_demons_circles c
      LEFT JOIN dead_demons_participants p ON p.circle_id = c.id
      LEFT JOIN profiles pr ON LOWER(pr.wallet_address) = LOWER(p.wallet)
      ${whereClause}
      GROUP BY c.id
    `,
    values,
  }
}

// Check if wallet has an ascended_ inscription in abyss_burns
async function hasAscendedInscription(pool: ReturnType<typeof getPool>, wallet: string): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM abyss_burns
      WHERE LOWER(ordinal_wallet) = LOWER($1)
        AND inscription_id LIKE 'ascended_%'
    `,
    [wallet],
  )
  return Number(result.rows[0]?.count ?? 0) > 0
}

export async function POST(
  request: NextRequest,
  { params }: { params: { circleId: string } },
) {
  const { circleId } = params
  if (!circleId) {
    return NextResponse.json({ success: false, error: 'Missing circleId' }, { status: 400 })
  }

  const pool = getPool()
  await ensureDeadDemonsInfrastructure(pool)

  const body = await request.json().catch(() => ({}))
  const wallet = (body?.wallet ?? '').toString().trim()
  const inscriptionId = (body?.inscriptionId ?? '').toString().trim()
  const inscriptionImage =
    typeof body?.inscriptionImage === 'string' && body.inscriptionImage.trim().length > 0
      ? body.inscriptionImage.trim()
      : null

  if (!wallet || !inscriptionId) {
    return NextResponse.json(
      { success: false, error: 'wallet and inscriptionId are required' },
      { status: 400 },
    )
  }

  try {
    await pool.query('BEGIN')

    // Check eligibility - must have an ascended_ inscription
    const isEligible = await hasAscendedInscription(pool, wallet)
    if (!isEligible) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: 'You must have at least one ascended inscription (inscription_id starting with "ascended_") in your abyss_burns to join a Dead Demons circle.',
        },
        { status: 403 },
      )
    }

    const circleRes = await pool.query('SELECT * FROM dead_demons_circles WHERE id = $1 FOR UPDATE', [circleId])
    if (circleRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Circle not found' }, { status: 404 })
    }

    const circle = circleRes.rows[0]

    if (circle.expires_at && new Date(circle.expires_at) < new Date()) {
      await pool.query(
        `UPDATE dead_demons_circles SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [circleId],
      )
      await pool.query('COMMIT')
      return NextResponse.json({ success: false, error: 'This Dead Demons circle has expired.' }, { status: 410 })
    }

    if (!['open', 'filling'].includes(circle.status)) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This Dead Demons circle is no longer accepting participants.' },
        { status: 409 },
      )
    }

    const existingParticipant = await pool.query(
      `SELECT 1 FROM dead_demons_participants WHERE circle_id = $1 AND LOWER(wallet) = LOWER($2)`,
      [circleId, wallet],
    )
    if (existingParticipant.rows.length > 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'You already joined this Dead Demons circle.' },
        { status: 409 },
      )
    }

    // Check if inscription is in AFK circle
    const AFK_CIRCLE_ID = '00000000-0000-0000-0000-000000000000'
    await pool.query(`
      CREATE TABLE IF NOT EXISTS afk_circles (
        id UUID PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'open',
        required_participants INTEGER NOT NULL DEFAULT 100,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`
      INSERT INTO afk_circles (id, status, required_participants, created_at, updated_at)
      VALUES ($1, 'open', 100, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [AFK_CIRCLE_ID])
    await pool.query(`
      CREATE TABLE IF NOT EXISTS afk_circle_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id UUID NOT NULL REFERENCES afk_circles(id) ON DELETE CASCADE,
        wallet TEXT NOT NULL,
        inscription_id TEXT NOT NULL,
        inscription_image TEXT,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        last_reward_at TIMESTAMPTZ,
        UNIQUE(circle_id, wallet, inscription_id)
      )
    `)
    
    const afkConflict = await pool.query(
      `SELECT 1 FROM afk_circle_participants WHERE circle_id = $1 AND inscription_id = $2 LIMIT 1`,
      [AFK_CIRCLE_ID, inscriptionId],
    )
    if (afkConflict.rows.length > 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: 'This ordinal is currently in the AFK circle. Remove it from the AFK circle first.',
        },
        { status: 409 },
      )
    }

    const inscriptionConflict = await pool.query(
      `
        SELECT c.id
        FROM dead_demons_participants p
        JOIN dead_demons_circles c ON c.id = p.circle_id
        WHERE p.inscription_id = $1
          AND c.status IN ('open', 'filling', 'ready')
        LIMIT 1
      `,
      [inscriptionId],
    )
    if (inscriptionConflict.rows.length > 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: 'This ordinal is already pledged to another Dead Demons circle.',
        },
        { status: 409 },
      )
    }

    const participantCountRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM dead_demons_participants WHERE circle_id = $1`,
      [circleId],
    )
    const participantCount = participantCountRes.rows[0]?.count ?? 0
    if (participantCount >= circle.required_participants) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This Dead Demons circle is already full.' },
        { status: 409 },
      )
    }

    await pool.query(
      `
        INSERT INTO dead_demons_participants (circle_id, wallet, inscription_id, inscription_image, role)
        VALUES ($1, $2, $3, $4, 'participant')
        ON CONFLICT (circle_id, wallet) DO NOTHING
      `,
      [circleId, wallet, inscriptionId, inscriptionImage],
    )

    const updatedCountRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM dead_demons_participants WHERE circle_id = $1`,
      [circleId],
    )
    const updatedCount = updatedCountRes.rows[0]?.count ?? 0

    if (updatedCount >= circle.required_participants) {
      // When circle becomes ready, set locked_at but DON'T reset expires_at
      await pool.query(
        `
          UPDATE dead_demons_circles
          SET status = 'ready',
              locked_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [circleId],
      )
    } else if (circle.status !== 'filling') {
      await pool.query(
        `
          UPDATE dead_demons_circles
          SET status = 'filling',
              updated_at = NOW()
          WHERE id = $1
        `,
        [circleId],
      )
    }

    await pool.query('COMMIT')

    const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))
    return NextResponse.json({ success: true, summon: mapCircleRow(refreshed.rows[0]) })
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {})
    console.error('[dead-demons/circles/join][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to join Dead Demons circle.' },
      { status: 500 },
    )
  }
}

