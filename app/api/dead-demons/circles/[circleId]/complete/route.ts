import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COMPLETION_WINDOW_MS = 2 * 60 * 1000 // Last 2 minutes
const REQUIRED_COMPLETIONS = 10 // All 10 must complete
const POWDER_REWARD_HOST = 13
const POWDER_REWARD_PARTICIPANT = 10

async function ensureDeadDemonsInfrastructure(pool: ReturnType<typeof getPool>) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dead_demons_circles (
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      wallet_address TEXT PRIMARY KEY,
      ascension_powder INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ascension_powder_events (
      wallet_address TEXT NOT NULL,
      event_key TEXT NOT NULL,
      granted_amount INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (wallet_address, event_key)
    )
  `)
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
    `,
    values,
  }
}

async function grantAscensionPowder(
  wallet: string,
  circleId: string,
  client: ReturnType<typeof getPool>,
  isHost: boolean = false,
) {
  const eventKey = `dead_demons_circle:${circleId}`
  const rewardAmount = isHost ? POWDER_REWARD_HOST : POWDER_REWARD_PARTICIPANT

  // Ensure profile exists
  await client.query(
    `
      INSERT INTO profiles (wallet_address, ascension_powder, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (wallet_address) DO NOTHING
    `,
    [wallet],
  )

  // Record the event (one-time per circle per wallet)
  const claimRes = await client.query(
    `
      INSERT INTO ascension_powder_events (wallet_address, event_key, granted_amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (wallet_address, event_key) DO NOTHING
      RETURNING granted_amount
    `,
    [wallet, eventKey, rewardAmount],
  )

  // Grant the powder (only if event was inserted, meaning first time)
  const insertedRows = claimRes?.rowCount ?? 0
  if (insertedRows > 0) {
    await client.query(
      `
        UPDATE profiles
        SET ascension_powder = COALESCE(ascension_powder, 0) + $1,
            updated_at = NOW()
        WHERE LOWER(wallet_address) = LOWER($2)
      `,
      [rewardAmount, wallet],
    )
  }

  // Get updated balance
  const balanceRes = await client.query(
    `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
    [wallet],
  )
  return Number(balanceRes.rows[0]?.ascension_powder ?? 0)
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
  await ensureDeadDemonsInfrastructure(pool)

  const body = await request.json().catch(() => ({}))
  const wallet = (body?.wallet ?? '').toString().trim()

  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 })
  }

  try {
    await pool.query('BEGIN')

    const circleRes = await pool.query(
      buildCircleSelect('WHERE c.id = $1', [circleId]),
    )
    if (circleRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Dead Demons circle not found' }, { status: 404 })
    }

    const circle = mapCircleRow(circleRes.rows[0])

    if (circle.status === 'completed') {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: true, message: 'Dead Demons circle already completed.', summon: circle },
      )
    }

    if (circle.status !== 'ready') {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Dead Demons circle is not ready for completion.' },
        { status: 409 },
      )
    }

    const participantRes = await pool.query(
      `SELECT id, wallet, completed FROM dead_demons_participants WHERE circle_id = $1 AND LOWER(wallet) = LOWER($2) FOR UPDATE`,
      [circleId, wallet],
    )

    if (participantRes.rows.length === 0) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'You are not a participant in this Dead Demons circle.' },
        { status: 403 },
      )
    }

    const participant = participantRes.rows[0]
    if (participant.completed) {
      await pool.query('ROLLBACK')
      const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))
      return NextResponse.json({
        success: true,
        message: 'Completion already recorded for this wallet.',
        profilePowder: undefined,
        summon: mapCircleRow(refreshed.rows[0]),
      })
    }

    const now = new Date()
    const expiresAt = circle.expiresAt ? new Date(circle.expiresAt) : null

    if (!expiresAt) {
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Dead Demons circle has not entered completion phase yet.' },
        { status: 409 },
      )
    }

    const finalWindowStart = new Date(expiresAt.getTime() - COMPLETION_WINDOW_MS)
    const timeUntilExpiry = expiresAt.getTime() - now.getTime()
    const timeUntilWindow = finalWindowStart.getTime() - now.getTime()

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
      await pool.query('ROLLBACK')
      return NextResponse.json(
        { success: false, error: 'Dead Demons circle has expired.' },
        { status: 410 },
      )
    }

    // Mark participant as completed
    await pool.query(
      `
        UPDATE dead_demons_participants
        SET completed = TRUE,
            completed_at = NOW()
        WHERE id = $1
      `,
      [participant.id],
    )

    const participantsRes = await pool.query(
      `SELECT wallet, completed FROM dead_demons_participants WHERE circle_id = $1 FOR UPDATE`,
      [circleId],
    )
    const participants = participantsRes.rows
    const completedCount = participants.filter((row) => row.completed).length

    // All 10 must complete
    const allCompleted = participants.length >= REQUIRED_COMPLETIONS && completedCount >= REQUIRED_COMPLETIONS

    let rewardGranted = Boolean(circle.bonusGranted)

    if (allCompleted && !rewardGranted) {
      // Update circle status
      await pool.query(
        `
          UPDATE dead_demons_circles
          SET status = 'completed',
              completed_at = NOW(),
              reward_granted = TRUE,
              updated_at = NOW()
          WHERE id = $1
        `,
        [circleId],
      )

      // Grant ascension powder to all participants (host gets 13, others get 10)
      const creatorWallet = circle.creatorWallet?.toLowerCase() || ''
      for (const row of participants) {
        const participantWallet = (row.wallet ?? '').toString().trim()
        if (!participantWallet) continue

        const isHost = participantWallet.toLowerCase() === creatorWallet
        await grantAscensionPowder(participantWallet, circleId, pool, isHost)
      }

      rewardGranted = true
    }

    await pool.query('COMMIT')

    const refreshed = await pool.query(buildCircleSelect('WHERE c.id = $1', [circleId]))
    const updatedCircle = mapCircleRow(refreshed.rows[0])
    
    // Get updated powder balance for the current user
    let profilePowder: number | undefined = undefined
    if (allCompleted) {
      const balanceRes = await pool.query(
        `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
        [wallet],
      )
      profilePowder = Number(balanceRes.rows[0]?.ascension_powder ?? 0)
    }

    return NextResponse.json({
      success: true,
      message: allCompleted
        ? 'Dead Demons circle completed! All participants have been rewarded.'
        : `Completion recorded. ${completedCount}/${REQUIRED_COMPLETIONS} participants have completed.`,
      summon: updatedCircle,
      profilePowder,
      completedCount,
      requiredCompletions: REQUIRED_COMPLETIONS,
    })
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {})
    console.error('[dead-demons/circles/complete][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to complete Dead Demons circle.' },
      { status: 500 },
    )
  }
}

