import { NextRequest, NextResponse } from 'next/server'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

const REQUIRED_PARTICIPANTS = 50
const CIRCLE_DURATION_MS = 30 * 60 * 1000
const MAX_ACTIVE_CIRCLES_PER_USER = 1
// Set to false to disable damned pool circles at the API level
const DAMNED_POOL_MODE_ENABLED = process.env.NEXT_PUBLIC_DAMNED_POOL_MODE_ENABLED !== 'false'

async function ensureDamnedPoolInfrastructure(pool: ReturnType<typeof getPool>) {
  // Skip if already initialized to avoid redundant DDL operations
  if (isTableInitialized('damned_pool_circles')) {
    return
  }

  // DDL operations commented out for performance - tables must exist in production
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS damned_pool_circles (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     creator_wallet TEXT NOT NULL,
  //     creator_inscription_id TEXT NOT NULL,
  //     status TEXT NOT NULL DEFAULT 'open',
  //     required_participants INTEGER NOT NULL DEFAULT ${REQUIRED_PARTICIPANTS},
  //     mode TEXT NOT NULL DEFAULT 'open_all',
  //     locked_at TIMESTAMPTZ,
  //     completed_at TIMESTAMPTZ,
  //     expires_at TIMESTAMPTZ,
  //     burn_window_granted BOOLEAN NOT NULL DEFAULT FALSE,
  //     created_at TIMESTAMPTZ DEFAULT NOW(),
  //     updated_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)
  // await pool.query(`ALTER TABLE damned_pool_circles ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'open_all'`)
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS damned_pool_participants (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     circle_id UUID NOT NULL REFERENCES damned_pool_circles(id) ON DELETE CASCADE,
  //     wallet TEXT NOT NULL,
  //     inscription_id TEXT NOT NULL,
  //     inscription_image TEXT,
  //     role TEXT NOT NULL DEFAULT 'participant',
  //     joined_at TIMESTAMPTZ DEFAULT NOW(),
  //     completed BOOLEAN NOT NULL DEFAULT FALSE,
  //     completed_at TIMESTAMPTZ,
  //     UNIQUE(circle_id, wallet),
  //     UNIQUE(circle_id, inscription_id)
  //   )
  // `)

  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('damned_pool_circles')
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
  if (!DAMNED_POOL_MODE_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Damned pool circles are currently disabled.' },
      { status: 503 },
    )
  }
  const { circleId } = params
  if (!circleId) {
    return NextResponse.json({ success: false, error: 'Missing circleId' }, { status: 400 })
  }

  const pool = getPool()
  await ensureDamnedPoolInfrastructure(pool)

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

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const circleRes = await client.query('SELECT * FROM damned_pool_circles WHERE id = $1 FOR UPDATE', [circleId])
    if (circleRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Circle not found' }, { status: 404 })
    }

    const circle = circleRes.rows[0]
    const circleMode = (circle.mode ?? 'open_all').toString()

    if (circle.expires_at && new Date(circle.expires_at) < new Date()) {
      await client.query(
        `UPDATE damned_pool_circles SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [circleId],
      )
      await client.query('COMMIT')
      return NextResponse.json({ success: false, error: 'This damned pool has expired.' }, { status: 410 })
    }

    if (!['open', 'filling'].includes(circle.status)) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This damned pool is no longer accepting participants.' },
        { status: 409 },
      )
    }

    const existingParticipant = await client.query(
      `SELECT 1 FROM damned_pool_participants WHERE circle_id = $1 AND LOWER(wallet) = LOWER($2)`,
      [circleId, wallet],
    )
    if (existingParticipant.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'You already joined this damned pool.' },
        { status: 409 },
      )
    }

    // Check if user is already in an active damned pool for this mode
    const userActiveCirclesRes = await client.query(
      `
        SELECT COUNT(DISTINCT c.id)::int AS active_count
        FROM damned_pool_circles c
        WHERE c.status IN ('open', 'filling', 'ready')
          AND c.mode = $2
          AND (
            LOWER(c.creator_wallet) = LOWER($1)
            OR EXISTS (
              SELECT 1 FROM damned_pool_participants p
              WHERE p.circle_id = c.id
                AND LOWER(p.wallet) = LOWER($1)
            )
          )
      `,
      [wallet, circleMode],
    )
    const userActiveCount = Number(userActiveCirclesRes.rows[0]?.active_count ?? 0)

    if (userActiveCount >= MAX_ACTIVE_CIRCLES_PER_USER) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_ACTIVE_CIRCLES_PER_USER} active damned pool allowed per user.` },
        { status: 409 },
      )
    }

    // Check if inscription is in AFK circle
    const AFK_CIRCLE_ID = '00000000-0000-0000-0000-000000000000'
    await client.query(`
      CREATE TABLE IF NOT EXISTS afk_circles (
        id UUID PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'open',
        required_participants INTEGER NOT NULL DEFAULT 100,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`
      INSERT INTO afk_circles (id, status, required_participants, created_at, updated_at)
      VALUES ($1, 'open', 100, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [AFK_CIRCLE_ID])
    await client.query(`
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
    
    const afkConflict = await client.query(
      `SELECT 1 FROM afk_circle_participants WHERE circle_id = $1 AND inscription_id = $2 LIMIT 1`,
      [AFK_CIRCLE_ID, inscriptionId],
    )
    if (afkConflict.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: 'This ordinal is currently in the AFK circle. Remove it from the AFK circle first.',
        },
        { status: 409 },
      )
    }

    const inscriptionConflict = await client.query(
      `
        SELECT c.id
        FROM damned_pool_participants p
        JOIN damned_pool_circles c ON c.id = p.circle_id
        WHERE p.inscription_id = $1
          AND c.status IN ('open', 'filling', 'ready')
        LIMIT 1
      `,
      [inscriptionId],
    )
    if (inscriptionConflict.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: 'This ordinal is already pledged to another damned pool.',
        },
        { status: 409 },
      )
    }

    const participantCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM damned_pool_participants WHERE circle_id = $1`,
      [circleId],
    )
    const participantCount = participantCountRes.rows[0]?.count ?? 0
    if (participantCount >= circle.required_participants) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This damned pool is already full.' },
        { status: 409 },
      )
    }

    await client.query(
      `
        INSERT INTO damned_pool_participants (circle_id, wallet, inscription_id, inscription_image, role)
        VALUES ($1, $2, $3, $4, 'participant')
        ON CONFLICT (circle_id, wallet) DO NOTHING
      `,
      [circleId, wallet, inscriptionId, inscriptionImage],
    )

    const updatedCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM damned_pool_participants WHERE circle_id = $1`,
      [circleId],
    )
    const updatedCount = updatedCountRes.rows[0]?.count ?? 0

    if (updatedCount >= circle.required_participants) {
      // When pool becomes ready, set locked_at but DON'T reset expires_at
      await client.query(
        `
          UPDATE damned_pool_circles
          SET status = 'ready',
              locked_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [circleId],
      )
    }

    await client.query('COMMIT')

    const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))

    return NextResponse.json({
      success: true,
      summon: mapCircleRow(refreshed.rows[0]),
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[damned-pool/circles/join]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to join damned pool.' },
      { status: 500 },
    )
  } finally {
    client.release()
  }
}

