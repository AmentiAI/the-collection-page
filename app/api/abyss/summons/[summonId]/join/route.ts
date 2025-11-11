import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureSummonTables(pool: ReturnType<typeof getPool>) {
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_status ON abyss_burns(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_tx_id ON abyss_burns(tx_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_source ON abyss_burns(source)`)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'abyss'`)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS summon_id UUID`)

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
  await pool.query(`ALTER TABLE abyss_summon_participants ADD COLUMN IF NOT EXISTS inscription_image TEXT`)
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

export async function POST(
  request: NextRequest,
  { params }: { params: { summonId: string } },
) {
  const { summonId } = params
  if (!summonId) {
    return NextResponse.json({ success: false, error: 'Missing summonId' }, { status: 400 })
  }

  const pool = getPool()
  await ensureSummonTables(pool)

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

    const summonRes = await pool.query(
      `SELECT * FROM abyss_summons WHERE id = $1 FOR UPDATE`,
      [summonId],
    )
    if (summonRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Summon not found' }, { status: 404 })
    }

    const summon = summonRes.rows[0]

    if (summon.expires_at && new Date(summon.expires_at) < new Date()) {
      await pool.query(
        `
          UPDATE abyss_summons
          SET status = 'expired', updated_at = NOW()
          WHERE id = $1
        `,
        [summonId],
      )
      await pool.query('COMMIT')
      return NextResponse.json(
        { success: false, error: 'This summoning table has expired.' },
        { status: 410 },
      )
    }

    if (!['open', 'filling'].includes(summon.status)) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This summoning table is no longer accepting participants.' },
        { status: 409 },
      )
    }

    const existingParticipant = await pool.query(
      `
        SELECT 1
        FROM abyss_summon_participants
        WHERE summon_id = $1 AND LOWER(wallet) = LOWER($2)
      `,
      [summonId, wallet],
    )
    if (existingParticipant.rows.length > 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'You have already joined this summoning table.' },
        { status: 409 },
      )
    }

    const participantCountRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM abyss_summon_participants WHERE summon_id = $1`,
      [summonId],
    )
    const participantCount = participantCountRes.rows[0]?.count ?? 0
    if (participantCount >= summon.required_participants) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This summoning table is already full.' },
        { status: 409 },
      )
    }

    await pool.query(
      `
        INSERT INTO abyss_summon_participants (summon_id, wallet, inscription_id, inscription_image, role)
        VALUES ($1, $2, $3, $4, 'participant')
        ON CONFLICT (summon_id, wallet) DO UPDATE
        SET inscription_id = EXCLUDED.inscription_id,
            inscription_image = COALESCE(EXCLUDED.inscription_image, abyss_summon_participants.inscription_image),
            joined_at = NOW()
      `,
      [summonId, wallet, inscriptionId, inscriptionImage],
    )

    const updatedCountRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM abyss_summon_participants WHERE summon_id = $1`,
      [summonId],
    )
    const updatedCount = updatedCountRes.rows[0]?.count ?? 0

    if (updatedCount >= summon.required_participants) {
      await pool.query(
        `
          UPDATE abyss_summons
          SET status = 'ready',
              locked_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [summonId],
      )
    } else if (summon.status !== 'filling') {
      await pool.query(
        `
          UPDATE abyss_summons
          SET status = 'filling',
              updated_at = NOW()
          WHERE id = $1
        `,
        [summonId],
      )
    }

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
      [summonId],
    )

    return NextResponse.json({
      success: true,
      summon: mapSummonRow(refreshed.rows[0]),
    })
  } catch (error) {
    await pool.query('ROLLBACK')
    console.error('[abyss/summons/join][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to join summon' },
      { status: 500 },
    )
  }
}

