import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensurePowderInfrastructure(pool: ReturnType<typeof getPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS summoning_powder_circles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_wallet TEXT NOT NULL,
      creator_inscription_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      required_participants INTEGER NOT NULL DEFAULT 10,
      locked_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
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
              'completedAt', p.completed_at
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS participants
      FROM summoning_powder_circles c
      LEFT JOIN summoning_powder_participants p ON p.circle_id = c.id
      ${whereClause}
      GROUP BY c.id
    `,
    values,
  }
}

function mapCircleRow(row: any) {
  return {
    id: row.id,
    creatorWallet: row.creator_wallet,
    creatorInscriptionId: row.creator_inscription_id,
    status: row.status,
    requiredParticipants: Number(row.required_participants ?? 10),
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    bonusGranted: Boolean(row.reward_granted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participants: Array.isArray(row.participants) ? row.participants : [],
  }
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
  await ensurePowderInfrastructure(pool)

  const body = await request.json().catch(() => ({}))
  const wallet = (body?.wallet ?? '').toString().trim()

  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 })
  }

  try {
    await pool.query('BEGIN')

    const circleRes = await pool.query('SELECT * FROM summoning_powder_circles WHERE id = $1 FOR UPDATE', [circleId])
    if (circleRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Circle not found' }, { status: 404 })
    }

    const circle = circleRes.rows[0]

    if (circle.creator_wallet.toLowerCase() !== wallet.toLowerCase()) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Only the creator can dismiss this ascension circle.' },
        { status: 403 },
      )
    }

    if (['completed', 'expired'].includes(circle.status)) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This ascension circle can no longer be dismissed.' },
        { status: 409 },
      )
    }

    await pool.query(
      `
        UPDATE summoning_powder_circles
        SET status = 'dismissed',
            updated_at = NOW()
        WHERE id = $1
      `,
      [circleId],
    )

    await pool.query('COMMIT')

    const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))

    return NextResponse.json({
      success: true,
      summon: mapCircleRow(refreshed.rows[0]),
    })
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {})
    console.error('[ascension/circles/dismiss][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to dismiss ascension circle.' },
      { status: 500 },
    )
  }
}
