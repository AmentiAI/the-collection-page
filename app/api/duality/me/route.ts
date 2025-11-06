import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

function toCamel(row: any) {
  if (!row) return null
  const obj: Record<string, any> = {}
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    obj[camel] = row[key]
  }
  return obj
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()

    const profileRes = await pool.query(
      `SELECT id, wallet_address, username, total_good_karma, total_bad_karma
       FROM profiles
       WHERE wallet_address = $1`,
      [walletAddress]
    )

    if (profileRes.rows.length === 0) {
      return NextResponse.json({ cycle: null, participant: null, pair: null, events: [] })
    }

    const profile = profileRes.rows[0]

    const cycleRes = await pool.query(
      `SELECT *
       FROM duality_cycles
       WHERE status IN ('alignment', 'active', 'trial')
       ORDER BY week_start DESC
       LIMIT 1`
    )

    if (cycleRes.rows.length === 0) {
      return NextResponse.json({ cycle: null, participant: null, pair: null, events: [] })
    }

    const cycleRow = cycleRes.rows[0]
    const cycle = toCamel(cycleRow)

    const participantRes = await pool.query(
      `SELECT *
       FROM duality_participants
       WHERE cycle_id = $1 AND profile_id = $2
       LIMIT 1`,
      [cycleRow.id, profile.id]
    )

    if (participantRes.rows.length === 0) {
      return NextResponse.json({ cycle, participant: null, pair: null, events: [] })
    }

    const participantRow = participantRes.rows[0]
    const participant = toCamel(participantRow)

    const pairRes = await pool.query(
      `SELECT pr.*, 
              g.id AS good_participant_id,
              e.id AS evil_participant_id,
              gp.wallet_address AS good_wallet,
              gp.username AS good_username,
              ep.wallet_address AS evil_wallet,
              ep.username AS evil_username
       FROM duality_pairs pr
       JOIN duality_participants g ON pr.good_participant_id = g.id
       JOIN duality_participants e ON pr.evil_participant_id = e.id
       JOIN profiles gp ON g.profile_id = gp.id
       JOIN profiles ep ON e.profile_id = ep.id
       WHERE pr.cycle_id = $1 AND ($2 = pr.good_participant_id OR $2 = pr.evil_participant_id)
       LIMIT 1`,
      [cycleRow.id, participantRow.id]
    )

    let pair = null
    let partner = null

    if (pairRes.rows.length > 0) {
      const pairRow = pairRes.rows[0]
      pair = {
        ...toCamel(pairRow),
        goodParticipantId: pairRow.good_participant_id,
        evilParticipantId: pairRow.evil_participant_id
      }

      const isGood = pairRow.good_participant_id === participantRow.id
      partner = {
        alignment: isGood ? 'evil' : 'good',
        walletAddress: isGood ? pairRow.evil_wallet : pairRow.good_wallet,
        username: isGood ? pairRow.evil_username : pairRow.good_username
      }
    }

    let events: any[] = []
    if (pairRes.rows.length > 0) {
      const eventsRes = await pool.query(
        `SELECT *
         FROM duality_events
         WHERE pair_id = $1
         ORDER BY occurred_at DESC
         LIMIT 10`,
        [pairRes.rows[0].id]
      )
      events = eventsRes.rows.map(toCamel)
    }

    let trial = null
    const trialRes = await pool.query(
      `SELECT dt.*, dp.profile_id, p.wallet_address, p.username, du.discord_user_id
       FROM duality_trials dt
       JOIN duality_participants dp ON dt.participant_id = dp.id
       JOIN profiles p ON dp.profile_id = p.id
       LEFT JOIN discord_users du ON du.profile_id = p.id
       WHERE dt.participant_id = $1
       ORDER BY dt.scheduled_at DESC
       LIMIT 1`,
      [participantRow.id]
    )
    if (trialRes.rows.length > 0) {
      trial = toCamel(trialRes.rows[0])
    }

    return NextResponse.json({
      cycle,
      participant,
      partner,
      pair,
      events,
      trial,
      profile: {
        walletAddress: profile.wallet_address,
        username: profile.username,
        totalGoodKarma: profile.total_good_karma,
        totalBadKarma: profile.total_bad_karma
      }
    })
  } catch (error) {
    console.error('Duality me error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

