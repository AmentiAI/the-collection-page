import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import {
  completeDualityPairSuccess,
  ensureDualitySchema,
  failDualityPair,
} from '@/lib/duality'

export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

export async function POST(request: NextRequest) {
  try {
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json().catch(() => ({}))
    const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress : null
    const discordUserId = typeof body.discordUserId === 'string' ? body.discordUserId : null

    if (!walletAddress && !discordUserId) {
      return NextResponse.json(
        { error: 'walletAddress or discordUserId is required' },
        { status: 400 },
      )
    }

    const pool = getPool()
    await ensureDualitySchema(pool)

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      let profileRow: {
        id: string
        wallet_address: string
      } | null = null

      if (walletAddress) {
        const profileRes = await client.query(
          `SELECT id, wallet_address FROM profiles WHERE wallet_address = $1`,
          [walletAddress],
        )
        profileRow = profileRes.rows[0] ?? null
      } else if (discordUserId) {
        const profileRes = await client.query(
          `SELECT p.id, p.wallet_address
           FROM discord_users du
           JOIN profiles p ON du.profile_id = p.id
           WHERE du.discord_user_id = $1`,
          [discordUserId],
        )
        profileRow = profileRes.rows[0] ?? null
      }

      if (!profileRow) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Profile not found for user.' }, { status: 404 })
      }

      const participantRes = await client.query(
        `SELECT dp.*
         FROM duality_participants dp
         JOIN duality_cycles dc ON dp.cycle_id = dc.id
         WHERE dp.profile_id = $1
           AND dc.status IN ('alignment', 'active', 'trial')
         ORDER BY dp.updated_at DESC
         LIMIT 1`,
        [profileRow.id],
      )

      if (participantRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'You are not enrolled in the current Duality cycle.' },
          { status: 400 },
        )
      }

      const participant = participantRes.rows[0] as any

      if (!participant.current_pair_id) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'No active pairing window to check in for.' },
          { status: 400 },
        )
      }

      const pairRes = await client.query(
        `SELECT * FROM duality_pairs WHERE id = $1 FOR UPDATE`,
        [participant.current_pair_id],
      )

      if (pairRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Active pairing not found.' }, { status: 404 })
      }

      const pair = pairRes.rows[0] as any

      if (pair.status !== 'active') {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'This pairing is no longer active.' },
          { status: 400 },
        )
      }

      const windowEnd = pair.window_end ? new Date(pair.window_end) : null
      const now = new Date()
      if (windowEnd && now > windowEnd) {
        const failure = await failDualityPair(client, pair, {
          reason: 'Check-in attempted after window ended',
        })
        await client.query('COMMIT')
        return NextResponse.json(
          { error: 'Pairing window has already ended.', failure },
          { status: 400 },
        )
      }

      const isGoodSlot = pair.good_participant_id === participant.id
      const columnName = isGoodSlot ? 'good_checkin_at' : 'evil_checkin_at'
      if (!isGoodSlot && pair.evil_participant_id !== participant.id) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'Participant does not belong to this pairing.' },
          { status: 400 },
        )
      }

      if (pair[columnName]) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          success: true,
          alreadyCheckedIn: true,
          slot: isGoodSlot ? 'good' : 'evil',
        })
      }

      await client.query(
        `UPDATE duality_pairs
         SET ${columnName} = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [pair.id],
      )

      const updatedPairRes = await client.query(
        `SELECT * FROM duality_pairs WHERE id = $1`,
        [pair.id],
      )
      const updatedPair = updatedPairRes.rows[0] as any

      let completion: any = null
      if (updatedPair.good_checkin_at && updatedPair.evil_checkin_at) {
        completion = await completeDualityPairSuccess(client, updatedPair, {
          reason: 'Both participants checked in',
        })
      }

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        alreadyCheckedIn: false,
        slot: isGoodSlot ? 'good' : 'evil',
        bothCheckedIn: Boolean(updatedPair.good_checkin_at && updatedPair.evil_checkin_at),
        completion,
        pair: updatedPair,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[Duality] Check-in error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

