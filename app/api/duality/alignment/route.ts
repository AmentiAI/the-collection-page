import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { walletAddress, alignment } = await request.json()

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    if (alignment !== 'good' && alignment !== 'evil') {
      return NextResponse.json({ error: 'alignment must be "good" or "evil"' }, { status: 400 })
    }

    const pool = getPool()

    const cycleRes = await pool.query(
      `SELECT * FROM duality_cycles WHERE status IN ('alignment', 'active') ORDER BY week_start DESC LIMIT 1`
    )

    if (cycleRes.rows.length === 0) {
      return NextResponse.json({ error: 'No active Duality cycle found.' }, { status: 400 })
    }

    const cycle = cycleRes.rows[0]

    const profileRes = await pool.query(
      `SELECT id, total_good_karma, total_bad_karma FROM profiles WHERE wallet_address = $1`,
      [walletAddress]
    )

    if (profileRes.rows.length === 0) {
      return NextResponse.json({ error: 'Profile not found for wallet address.' }, { status: 404 })
    }

    const profile = profileRes.rows[0]
    const netKarma = Number(profile.total_good_karma || 0) - Number(profile.total_bad_karma || 0)

    const participantRes = await pool.query(
      `SELECT * FROM duality_participants WHERE cycle_id = $1 AND profile_id = $2`,
      [cycle.id, profile.id]
    )

    let participant

    if (participantRes.rows.length === 0) {
      const insertRes = await pool.query(
        `INSERT INTO duality_participants (cycle_id, profile_id, alignment, karma_snapshot)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [cycle.id, profile.id, alignment, netKarma]
      )
      participant = insertRes.rows[0]
    } else {
      participant = participantRes.rows[0]

      if (participant.locked_at && cycle.status !== 'alignment' && participant.alignment !== alignment) {
        return NextResponse.json(
          { error: 'Alignment is locked for this cycle.' },
          { status: 400 }
        )
      }

      const updateRes = await pool.query(
        `UPDATE duality_participants
         SET alignment = $1,
             karma_snapshot = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [alignment, netKarma, participant.id]
      )
      participant = updateRes.rows[0]
    }

    return NextResponse.json({
      participant: {
        id: participant.id,
        cycleId: participant.cycle_id,
        profileId: participant.profile_id,
        alignment: participant.alignment,
        karmaSnapshot: participant.karma_snapshot,
        fateMeter: participant.fate_meter,
        questCompleted: participant.quest_completed,
        participationCount: participant.participation_count,
        eligibleForTrial: participant.eligible_for_trial,
        lockedAt: participant.locked_at
      }
    })
  } catch (error) {
    console.error('Duality alignment error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

