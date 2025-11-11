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

  const body = await request.json().catch(() => ({}))
  const wallet = (body?.wallet ?? '').toString().trim()

  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 })
  }

  const pool = getPool()
  await ensureSummonTables(pool)

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

    if (summon.status !== 'ready') {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Summon is not ready to complete.' },
        { status: 409 },
      )
    }

    if (summon.creator_wallet.toLowerCase() !== wallet.toLowerCase()) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Only the creator can complete this summon.' },
        { status: 403 },
      )
    }

    const participantsRes = await pool.query(
      `
        SELECT wallet, inscription_id
        FROM abyss_summon_participants
        WHERE summon_id = $1
        ORDER BY joined_at
      `,
      [summonId],
    )
    const participants = participantsRes.rows ?? []

    if (participants.length < summon.required_participants) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Summon does not have enough participants.' },
        { status: 409 },
      )
    }

    await pool.query(
      `
        UPDATE abyss_summons
        SET status = 'completed',
            completed_at = NOW(),
            bonus_granted = TRUE,
            updated_at = NOW()
        WHERE id = $1
      `,
      [summonId],
    )

    await pool.query(
      `
        INSERT INTO abyss_bonus_allowances (wallet, available, updated_at)
        VALUES ($1, 1, NOW())
        ON CONFLICT (wallet)
        DO UPDATE SET
          available = abyss_bonus_allowances.available + 1,
          updated_at = EXCLUDED.updated_at
      `,
      [wallet],
    )

    const allowanceRes = await pool.query(
      `SELECT available FROM abyss_bonus_allowances WHERE wallet = $1`,
      [wallet],
    )
    const bonusAllowance = allowanceRes.rows[0]?.available ?? 0

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
      bonusAllowance,
    })
  } catch (error) {
    await pool.query('ROLLBACK')
    console.error('[abyss/summons/complete][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to complete summon' },
      { status: 500 },
    )
  }
}

