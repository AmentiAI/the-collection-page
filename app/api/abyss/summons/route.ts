import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureSummonInfrastructure(pool: Pool) {
  // Skip if already initialized in this process to avoid slow DDL operations
  if (isTableInitialized('abyss_summons')) {
    return
  }
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_burns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inscription_id TEXT UNIQUE NOT NULL,
      tx_id TEXT UNIQUE NOT NULL,
      ordinal_wallet TEXT NOT NULL,
      payment_wallet TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'abyss',
      summon_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ
    )
  `)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'abyss'`)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS summon_id UUID`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_status ON abyss_burns(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_tx_id ON abyss_burns(tx_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_source ON abyss_burns(source)`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_summons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_wallet TEXT NOT NULL,
      creator_inscription_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      required_participants INTEGER NOT NULL DEFAULT 8,
      locked_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      bonus_granted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summons_status ON abyss_summons(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summons_creator ON abyss_summons((LOWER(creator_wallet)))`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_summon_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      summon_id UUID NOT NULL REFERENCES abyss_summons(id) ON DELETE CASCADE,
      wallet TEXT NOT NULL,
      inscription_id TEXT NOT NULL,
      inscription_image TEXT,
      role TEXT NOT NULL DEFAULT 'participant',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(summon_id, wallet),
      UNIQUE(summon_id, inscription_id)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_summon ON abyss_summon_participants(summon_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_wallet ON abyss_summon_participants((LOWER(wallet)))`)
  await pool.query(`ALTER TABLE abyss_summon_participants ADD COLUMN IF NOT EXISTS inscription_image TEXT`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_bonus_allowances (
      wallet TEXT PRIMARY KEY,
      available INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  
  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('abyss_summons')
}

function mapSummonRow(row: any) {
  return {
    id: row.id,
    creatorWallet: row.creator_wallet,
    creatorInscriptionId: row.creator_inscription_id,
    status: row.status,
    requiredParticipants: Number(row.required_participants ?? 0),
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    bonusGranted: Boolean(row.bonus_granted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants: Array.isArray(row.participants) ? row.participants : [],
  }
}

async function expireOverdueSummons(pool: Pool) {
  await pool.query(`
    UPDATE abyss_summons
    SET status = 'expired',
        updated_at = NOW()
    WHERE status IN ('open', 'filling', 'ready')
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
  `)
}

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureSummonInfrastructure(pool)
    await expireOverdueSummons(pool)

    const searchParams = request.nextUrl.searchParams
    const walletParam = searchParams.get('wallet')?.trim()
    const statusFilter = searchParams.get('status')?.trim()
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '25', 10)
    const limit = Number.isNaN(limitParam) ? 25 : Math.min(Math.max(limitParam, 1), 200)

    const values: unknown[] = [limit]
    const filters: string[] = []
    if (statusFilter) {
      values.push(statusFilter)
      filters.push(`s.status = $${values.length}`)
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

    const baseResult = await pool.query(
      `
        SELECT
          s.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', sp.id,
                'wallet', sp.wallet,
                'inscriptionId', sp.inscription_id,
                'image', sp.inscription_image,
                'role', sp.role,
                'joinedAt', sp.joined_at,
                'username', pr.username,
                'avatarUrl', pr.avatar_url
              )
            ) FILTER (WHERE sp.id IS NOT NULL),
            '[]'::json
          ) AS participants
        FROM abyss_summons s
        LEFT JOIN abyss_summon_participants sp ON sp.summon_id = s.id
        LEFT JOIN profiles pr ON LOWER(pr.wallet_address) = LOWER(sp.wallet)
        ${whereClause}
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT $1
      `,
      values,
    )

    const summons = baseResult.rows.map(mapSummonRow)

    let createdSummons: any[] = []
    let joinedSummons: any[] = []
    let bonusAllowance: number | null = null

    if (walletParam) {
      const createdRes = await pool.query(
        `
          SELECT
            s.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', sp.id,
                  'wallet', sp.wallet,
                  'inscriptionId', sp.inscription_id,
                  'image', sp.inscription_image,
                  'role', sp.role,
                  'joinedAt', sp.joined_at,
                  'username', pr.username,
                  'avatarUrl', pr.avatar_url
                )
              ) FILTER (WHERE sp.id IS NOT NULL),
              '[]'::json
            ) AS participants
          FROM abyss_summons s
          LEFT JOIN abyss_summon_participants sp ON sp.summon_id = s.id
          LEFT JOIN profiles pr ON LOWER(pr.wallet_address) = LOWER(sp.wallet)
          WHERE LOWER(s.creator_wallet) = LOWER($1)
          GROUP BY s.id
          ORDER BY s.created_at DESC
          LIMIT 25
        `,
        [walletParam],
      )
      createdSummons = createdRes.rows.map(mapSummonRow)

      const joinedRes = await pool.query(
        `
          SELECT
            s.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', sp.id,
                  'wallet', sp.wallet,
                  'inscriptionId', sp.inscription_id,
                  'image', sp.inscription_image,
                  'role', sp.role,
                  'joinedAt', sp.joined_at,
                  'username', pr.username,
                  'avatarUrl', pr.avatar_url
                )
              ) FILTER (WHERE sp.id IS NOT NULL),
              '[]'::json
            ) AS participants
          FROM abyss_summons s
          INNER JOIN abyss_summon_participants target
            ON target.summon_id = s.id AND LOWER(target.wallet) = LOWER($1)
          LEFT JOIN abyss_summon_participants sp ON sp.summon_id = s.id
          LEFT JOIN profiles pr ON LOWER(pr.wallet_address) = LOWER(sp.wallet)
          GROUP BY s.id
          ORDER BY s.created_at DESC
          LIMIT 25
        `,
        [walletParam],
      )
      joinedSummons = joinedRes.rows.map(mapSummonRow)

      const allowanceRes = await pool.query(
        `SELECT available FROM abyss_bonus_allowances WHERE LOWER(wallet) = LOWER($1)`,
        [walletParam],
      )
      bonusAllowance = allowanceRes.rows[0]?.available ?? 0
    }

    return NextResponse.json(
      {
        success: true,
        summons,
        createdSummons,
        joinedSummons,
        bonusAllowance,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    )
  } catch (error) {
    console.error('[abyss/summons][GET]', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load summons',
      },
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
  await ensureSummonInfrastructure(pool)

  const body = await request.json().catch(() => ({}))
  const creatorWallet = (body?.creatorWallet ?? '').toString().trim()
  const creatorInscriptionId = (body?.inscriptionId ?? '').toString().trim()
  const creatorInscriptionImage =
    typeof body?.inscriptionImage === 'string' && body.inscriptionImage.trim().length > 0
      ? body.inscriptionImage.trim()
      : null
  const expiresAtRaw = body?.expiresAt

  if (!creatorWallet || !creatorInscriptionId) {
    return NextResponse.json(
      { success: false, error: 'creatorWallet and inscriptionId are required' },
      { status: 400 },
    )
  }

  const expiresAt =
    typeof expiresAtRaw === 'string' || expiresAtRaw instanceof String
      ? new Date(expiresAtRaw as string)
      : new Date(Date.now() + 10 * 60 * 1000)

  if (Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ success: false, error: 'Invalid expiresAt value' }, { status: 400 })
  }

  const normalizedWallet = creatorWallet.toLowerCase()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existing = await client.query(
      `
        SELECT id
        FROM abyss_summons
        WHERE LOWER(creator_wallet) = $1
          AND status IN ('open', 'filling', 'ready')
        FOR UPDATE
      `,
      [normalizedWallet],
    )

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'You already have an active summoning table.' },
        { status: 409 },
      )
    }

    const conflictingInscription = await client.query(
      `
        SELECT s.id
        FROM abyss_summon_participants p
        JOIN abyss_summons s ON s.id = p.summon_id
        WHERE p.inscription_id = $1
          AND s.status IN ('open', 'filling', 'ready')
        LIMIT 1
      `,
      [creatorInscriptionId],
    )

    if (conflictingInscription.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This ordinal is already pledged to another active circle.' },
        { status: 409 },
      )
    }

    const summonResult = await client.query(
      `
        INSERT INTO abyss_summons (creator_wallet, creator_inscription_id, status, required_participants, expires_at)
        VALUES ($1, $2, 'open', 8, $3)
        RETURNING *
      `,
      [creatorWallet, creatorInscriptionId, expiresAt.toISOString()],
    )

    const summon = summonResult.rows[0]

    await client.query(
      `
        INSERT INTO abyss_summon_participants (summon_id, wallet, inscription_id, inscription_image, role)
        VALUES ($1, $2, $3, $4, 'creator')
      `,
      [summon.id, creatorWallet, creatorInscriptionId, creatorInscriptionImage],
    )

    await client.query(
      `
        UPDATE abyss_summons
        SET status = 'filling',
            updated_at = NOW()
        WHERE id = $1
      `,
      [summon.id],
    )

    await client.query('COMMIT')

    const refreshed = await pool.query(
      `
        SELECT
          s.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', sp.id,
                'wallet', sp.wallet,
                'inscriptionId', sp.inscription_id,
                'image', sp.inscription_image,
                'role', sp.role,
                'joinedAt', sp.joined_at
              )
            ) FILTER (WHERE sp.id IS NOT NULL),
            '[]'::json
          ) AS participants
        FROM abyss_summons s
        LEFT JOIN abyss_summon_participants sp ON sp.summon_id = s.id
        WHERE s.id = $1
        GROUP BY s.id
      `,
      [summon.id],
    )

    return NextResponse.json({
      success: true,
      summon: mapSummonRow(refreshed.rows[0]),
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[abyss/summons][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create summon' },
      { status: 500 },
    )
  } finally {
    client.release()
  }
}

