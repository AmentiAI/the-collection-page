import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { walletAddress, action } = await request.json()

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()

    const profileRes = await pool.query(
      `SELECT id FROM profiles WHERE wallet_address = $1`,
      [walletAddress]
    )

    if (profileRes.rows.length === 0) {
      return NextResponse.json({ error: 'Profile not found for wallet address.' }, { status: 404 })
    }

    const profileId = profileRes.rows[0].id

    const cycleRes = await pool.query(
      `SELECT id
       FROM duality_cycles
       WHERE status IN ('alignment', 'active')
       ORDER BY week_start DESC
       LIMIT 1`
    )

    if (cycleRes.rows.length === 0) {
      return NextResponse.json({ error: 'No active Duality cycle.' }, { status: 400 })
    }

    const cycleId = cycleRes.rows[0].id

    const participantRes = await pool.query(
      `SELECT id, alignment, current_pair_id, ready_for_pairing, next_available_at
       FROM duality_participants
       WHERE cycle_id = $1 AND profile_id = $2
       LIMIT 1`,
      [cycleId, profileId]
    )

    if (participantRes.rows.length === 0) {
      return NextResponse.json({ error: 'Participant is not enrolled in this Duality cycle.' }, { status: 404 })
    }

    const participant = participantRes.rows[0]

    if (action === 'leave' || action === 'cancel') {
      await pool.query(
        `UPDATE duality_participants
         SET ready_for_pairing = false, updated_at = NOW()
         WHERE id = $1`,
        [participant.id]
      )

      return NextResponse.json({ success: true, ready: false })
    }

    if (participant.current_pair_id) {
      return NextResponse.json({ error: 'Participant is currently in an active pairing.' }, { status: 400 })
    }

    if (participant.next_available_at && new Date(participant.next_available_at).getTime() > Date.now()) {
      return NextResponse.json({
        error: 'Participant is cooling down before the next pairing window.',
        nextAvailableAt: participant.next_available_at
      }, { status: 400 })
    }

    await pool.query(
      `UPDATE duality_participants
       SET ready_for_pairing = true, updated_at = NOW()
       WHERE id = $1`,
      [participant.id]
    )

    return NextResponse.json({ success: true, ready: true })
  } catch (error) {
    console.error('Duality join queue error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
