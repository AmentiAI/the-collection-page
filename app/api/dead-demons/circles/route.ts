import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

const REQUIRED_PARTICIPANTS = 10
const CIRCLE_DURATION_MS = 10 * 60 * 1000 // 10 minutes
const POWDER_REWARD_HOST = 15
const POWDER_REWARD_PARTICIPANT = 12
const MAX_ACTIVE_CIRCLES_GLOBAL = 3 // Only 3 globally open at a time

async function ensureDeadDemonsInfrastructure(pool: Pool) {
  // Skip if already initialized in this process to avoid slow DDL operations
  if (isTableInitialized('dead_demons_circles')) {
    return
  }
  
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dead_demons_circles_status ON dead_demons_circles(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dead_demons_circles_creator ON dead_demons_circles((LOWER(creator_wallet)))`)

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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dead_demons_participants_circle ON dead_demons_participants(circle_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dead_demons_participants_wallet ON dead_demons_participants((LOWER(wallet)))`)
  
  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('dead_demons_circles')
}

async function expireOverdueCircles(pool: Pool) {
  await pool.query(`
    UPDATE dead_demons_circles
    SET status = 'expired', updated_at = NOW()
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
      ORDER BY c.created_at DESC
      ${limitClause}
    `,
    values,
  }
}

// Check if wallet has an ascended_ inscription in abyss_burns
async function hasAscendedInscription(pool: Pool, wallet: string): Promise<boolean> {
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

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureDeadDemonsInfrastructure(pool)
    await expireOverdueCircles(pool)

    const searchParams = request.nextUrl.searchParams
    const walletParam = searchParams.get('wallet')?.trim()
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '25', 10)
    const limit = Number.isNaN(limitParam) ? 25 : Math.min(Math.max(limitParam, 1), 200)

    const baseQuery = buildCircleSelect('WHERE c.status IN (\'open\', \'filling\', \'ready\')', 'LIMIT $1', [limit])
    const baseResult = await pool.query(baseQuery)
    const circles = baseResult.rows.map(mapCircleRow)

    let createdCircles: any[] = []
    let joinedCircles: any[] = []
    let powderBalance: number | null = null

    if (walletParam) {
      // Check eligibility
      const isEligible = await hasAscendedInscription(pool, walletParam)
      
      const createdQuery = buildCircleSelect('WHERE LOWER(c.creator_wallet) = LOWER($1)', 'LIMIT 50', [walletParam])
      const createdRes = await pool.query(createdQuery)
      createdCircles = createdRes.rows.map(mapCircleRow)

      const joinedQuery = buildCircleSelect(
        `WHERE c.id IN (
            SELECT circle_id
            FROM dead_demons_participants
            WHERE LOWER(wallet) = LOWER($1)
          )`,
        'LIMIT 50',
        [walletParam],
      )
      const joinedRes = await pool.query(joinedQuery)
      joinedCircles = joinedRes.rows.map(mapCircleRow)

      const balanceRes = await pool.query(
        `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
        [walletParam],
      )
      powderBalance = Number(balanceRes.rows[0]?.ascension_powder ?? 0)

      return NextResponse.json(
        {
          success: true,
          circles,
          createdCircles,
          joinedCircles,
          powderBalance,
          isEligible,
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=3, s-maxage=3, stale-while-revalidate=1',
          },
        },
      )
    }

    return NextResponse.json(
      {
        success: true,
        circles,
        createdCircles,
        joinedCircles,
        powderBalance,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3, s-maxage=3, stale-while-revalidate=1',
        },
      },
    )
  } catch (error) {
    console.error('[dead-demons/circles][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dead demons circles.' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }
}

export async function POST(request: NextRequest) {
  const pool = getPool()
  await ensureDeadDemonsInfrastructure(pool)

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

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Check eligibility - must have an ascended_ inscription
    const isEligible = await hasAscendedInscription(pool, creatorWallet)
    if (!isEligible) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: 'You must have at least one ascended inscription (inscription_id starting with "ascended_") in your abyss_burns to create a Dead Demons circle.',
        },
        { status: 403 },
      )
    }

    // Check global limit (only 3 circles globally open)
    const globalActiveCountRes = await client.query(
      `
        SELECT COUNT(*)::int AS active_count
        FROM dead_demons_circles
        WHERE status IN ('open', 'filling', 'ready')
      `,
    )
    const globalActiveCount = Number(globalActiveCountRes.rows[0]?.active_count ?? 0)

    if (globalActiveCount >= MAX_ACTIVE_CIRCLES_GLOBAL) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: `Maximum of ${MAX_ACTIVE_CIRCLES_GLOBAL} Dead Demons circles allowed globally. Please wait for a circle to complete or expire.`,
        },
        { status: 409 },
      )
    }

    // Check if inscription is already in use
    const inscriptionConflict = await client.query(
      `
        SELECT c.id
        FROM dead_demons_participants p
        JOIN dead_demons_circles c ON c.id = p.circle_id
        WHERE p.inscription_id = $1
          AND c.status IN ('open', 'filling', 'ready')
        LIMIT 1
      `,
      [creatorInscriptionId],
    )
    if (inscriptionConflict.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          success: false,
          error: 'This ordinal is already pledged to another Dead Demons circle.',
        },
        { status: 409 },
      )
    }

    const expiresAt = new Date(Date.now() + CIRCLE_DURATION_MS)

    await client.query(
      `
        INSERT INTO dead_demons_circles (creator_wallet, creator_inscription_id, status, required_participants, expires_at)
        VALUES ($1, $2, 'open', $3, $4)
        RETURNING id
      `,
      [creatorWallet, creatorInscriptionId, REQUIRED_PARTICIPANTS, expiresAt],
    )

    const circleIdRes = await client.query(
      `SELECT id FROM dead_demons_circles WHERE creator_wallet = $1 AND creator_inscription_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [creatorWallet, creatorInscriptionId],
    )
    const circleId = circleIdRes.rows[0]?.id

    if (!circleId) {
      await client.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Failed to create circle' }, { status: 500 })
    }

    // Add creator as first participant
    await client.query(
      `
        INSERT INTO dead_demons_participants (circle_id, wallet, inscription_id, inscription_image, role)
        VALUES ($1, $2, $3, $4, 'creator')
        ON CONFLICT (circle_id, wallet) DO NOTHING
      `,
      [circleId, creatorWallet, creatorInscriptionId, creatorInscriptionImage],
    )

    await client.query('COMMIT')

    const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', '', [circleId]))
    return NextResponse.json({ success: true, summon: mapCircleRow(refreshed.rows[0]) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[dead-demons/circles][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create Dead Demons circle.' },
      { status: 500 },
    )
  } finally {
    client.release()
  }
}

