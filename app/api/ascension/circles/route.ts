import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const REQUIRED_PARTICIPANTS = 10
const CIRCLE_DURATION_MS = 10 * 60 * 1000
const POWDER_REWARD = 2
const MAX_ACTIVE_CIRCLES_PER_USER = 6
const MAX_ACTIVE_CIRCLES_GLOBAL = 10
// Set to false to disable powder circles at the API level
const POWDER_MODE_ENABLED = process.env.NEXT_PUBLIC_POWDER_MODE_ENABLED !== 'false'

async function ensurePowderInfrastructure(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS summoning_powder_circles (
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_powder_circles_status ON summoning_powder_circles(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_powder_circles_creator ON summoning_powder_circles((LOWER(creator_wallet)))`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS summoning_powder_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      circle_id UUID NOT NULL REFERENCES summoning_powder_circles(id) ON DELETE CASCADE,
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_powder_participants_circle ON summoning_powder_participants(circle_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_powder_participants_wallet ON summoning_powder_participants((LOWER(wallet)))`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ascension_powder_events (
      wallet_address TEXT NOT NULL,
      event_key TEXT NOT NULL,
      granted_amount INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (wallet_address, event_key)
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
}

async function expireOverdueCircles(pool: Pool) {
  await pool.query(`
    UPDATE summoning_powder_circles
    SET status = 'expired',
        updated_at = NOW()
    WHERE status IN ('open', 'filling', 'ready')
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
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

function buildCircleSelect(whereClause = '', limitClause = '', values: unknown[] = []) {
  return {
    text: `
      SELECT
        c.id,
        c.creator_wallet,
        c.creator_inscription_id,
        c.status,
        c.required_participants,
        c.locked_at,
        c.completed_at,
        c.expires_at,
        c.reward_granted,
        c.created_at,
        c.updated_at,
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
      FROM summoning_powder_circles c
      LEFT JOIN summoning_powder_participants p ON p.circle_id = c.id
      LEFT JOIN profiles pr ON LOWER(pr.wallet_address) = LOWER(p.wallet)
      ${whereClause}
      GROUP BY c.id, c.creator_wallet, c.creator_inscription_id, c.status, c.required_participants, c.locked_at, c.completed_at, c.expires_at, c.reward_granted, c.created_at, c.updated_at
      ORDER BY c.created_at DESC
      ${limitClause}
    `,
    values,
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!POWDER_MODE_ENABLED) {
      return NextResponse.json(
        { success: false, error: 'Powder circles are currently disabled.' },
        { status: 503 },
      )
    }
    const pool = getPool()
    await ensurePowderInfrastructure(pool)
    await expireOverdueCircles(pool)

    const searchParams = request.nextUrl.searchParams
    const walletParam = searchParams.get('wallet')?.trim()
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '25', 10)
    const limit = Number.isNaN(limitParam) ? 25 : Math.min(Math.max(limitParam, 1), 200)

    const baseQuery = buildCircleSelect('WHERE c.status IN (\'open\', \'filling\', \'ready\')', 'LIMIT $1', [limit])
    const baseResult = await pool.query(baseQuery)
    const summons = baseResult.rows.map(mapCircleRow)

    let createdSummons: any[] = []
    let joinedSummons: any[] = []
    let powderBalance: number | null = null

    if (walletParam) {
      const createdQuery = buildCircleSelect('WHERE LOWER(c.creator_wallet) = LOWER($1)', 'LIMIT 50', [walletParam])
      const createdRes = await pool.query(createdQuery)
      createdSummons = createdRes.rows.map(mapCircleRow)

      const joinedQuery = buildCircleSelect(
        `WHERE c.id IN (
            SELECT circle_id
            FROM summoning_powder_participants
            WHERE LOWER(wallet) = LOWER($1)
          )`,
        'LIMIT 50',
        [walletParam],
      )
      const joinedRes = await pool.query(joinedQuery)
      joinedSummons = joinedRes.rows.map(mapCircleRow)

      const balanceRes = await pool.query(
        `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
        [walletParam],
      )
      powderBalance = Number(balanceRes.rows[0]?.ascension_powder ?? 0)
    }

    return NextResponse.json({
      success: true,
      summons,
      createdSummons,
      joinedSummons,
      powderBalance,
    })
  } catch (error) {
    console.error('[ascension/circles][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch ascension circles.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!POWDER_MODE_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Powder circles are currently disabled.' },
      { status: 503 },
    )
  }
  const pool = getPool()
  try {
    const body = await request.json().catch(() => ({}))
    const creatorWallet = (body?.creatorWallet ?? '').toString().trim()
    const creatorInscriptionId = (body?.inscriptionId ?? '').toString().trim()
    const creatorInscriptionImage =
      typeof body?.inscriptionImage === 'string' && body.inscriptionImage.trim().length > 0
        ? body.inscriptionImage.trim()
        : null

    if (!creatorWallet || !creatorInscriptionId) {
      return NextResponse.json(
        { success: false, error: 'creatorWallet and inscriptionId are required.' },
        { status: 400 },
      )
    }

    await ensurePowderInfrastructure(pool)

    const expiresAt = new Date(Date.now() + CIRCLE_DURATION_MS)

    await pool.query('BEGIN')

    // Check if this user already has 6 active circles
    const userActiveCountRes = await pool.query(
      `
        SELECT COUNT(*)::int AS active_count
        FROM summoning_powder_circles
        WHERE LOWER(creator_wallet) = LOWER($1)
          AND status IN ('open', 'filling', 'ready')
      `,
      [creatorWallet],
    )
    const userActiveCount = Number(userActiveCountRes.rows[0]?.active_count ?? 0)
    
    if (userActiveCount >= MAX_ACTIVE_CIRCLES_PER_USER) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_ACTIVE_CIRCLES_PER_USER} active circles allowed per user. Please wait for a circle to complete or expire.` },
        { status: 409 },
      )
    }

    // Check if there are already 10 active circles globally
    const globalActiveCountRes = await pool.query(
      `
        SELECT COUNT(*)::int AS active_count
        FROM summoning_powder_circles
        WHERE status IN ('open', 'filling', 'ready')
      `,
    )
    const globalActiveCount = Number(globalActiveCountRes.rows[0]?.active_count ?? 0)
    
    if (globalActiveCount >= MAX_ACTIVE_CIRCLES_GLOBAL) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_ACTIVE_CIRCLES_GLOBAL} active circles allowed globally. Please wait for a circle to complete or expire.` },
        { status: 409 },
      )
    }

    const conflictRes = await pool.query(
      `
        SELECT c.id
        FROM summoning_powder_circles c
        JOIN summoning_powder_participants p ON p.circle_id = c.id
        WHERE p.inscription_id = $1
          AND c.status IN ('open', 'filling', 'ready')
        LIMIT 1
      `,
      [creatorInscriptionId],
    )

    if (conflictRes.rows.length > 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This ordinal is already pledged to an active ascension circle.' },
        { status: 409 },
      )
    }

    const circleResult = await pool.query(
      `
        INSERT INTO summoning_powder_circles (
          creator_wallet,
          creator_inscription_id,
          status,
          required_participants,
          expires_at
        )
        VALUES ($1, $2, 'open', $3, $4)
        RETURNING *
      `,
      [creatorWallet, creatorInscriptionId, REQUIRED_PARTICIPANTS, expiresAt.toISOString()],
    )

    const circle = circleResult.rows[0]

    await pool.query(
      `
        INSERT INTO summoning_powder_participants (circle_id, wallet, inscription_id, inscription_image, role)
        VALUES ($1, $2, $3, $4, 'creator')
      `,
      [circle.id, creatorWallet, creatorInscriptionId, creatorInscriptionImage],
    )

    await pool.query(
      `
        UPDATE summoning_powder_circles
        SET status = 'filling',
            updated_at = NOW()
        WHERE id = $1
      `,
      [circle.id],
    )

    await pool.query('COMMIT')

    const refreshed = await pool.query(
      buildCircleSelect('WHERE c.id = $1', '', [circle.id]),
    )

    return NextResponse.json({
      success: true,
      summon: mapCircleRow(refreshed.rows[0]),
    })
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {})
    console.error('[ascension/circles][POST]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create ascension circle.' },
      { status: 500 },
    )
  }
}
