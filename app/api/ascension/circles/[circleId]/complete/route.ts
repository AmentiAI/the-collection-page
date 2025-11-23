import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient } from 'pg'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COMPLETION_WINDOW_MS = 2 * 60 * 1000
const POWDER_REWARD_HOST = 8 // +2 from original 6
const POWDER_REWARD_PARTICIPANT = 7 // +2 from original 5
const MIN_COMPLETION_COUNT = 9 // Only need 9 out of 10 to complete
// Set to false to disable powder circles at the API level
const POWDER_MODE_ENABLED = process.env.NEXT_PUBLIC_POWDER_MODE_ENABLED !== 'false'

async function ensurePowderInfrastructure(pool: ReturnType<typeof getPool>) {
  // Skip if already initialized to avoid redundant DDL operations
  if (isTableInitialized('ascension_circles')) {
    return
  }

  // DDL operations commented out for performance - tables must exist in production
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS summoning_powder_circles (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     creator_wallet TEXT NOT NULL,
  //     creator_inscription_id TEXT NOT NULL,
  //     status TEXT NOT NULL DEFAULT 'open',
  //     required_participants INTEGER NOT NULL DEFAULT 10,
  //     locked_at TIMESTAMPTZ,
  //     completed_at TIMESTAMPTZ,
  //     expires_at TIMESTAMPTZ,
  //     reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
  //     created_at TIMESTAMPTZ DEFAULT NOW(),
  //     updated_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS summoning_powder_participants (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     circle_id UUID NOT NULL REFERENCES summoning_powder_circles(id) ON DELETE CASCADE,
  //     wallet TEXT NOT NULL,
  //     inscription_id TEXT NOT NULL,
  //     inscription_image TEXT,
  //     role TEXT NOT NULL DEFAULT 'participant',
  //     joined_at TIMESTAMPTZ DEFAULT NOW(),
  //     completed BOOLEAN NOT NULL DEFAULT FALSE,
  //     completed_at TIMESTAMPTZ,
  //     UNIQUE(circle_id, wallet),
  //     UNIQUE(circle_id, inscription_id)
  //   )
  // `)
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS ascension_powder_events (
  //     wallet_address TEXT NOT NULL,
  //     event_key TEXT NOT NULL,
  //     granted_amount INTEGER NOT NULL,
  //     created_at TIMESTAMPTZ DEFAULT NOW(),
  //     PRIMARY KEY (wallet_address, event_key)
  //   )
  // `)
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS profiles (
  //     wallet_address TEXT PRIMARY KEY,
  //     ascension_powder INTEGER NOT NULL DEFAULT 0,
  //     created_at TIMESTAMPTZ DEFAULT NOW(),
  //     updated_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)
  // await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)

  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('ascension_circles')
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
      FROM summoning_powder_circles c
      LEFT JOIN summoning_powder_participants p ON p.circle_id = c.id
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
  client: PoolClient,
  isHost: boolean = false,
) {
  const eventKey = `powder_circle:${circleId}`
  const rewardAmount = isHost ? POWDER_REWARD_HOST : POWDER_REWARD_PARTICIPANT

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
    [wallet, eventKey, rewardAmount],
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
      [rewardAmount, wallet],
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { circleId: string } },
) {
  if (!POWDER_MODE_ENABLED) {
    return NextResponse.json(
      { success: false, error: 'Powder circles are currently disabled.' },
      { status: 503 },
    )
  }
  const { circleId } = params
  if (!circleId) {
    return NextResponse.json({ success: false, error: 'Missing circleId' }, { status: 400 })
  }

  const pool = getPool()
  try {
    await ensurePowderInfrastructure(pool)

    const body = await request.json().catch(() => ({}))
    const wallet = (body?.wallet ?? '').toString().trim()

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 })
    }

    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')

      // OPTIMIZED: Combine circle + participant query into one with JOIN
      const combinedRes = await client.query(
        `
          SELECT 
            c.*,
            p.id as participant_id,
            p.wallet as participant_wallet,
            p.inscription_id as participant_inscription_id,
            p.role as participant_role,
            p.completed as participant_completed,
            p.completed_at as participant_completed_at
          FROM summoning_powder_circles c
          LEFT JOIN summoning_powder_participants p 
            ON p.circle_id = c.id AND LOWER(p.wallet) = LOWER($2)
          WHERE c.id = $1
          FOR UPDATE OF c, p
        `,
        [circleId, wallet],
      )

      if (combinedRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Circle not found' }, { status: 404 })
      }

      const row = combinedRes.rows[0]
      const circle = {
        id: row.id,
        creator_wallet: row.creator_wallet,
        creator_inscription_id: row.creator_inscription_id,
        status: row.status,
        required_participants: row.required_participants,
        locked_at: row.locked_at,
        completed_at: row.completed_at,
        expires_at: row.expires_at,
        reward_granted: row.reward_granted,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }

      if (circle.status === 'completed') {
        await client.query('ROLLBACK')
        // Build minimal response without re-fetching
        return NextResponse.json(
          { success: false, error: 'Circle already completed.', summon: { id: circle.id, status: 'completed' } },
          { status: 409 },
        )
      }

      if (circle.status !== 'ready') {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'This ascension circle cannot be completed.' },
          { status: 409 },
        )
      }

      if (!row.participant_id) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'You are not part of this ascension circle.' },
          { status: 403 },
        )
      }

      const participant = {
        id: row.participant_id,
        wallet: row.participant_wallet,
        inscription_id: row.participant_inscription_id,
        role: row.participant_role,
        completed: row.participant_completed,
        completed_at: row.participant_completed_at,
      }

      if (participant.completed) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: true,
          message: 'Ascension already recorded for this wallet.',
          profilePowder: undefined,
          summon: { id: circle.id, status: circle.status },
        })
      }

      const now = new Date()
      const expiresAt = circle.expires_at ? new Date(circle.expires_at) : null
      const lockedAt = circle.locked_at ? new Date(circle.locked_at) : null

      if (!expiresAt) {
        await client.query('ROLLBACK')
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
        await client.query('ROLLBACK')
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
        await client.query(
          `UPDATE summoning_powder_circles SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [circleId],
        )
        await client.query('COMMIT')
        return NextResponse.json(
          { success: false, error: 'Ascension circle has expired.' },
          { status: 410 },
        )
      }

      await client.query(
        `
          UPDATE summoning_powder_participants
          SET completed = TRUE,
              completed_at = NOW()
          WHERE id = $1
        `,
        [participant.id],
      )

      const participantsRes = await client.query(
        `SELECT wallet, completed FROM summoning_powder_participants WHERE circle_id = $1 FOR UPDATE`,
        [circleId],
      )
      const participants = participantsRes.rows
      const completedCount = participants.filter((row) => row.completed).length
      // Require 9 out of 10 participants to mark complete
      const allCompleted = participants.length >= circle.required_participants && completedCount >= MIN_COMPLETION_COUNT

      let rewardGranted = Boolean(circle.reward_granted)

      if (allCompleted && !rewardGranted) {
        await client.query(
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

        const creatorWallet = circle.creator_wallet?.toLowerCase() || ''
        for (const row of participants) {
          const isHost = row.wallet?.toLowerCase() === creatorWallet
          await grantAscensionPowder(row.wallet, circleId, client, isHost)
        }
      }

      // OPTIMIZED: Fetch profile powder BEFORE commit to reduce queries
      const profileRes = await client.query(
        `SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1)`,
        [wallet],
      )
      const profilePowder = Number(profileRes.rows[0]?.ascension_powder ?? 0)

      await client.query('COMMIT')

      // OPTIMIZED: Build response from data we already have instead of expensive re-fetch
      // We have: circle object, participants array from line 313
      const summonResponse = {
        id: circle.id,
        creator_wallet: circle.creator_wallet,
        creator_inscription_id: circle.creator_inscription_id,
        status: allCompleted && rewardGranted ? 'completed' : circle.status,
        required_participants: circle.required_participants,
        locked_at: circle.locked_at,
        completed_at: allCompleted && rewardGranted ? new Date().toISOString() : circle.completed_at,
        expires_at: circle.expires_at,
        reward_granted: rewardGranted,
        created_at: circle.created_at,
        updated_at: new Date().toISOString(),
        participants: participants.map((p) => ({
          wallet: p.wallet,
          completed: p.wallet?.toLowerCase() === wallet.toLowerCase() ? true : p.completed,
        })),
      }

      return NextResponse.json({
        success: true,
        message: rewardGranted
          ? 'Ascension circle complete. Powder surges through every participant.'
          : 'Ascension attested. Await the remaining allies.',
        profilePowder,
        summon: summonResponse,
      })
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {})
      }
      console.error('[ascension/circles/complete][POST]', error)
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to complete ascension circle.' },
        { status: 500 },
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  } catch (error) {
    console.error('[ascension/circles/complete] Infrastructure error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to initialize infrastructure.' },
      { status: 500 },
    )
  }
}
