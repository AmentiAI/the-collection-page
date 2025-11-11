import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureSummonInfrastructure(pool: Pool) {
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
      required_participants INTEGER NOT NULL DEFAULT 4,
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
      role TEXT NOT NULL DEFAULT 'participant',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(summon_id, wallet),
      UNIQUE(summon_id, inscription_id)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_summon ON abyss_summon_participants(summon_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_wallet ON abyss_summon_participants((LOWER(wallet)))`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_bonus_allowances (
      wallet TEXT PRIMARY KEY,
      available INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
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
                'role', sp.role,
                'joinedAt', sp.joined_at
              )
            ) FILTER (WHERE sp.id IS NOT NULL),
            '[]'::json
          ) AS participants
        FROM abyss_summons s
        LEFT JOIN abyss_summon_participants sp ON sp.summon_id = s.id
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
                  'role', sp.role,
                  'joinedAt', sp.joined_at
                )
              ) FILTER (WHERE sp.id IS NOT NULL),
              '[]'::json
            ) AS participants
          FROM abyss_summons s
          LEFT JOIN abyss_summon_participants sp ON sp.summon_id = s.id
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
                  'role', sp.role,
                  'joinedAt', sp.joined_at
                )
              ) FILTER (WHERE sp.id IS NOT NULL),
              '[]'::json
            ) AS participants
          FROM abyss_summons s
          INNER JOIN abyss_summon_participants target
            ON target.summon_id = s.id AND LOWER(target.wallet) = LOWER($1)
          LEFT JOIN abyss_summon_participants sp ON sp.summon_id = s.id
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

    return NextResponse.json({
      success: true,
      summons,
      createdSummons,
      joinedSummons,
      bonusAllowance,
    })
  } catch (error) {
    console.error('[abyss/summons][GET]', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load summons',
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const pool = getPool()
  await ensureSummonInfrastructure(pool)

  const body = await request.json().catch(() => ({}))
  const creatorWallet = (body?.creatorWallet ?? '').toString().trim()
  const creatorInscriptionId = (body?.inscriptionId ?? '').toString().trim()
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
      : new Date(Date.now() + 30 * 60 * 1000)

  if (Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ success: false, error: 'Invalid expiresAt value' }, { status: 400 })
  }

  const normalizedWallet = creatorWallet.toLowerCase()

  try {
    await pool.query('BEGIN')

    const existing = await pool.query(
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
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'You already have an active summoning table.' },
        { status: 409 },
      )
    }

    const summonResult = await pool.query(
      `
        INSERT INTO abyss_summons (creator_wallet, creator_inscription_id, status, required_participants, expires_at)
        VALUES ($1, $2, 'open', 4, $3)
        RETURNING *
      `,
      [creatorWallet, creatorInscriptionId, expiresAt.toISOString()],
    )

    const summon = summonResult.rows[0]

    await pool.query(
      `
        INSERT INTO abyss_summon_participants (summon_id, wallet, inscription_id, role)
        VALUES ($1, $2, $3, 'creator')
      `,
      [summon.id, creatorWallet, creatorInscriptionId],
    )

    await pool.query(
      `
        UPDATE abyss_summons
        SET status = 'filling',
            updated_at = NOW()
        WHERE id = $1
      `,
      [summon.id],
    )

    await pool.query('COMMIT')

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
    await pool.query('ROLLBACK')
    console.error('[abyss/summons][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create summon' },
      { status: 500 },
    )
  }
}

