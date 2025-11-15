import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COMPLETION_WINDOW_MS = 2 * 60 * 1000
const POWDER_REWARD = 2

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

async function grantAscensionPowder(
  wallet: string,
  circleId: string,
  client: ReturnType<typeof getPool>,
) {
  const eventKey = `powder_circle:${circleId}`

  await client.query(
    `
      INSERT INTO profiles (wallet_address, ascension_powder, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (wallet_address) DO NOTHING
    `,
    [wallet],
  )

  const claimRes = await client.query(
    `
      INSERT INTO ascension_powder_events (wallet_address, event_key, granted_amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (wallet_address, event_key) DO NOTHING
      RETURNING granted_amount
    `,
    [wallet, eventKey, POWDER_REWARD],
  )

  const insertedRows = claimRes?.rowCount ?? 0

  if (insertedRows > 0) {
    await client.query(
      `
        UPDATE profiles
        SET ascension_powder = COALESCE(ascension_powder, 0) + $1,
            updated_at = NOW()
        WHERE LOWER(wallet_address) = LOWER($2)
      `,
      [POWDER_REWARD, wallet],
    )
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

    if (circle.status !== 'ready') {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'This ascension circle cannot be completed.' },
        { status: 409 },
      )
    }

    const participantRes = await pool.query(
      `
        SELECT *
        FROM summoning_powder_participants
        WHERE circle_id = $1 AND LOWER(wallet) = LOWER($2)
        FOR UPDATE
      `,
      [circleId, wallet],
    )

    if (participantRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'You are not part of this ascension circle.' },
        { status: 403 },
      )
    }

    const participant = participantRes.rows[0]
    if (participant.completed) {
      await pool.query('ROLLBACK')
      const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))
      return NextResponse.json({
        success: true,
        message: 'Ascension already recorded for this wallet.',
        profilePowder: undefined,
        summon: mapCircleRow(refreshed.rows[0]),
      })
    }

    const now = new Date()
    const expiresAt = circle.expires_at ? new Date(circle.expires_at) : null
    const lockedAt = circle.locked_at ? new Date(circle.locked_at) : null

    if (!expiresAt) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Ascension circle has not entered completion phase yet.' },
        { status: 409 },
      )
    }

    const finalWindowStart = new Date(expiresAt.getTime() - COMPLETION_WINDOW_MS)
    const timeUntilExpiry = expiresAt.getTime() - now.getTime()
    const timeUntilWindow = finalWindowStart.getTime() - now.getTime()
    
    // Debug logging
    console.log('[ascension/circles/complete]', {
      now: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      finalWindowStart: finalWindowStart.toISOString(),
      timeUntilExpiry: Math.floor(timeUntilExpiry / 1000),
      timeUntilWindow: Math.floor(timeUntilWindow / 1000),
      completionWindowMs: COMPLETION_WINDOW_MS,
    })
    
    if (now < finalWindowStart) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { 
          success: false, 
          error: `Final ritual window has not opened. Window opens in ${Math.ceil(timeUntilWindow / 1000)} seconds.`,
          timeUntilWindow: Math.ceil(timeUntilWindow / 1000),
        },
        { status: 409 },
      )
    }

    if (now > expiresAt) {
      await pool.query(
        `UPDATE summoning_powder_circles SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [circleId],
      )
      await pool.query('COMMIT')
      return NextResponse.json(
        { success: false, error: 'Ascension circle has expired.' },
        { status: 410 },
      )
    }

    await pool.query(
      `
        UPDATE summoning_powder_participants
        SET completed = TRUE,
            completed_at = NOW()
        WHERE id = $1
      `,
      [participant.id],
    )

    const participantsRes = await pool.query(
      `SELECT wallet, completed FROM summoning_powder_participants WHERE circle_id = $1 FOR UPDATE`,
      [circleId],
    )
    const participants = participantsRes.rows
    const allCompleted = participants.length >= circle.required_participants && participants.every((row) => row.completed)

    let rewardGranted = Boolean(circle.reward_granted)

    if (allCompleted && !rewardGranted) {
      await pool.query(
        `
          UPDATE summoning_powder_circles
          SET status = 'completed',
              completed_at = NOW(),
              reward_granted = TRUE,
              updated_at = NOW()
          WHERE id = $1
        `,
        [circleId],
      )
      rewardGranted = true

      for (const row of participants) {
        await grantAscensionPowder(row.wallet, circleId, pool)
      }
    }

    await pool.query('COMMIT')

    const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))
    const profileRes = await pool.query(
      `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
      [wallet],
    )
    const profilePowder = Number(profileRes.rows[0]?.ascension_powder ?? 0)

    return NextResponse.json({
      success: true,
      message: rewardGranted
        ? 'Ascension circle complete. Powder surges through every participant.'
        : 'Ascension attested. Await the remaining allies.',
      profilePowder,
      summon: mapCircleRow(refreshed.rows[0]),
    })
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {})
    console.error('[ascension/circles/complete][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to complete ascension circle.' },
      { status: 500 },
    )
  }
}
