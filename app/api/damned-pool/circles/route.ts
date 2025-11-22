import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

const REQUIRED_PARTICIPANTS = 40
const REQUIRED_PARTICIPANTS_BONUS = 20
const CIRCLE_DURATION_MAIN_MS = 20 * 60 * 1000 // 20 minutes (open_all 40 seats)
const CIRCLE_DURATION_BONUS_MS = 10 * 60 * 1000 // 10 minutes (bonus_credits 20 seats)
const MIN_COMPLETION_COUNT = 36 // 36 out of 40 must complete
const MIN_COMPLETION_COUNT_BONUS = 18 // 18 out of 20 must complete
const MAX_ACTIVE_CIRCLES_PER_USER = 1 // Only 1 damned pool at a time per user
const MAX_ACTIVE_CIRCLES_GLOBAL = 1 // Portal summoning enabled (1 = one global circle allowed)
// Set to false to disable damned pool circles at the API level
const DAMNED_POOL_MODE_ENABLED = false // Disabled: Portal circle creation is no longer allowed

async function ensureDamnedPoolInfrastructure(pool: Pool) {
  // Skip if already initialized in this process to avoid slow DDL operations
  if (isTableInitialized('damned_pool_circles')) {
    return
  }
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS damned_pool_circles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_wallet TEXT NOT NULL,
      creator_inscription_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      required_participants INTEGER NOT NULL DEFAULT ${REQUIRED_PARTICIPANTS},
      min_completion_count INTEGER NOT NULL DEFAULT ${MIN_COMPLETION_COUNT},
      mode TEXT NOT NULL DEFAULT 'open_all',
      locked_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      burn_window_granted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  // Backfill columns if upgrading
  await pool.query(`ALTER TABLE damned_pool_circles ADD COLUMN IF NOT EXISTS min_completion_count INTEGER NOT NULL DEFAULT ${MIN_COMPLETION_COUNT}`)
  await pool.query(`ALTER TABLE damned_pool_circles ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'open_all'`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_damned_pool_circles_status ON damned_pool_circles(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_damned_pool_circles_creator ON damned_pool_circles((LOWER(creator_wallet)))`)

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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_damned_pool_participants_circle ON damned_pool_participants(circle_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_damned_pool_participants_wallet ON damned_pool_participants((LOWER(wallet)))`)

  // Table to track successful completions that grant burn windows
  await pool.query(`
    CREATE TABLE IF NOT EXISTS damned_pool_burn_windows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      circle_id UUID NOT NULL REFERENCES damned_pool_circles(id) ON DELETE CASCADE,
      granted_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      credits_only BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
  await pool.query(`ALTER TABLE damned_pool_burn_windows ADD COLUMN IF NOT EXISTS credits_only BOOLEAN NOT NULL DEFAULT FALSE`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_damned_pool_burn_windows_active ON damned_pool_burn_windows(active, expires_at)`)
  
  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('damned_pool_circles')
}

async function expireOverdueCircles(pool: Pool) {
  await pool.query(`
    UPDATE damned_pool_circles
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
    minCompletionCount: Number(row.min_completion_count ?? MIN_COMPLETION_COUNT),
    mode: row.mode ?? 'open_all',
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    burnWindowGranted: Boolean(row.burn_window_granted),
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
        c.mode,
        c.required_participants,
        c.locked_at,
        c.completed_at,
        c.expires_at,
        c.burn_window_granted,
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
      FROM damned_pool_circles c
      LEFT JOIN damned_pool_participants p ON p.circle_id = c.id
      LEFT JOIN profiles pr ON LOWER(pr.wallet_address) = LOWER(p.wallet)
      ${whereClause}
      GROUP BY c.id, c.creator_wallet, c.creator_inscription_id, c.status, c.mode, c.required_participants, c.locked_at, c.completed_at, c.expires_at, c.burn_window_granted, c.created_at, c.updated_at
      ORDER BY c.created_at DESC
      ${limitClause}
    `,
    values,
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!DAMNED_POOL_MODE_ENABLED) {
      return NextResponse.json(
        { success: false, error: 'Damned pool circles are currently disabled.' },
        { status: 503 },
      )
    }
    const pool = getPool()
    await ensureDamnedPoolInfrastructure(pool)
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

    if (walletParam) {
      const createdQuery = buildCircleSelect('WHERE LOWER(c.creator_wallet) = LOWER($1)', 'LIMIT 50', [walletParam])
      const createdRes = await pool.query(createdQuery)
      createdSummons = createdRes.rows.map(mapCircleRow)

      const joinedQuery = buildCircleSelect(
        `WHERE c.id IN (
            SELECT circle_id
            FROM damned_pool_participants
            WHERE LOWER(wallet) = LOWER($1)
          )`,
        'LIMIT 50',
        [walletParam],
      )
      const joinedRes = await pool.query(joinedQuery)
      joinedSummons = joinedRes.rows.map(mapCircleRow)
    }

    return NextResponse.json(
      {
      success: true,
      summons,
      createdSummons,
      joinedSummons,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3, s-maxage=3, stale-while-revalidate=1',
        },
      },
    )
  } catch (error) {
    console.error('[damned-pool/circles][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch damned pool circles.' },
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
  if (!DAMNED_POOL_MODE_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Damned pool circles are currently disabled.' },
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

    await ensureDamnedPoolInfrastructure(pool)

    // Determine mode and thresholds early for validations and expiry
    const circleModeRaw = (body?.circleMode ?? 'open_all').toString().trim().toLowerCase()
    const circleMode = circleModeRaw === 'bonus_credits' ? 'bonus_credits' : 'open_all'
    const requiredParticipants =
      circleMode === 'bonus_credits' ? REQUIRED_PARTICIPANTS_BONUS : REQUIRED_PARTICIPANTS
    const minCompletion = circleMode === 'bonus_credits' ? MIN_COMPLETION_COUNT_BONUS : MIN_COMPLETION_COUNT
    const expiresAt = new Date(
      Date.now() + (circleMode === 'bonus_credits' ? CIRCLE_DURATION_BONUS_MS : CIRCLE_DURATION_MAIN_MS),
    )

    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')

    // Use advisory lock to prevent race conditions
      const lockKey = await client.query(
      `SELECT hashtext($1)::bigint AS lock_key`,
      [creatorWallet.toLowerCase()],
    )
    const lockKeyValue = Number(lockKey.rows[0]?.lock_key ?? 0)

      await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKeyValue])

      // Check if this user already has an active damned pool in this mode
      await client.query(
        `
          SELECT id FROM damned_pool_circles
          WHERE LOWER(creator_wallet) = LOWER($1)
            AND status IN ('open', 'filling', 'ready')
            AND mode = $2
          FOR UPDATE
        `,
        [creatorWallet, circleMode],
      )
      const userActiveCountRes = await client.query(
        `
          SELECT COUNT(*)::int AS active_count
          FROM damned_pool_circles
          WHERE LOWER(creator_wallet) = LOWER($1)
            AND status IN ('open', 'filling', 'ready')
            AND mode = $2
        `,
        [creatorWallet, circleMode],
      )
      const userActiveCount = Number(userActiveCountRes.rows[0]?.active_count ?? 0)

      if (userActiveCount >= MAX_ACTIVE_CIRCLES_PER_USER) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: `Maximum of ${MAX_ACTIVE_CIRCLES_PER_USER} active damned pool allowed per user.` },
          { status: 409 },
        )
      }

    // Check if the abyss burn window is currently active (abyss is "opened")
      const abyssWindowRes = await client.query(
      `
        SELECT COUNT(*)::int AS active_count
        FROM damned_pool_burn_windows
        WHERE active = TRUE
          AND expires_at > NOW()
      `,
    )
    const abyssWindowActiveCount = Number(abyssWindowRes.rows[0]?.active_count ?? 0)

    if (abyssWindowActiveCount > 0) {
        await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Cannot initiate a damned pool circle while the abyss is open. Please wait for the abyss burn window to expire.' },
        { status: 409 },
      )
    }

      // Check if there is already an active damned pool globally (any mode)
      await client.query(
        `
          SELECT id FROM damned_pool_circles
          WHERE status IN ('open', 'filling', 'ready')
          FOR UPDATE
        `,
        
      )
      const globalActiveCountRes = await client.query(
        `
          SELECT COUNT(*)::int AS active_count
          FROM damned_pool_circles
          WHERE status IN ('open', 'filling', 'ready')
        `,
        
      )
      const globalActiveCount = Number(globalActiveCountRes.rows[0]?.active_count ?? 0)

      if (globalActiveCount >= MAX_ACTIVE_CIRCLES_GLOBAL) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: `Maximum of ${MAX_ACTIVE_CIRCLES_GLOBAL} active damned pool allowed globally.` },
          { status: 409 },
        )
      }

      const conflictRes = await client.query(
        `
          SELECT c.id
          FROM damned_pool_circles c
          JOIN damned_pool_participants p ON p.circle_id = c.id
          WHERE p.inscription_id = $1
            AND c.status IN ('open', 'filling', 'ready')
          LIMIT 1
        `,
        [creatorInscriptionId],
      )

      if (conflictRes.rows.length > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'This ordinal is already pledged to an active damned pool.' },
          { status: 409 },
        )
    }

      const circleResult = await client.query(
      `
        INSERT INTO damned_pool_circles (
          creator_wallet,
          creator_inscription_id,
          status,
          required_participants,
          min_completion_count,
          mode,
          expires_at
        )
        VALUES ($1, $2, 'open', $3, $4, $5, $6)
        RETURNING *
      `,
      [creatorWallet, creatorInscriptionId, requiredParticipants, minCompletion, circleMode, expiresAt.toISOString()],
    )

    const circle = circleResult.rows[0]

      await client.query(
      `
        INSERT INTO damned_pool_participants (circle_id, wallet, inscription_id, inscription_image, role)
        VALUES ($1, $2, $3, $4, 'creator')
      `,
      [circle.id, creatorWallet, creatorInscriptionId, creatorInscriptionImage],
    )

      await client.query(
      `
        UPDATE damned_pool_circles
        SET status = 'filling',
            updated_at = NOW()
        WHERE id = $1
      `,
      [circle.id],
    )

      await client.query('COMMIT')

    const refreshed = await pool.query(
      buildCircleSelect('WHERE c.id = $1', '', [circle.id]),
    )

    return NextResponse.json({
      success: true,
      summon: mapCircleRow(refreshed.rows[0]),
    })
  } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {})
      }
    console.error('[damned-pool/circles][POST]', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create damned pool circle.' },
        { status: 500 },
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  } catch (error) {
    console.error('[damned-pool/circles][POST] outer error', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create damned pool circle.' },
      { status: 500 },
    )
  }
}

