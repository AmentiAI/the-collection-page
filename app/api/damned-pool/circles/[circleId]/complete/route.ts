import { NextRequest, NextResponse } from 'next/server'

import { getPool, isTableInitialized, markTableInitialized } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COMPLETION_WINDOW_MS = 3 * 60 * 1000 // Last 3 minutes
const MIN_COMPLETION_COUNT_DEFAULT = 36 // fallback for 40-man circles
const BURN_WINDOW_DURATION_40_MAN_MS = 60 * 60 * 1000 // 1 hour for 40-man circles
const BURN_WINDOW_DURATION_20_MAN_MS = 30 * 60 * 1000 // 30 minutes for 20-man circles
const POWDER_REWARD_HOST = 14
const POWDER_REWARD_PARTICIPANT = 10

async function ensureDamnedPoolInfrastructure(pool: ReturnType<typeof getPool>) {
  // Skip if already initialized to avoid redundant DDL operations
  if (isTableInitialized('damned_pool_circles')) {
    return
  }

  // DDL operations commented out for performance - tables must exist in production
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS profiles (
  //     wallet_address TEXT PRIMARY KEY,
  //     ascension_powder INTEGER NOT NULL DEFAULT 0,
  //     created_at TIMESTAMPTZ DEFAULT NOW(),
  //     updated_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)
  // await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0`)
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
  //   CREATE TABLE IF NOT EXISTS damned_pool_circles (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     creator_wallet TEXT NOT NULL,
  //     creator_inscription_id TEXT NOT NULL,
  //     status TEXT NOT NULL DEFAULT 'open',
  //     required_participants INTEGER NOT NULL DEFAULT 40,
  //     min_completion_count INTEGER NOT NULL DEFAULT 36,
  //     mode TEXT NOT NULL DEFAULT 'open_all',
  //     locked_at TIMESTAMPTZ,
  //     completed_at TIMESTAMPTZ,
  //     expires_at TIMESTAMPTZ,
  //     burn_window_granted BOOLEAN NOT NULL DEFAULT FALSE,
  //     created_at TIMESTAMPTZ DEFAULT NOW(),
  //     updated_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS damned_pool_participants (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     circle_id UUID NOT NULL REFERENCES damned_pool_circles(id) ON DELETE CASCADE,
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
  //   CREATE TABLE IF NOT EXISTS damned_pool_burn_windows (
  //     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //     circle_id UUID NOT NULL REFERENCES damned_pool_circles(id) ON DELETE CASCADE,
  //     granted_at TIMESTAMPTZ DEFAULT NOW(),
  //     expires_at TIMESTAMPTZ NOT NULL,
  //     active BOOLEAN NOT NULL DEFAULT TRUE,
  //     credits_only BOOLEAN NOT NULL DEFAULT FALSE
  //   )
  // `)
  // await pool.query(`ALTER TABLE damned_pool_circles ADD COLUMN IF NOT EXISTS min_completion_count INTEGER NOT NULL DEFAULT 36`)
  // await pool.query(`ALTER TABLE damned_pool_circles ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'open_all'`)
  // await pool.query(`ALTER TABLE damned_pool_burn_windows ADD COLUMN IF NOT EXISTS credits_only BOOLEAN NOT NULL DEFAULT FALSE`)
  // await pool.query(`CREATE INDEX IF NOT EXISTS idx_damned_pool_burn_windows_active ON damned_pool_burn_windows(active, expires_at)`)
  // await pool.query(`
  //   CREATE TABLE IF NOT EXISTS abyss_bonus_allowances (
  //     wallet TEXT PRIMARY KEY,
  //     available INTEGER NOT NULL DEFAULT 0,
  //     updated_at TIMESTAMPTZ DEFAULT NOW()
  //   )
  // `)

  // Mark as initialized to skip these slow DDL operations on subsequent requests
  markTableInitialized('damned_pool_circles')
}

function mapCircleRow(row: any) {
  return {
    id: row.id,
    creatorWallet: row.creator_wallet,
    creatorInscriptionId: row.creator_inscription_id,
    status: row.status,
    requiredParticipants: Number(row.required_participants ?? 40),
    minCompletionCount: Number(row.min_completion_count ?? MIN_COMPLETION_COUNT_DEFAULT),
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
      FROM damned_pool_circles c
      LEFT JOIN damned_pool_participants p ON p.circle_id = c.id
      LEFT JOIN profiles pr ON LOWER(pr.wallet_address) = LOWER(p.wallet)
      ${whereClause}
      GROUP BY c.id
    `,
    values,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { circleId: string } },
) {
  const pool = getPool()
  try {
    const body = await request.json().catch(() => ({}))
    const wallet = (body?.wallet ?? '').toString().trim()

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 })
    }

    const { circleId } = params
    if (!circleId) {
      return NextResponse.json({ success: false, error: 'Missing circleId' }, { status: 400 })
    }

    await ensureDamnedPoolInfrastructure(pool)

    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')

      // OPTIMIZED: Combine circle + participant query into one
      const combinedRes = await client.query(
        `
          SELECT 
            c.*,
            p.id as participant_id,
            p.wallet as participant_wallet,
            p.inscription_id as participant_inscription_id,
            p.completed as participant_completed,
            p.completed_at as participant_completed_at
          FROM damned_pool_circles c
          LEFT JOIN damned_pool_participants p 
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
        burn_window_granted: row.burn_window_granted,
        created_at: row.created_at,
        updated_at: row.updated_at,
        min_completion_count: row.min_completion_count,
        mode: row.mode,
      }

      if (circle.status !== 'ready') {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'This damned pool cannot be completed.' },
          { status: 409 },
        )
      }

      if (!row.participant_id) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'You are not part of this damned pool.' },
          { status: 403 },
        )
      }

      const participant = {
        id: row.participant_id,
        wallet: row.participant_wallet,
        inscription_id: row.participant_inscription_id,
        completed: row.participant_completed,
        completed_at: row.participant_completed_at,
      }

      if (participant.completed) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: true,
          message: 'Completion already recorded for this wallet.',
          summon: { id: circle.id, status: circle.status },
        })
      }

      const now = new Date()
      const expiresAt = circle.expires_at ? new Date(circle.expires_at) : null

      if (!expiresAt) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'Damned pool has not entered completion phase yet.' },
          { status: 409 },
        )
      }

      const finalWindowStart = new Date(expiresAt.getTime() - COMPLETION_WINDOW_MS)
      const timeUntilExpiry = expiresAt.getTime() - now.getTime()
      const timeUntilWindow = finalWindowStart.getTime() - now.getTime()

      if (timeUntilWindow > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: `Final window has not opened. Window opens in ${Math.ceil(timeUntilWindow / 1000)} seconds.`,
            timeUntilWindow: Math.ceil(timeUntilWindow / 1000),
          },
          { status: 409 },
        )
      }

      if (timeUntilExpiry <= 0) {
        await client.query(
          `UPDATE damned_pool_circles SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [circleId],
        )
        await client.query('COMMIT')
        return NextResponse.json({ success: false, error: 'Damned pool has expired.' }, { status: 410 })
      }

      // Mark participant as completed
      await client.query(
        `
          UPDATE damned_pool_participants
          SET completed = TRUE,
              completed_at = NOW()
          WHERE id = $1
        `,
        [participant.id],
      )

      const participantsRes = await client.query(
        `SELECT wallet, completed FROM damned_pool_participants WHERE circle_id = $1 FOR UPDATE`,
        [circleId],
      )
      const participants = participantsRes.rows
      const completedCount = participants.filter((row) => row.completed).length
      // Allow completion if 36 out of 40 participants have marked complete (or 18 out of 20 for bonus_credits)
      const minCount = Number(circle.min_completion_count ?? MIN_COMPLETION_COUNT_DEFAULT)
      const allCompleted = participants.length >= circle.required_participants && completedCount >= minCount

      let burnWindowGranted = Boolean(circle.burn_window_granted)

      if (allCompleted && !burnWindowGranted) {
        // Grant burn window: 30 minutes for 20-man (bonus_credits), 1 hour for 40-man (open_all)
        const burnWindowDuration = (circle.mode ?? 'open_all') === 'bonus_credits' 
          ? BURN_WINDOW_DURATION_20_MAN_MS 
          : BURN_WINDOW_DURATION_40_MAN_MS
        const burnWindowExpiresAt = new Date(now.getTime() + burnWindowDuration)

        await client.query(
          `
            UPDATE damned_pool_circles
            SET status = 'completed',
                completed_at = NOW(),
                burn_window_granted = TRUE,
                updated_at = NOW()
            WHERE id = $1
          `,
          [circleId],
        )

        // Create burn window record (credits_only if mode is bonus_credits)
        await client.query(
          `
            INSERT INTO damned_pool_burn_windows (circle_id, expires_at, credits_only)
            VALUES ($1, $2, $3)
          `,
          [circleId, burnWindowExpiresAt.toISOString(), circle.mode === 'bonus_credits'],
        )

        burnWindowGranted = true

        // For consistency in UI, mark any remaining participants as completed once the pool succeeds
        await client.query(
          `
            UPDATE damned_pool_participants
            SET completed = TRUE,
                completed_at = COALESCE(completed_at, NOW())
            WHERE circle_id = $1 AND completed = FALSE
          `,
          [circleId],
        )

        // Award +1 bonus burn allowance to the host for 20-man (bonus_credits) circles
        if ((circle.mode ?? 'open_all') === 'bonus_credits') {
          const hostWallet = (circle.creator_wallet ?? '').toString()
          if (hostWallet) {
            await client.query(
              `
                INSERT INTO abyss_bonus_allowances (wallet, available, updated_at)
                VALUES ($1, 1, NOW())
                ON CONFLICT (wallet)
                DO UPDATE SET
                  available = abyss_bonus_allowances.available + 1,
                  updated_at = EXCLUDED.updated_at
              `,
              [hostWallet],
            )
          }
        }

        // Grant ascension powder to all participants (host gets 14, others get 10)
        const creatorWallet = (circle.creator_wallet ?? '').toString().toLowerCase()
        for (const row of participants) {
          const participantWallet = (row.wallet ?? '').toString().trim()
          if (!participantWallet) continue

          const isHost = participantWallet.toLowerCase() === creatorWallet
          const rewardAmount = isHost ? POWDER_REWARD_HOST : POWDER_REWARD_PARTICIPANT
          const eventKey = `damned_pool_circle:${circleId}`

          // Ensure profile exists
          await client.query(
            `
              INSERT INTO profiles (wallet_address, ascension_powder, updated_at)
              VALUES ($1, 0, NOW())
              ON CONFLICT (wallet_address) DO NOTHING
            `,
            [participantWallet],
          )

          // Record the event (one-time per circle per wallet)
          const claimRes = await client.query(
            `
              INSERT INTO ascension_powder_events (wallet_address, event_key, granted_amount)
              VALUES ($1, $2, $3)
              ON CONFLICT (wallet_address, event_key) DO NOTHING
              RETURNING granted_amount
            `,
            [participantWallet, eventKey, rewardAmount],
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
              [rewardAmount, participantWallet],
            )
          }
        }
      }

      // OPTIMIZED: Get bonus allowance BEFORE commit
      let bonusAllowance: number | undefined
      if ((circle.mode ?? 'open_all') === 'bonus_credits') {
        const allowanceRes = await client.query(
          `SELECT available FROM abyss_bonus_allowances WHERE LOWER(wallet) = LOWER($1)`,
          [circle.creator_wallet],
        )
        bonusAllowance = allowanceRes.rows[0]?.available ?? 0
      }

      await client.query('COMMIT')

      // OPTIMIZED: Build response from data we already have instead of expensive re-fetch
      const summonResponse = {
        id: circle.id,
        creatorWallet: circle.creator_wallet,
        creatorInscriptionId: circle.creator_inscription_id,
        status: allCompleted && burnWindowGranted ? 'completed' : circle.status,
        requiredParticipants: circle.required_participants,
        lockedAt: circle.locked_at,
        completedAt: allCompleted && burnWindowGranted ? new Date().toISOString() : circle.completed_at,
        expiresAt: circle.expires_at,
        burnWindowGranted,
        createdAt: circle.created_at,
        updatedAt: new Date().toISOString(),
        minCompletionCount: circle.min_completion_count,
        mode: circle.mode,
        participants: participants.map((p) => ({
          wallet: p.wallet,
          completed: p.wallet?.toLowerCase() === wallet.toLowerCase() ? true : p.completed,
        })),
      }

      return NextResponse.json({
        success: true,
        summon: summonResponse,
        burnWindowGranted,
        ...(typeof bonusAllowance === 'number' ? { bonusAllowance } : {}),
      })
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {})
      }
      console.error('[damned-pool/circles/complete]', error)
      return NextResponse.json(
        { success: false, error: 'Failed to complete damned pool.' },
        { status: 500 },
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  } catch (error) {
    console.error('[damned-pool/circles/complete] Infrastructure error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to initialize infrastructure.' },
      { status: 500 },
    )
  }
}

