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

export async function GET() {
  try {
    const pool = getPool()
    const cycleRes = await pool.query(`
      SELECT *
      FROM duality_cycles
      ORDER BY week_start DESC
      LIMIT 1
    `)

    if (cycleRes.rows.length === 0) {
      return NextResponse.json({ cycle: null, participants: [], pairs: [] })
    }

    const cycleRow = cycleRes.rows[0]
    const cycle = toCamel(cycleRow)
    if (!cycle) {
      return NextResponse.json({ cycle: null, participants: [], pairs: [] })
    }

    const participantsRes = await pool.query(
      `SELECT dp.*, p.wallet_address, p.username, p.total_good_karma, p.total_bad_karma, du.discord_user_id
       FROM duality_participants dp
       JOIN profiles p ON dp.profile_id = p.id
       LEFT JOIN discord_users du ON du.profile_id = p.id
       WHERE dp.cycle_id = $1
       ORDER BY dp.alignment, p.username NULLS LAST`,
      [cycle.id]
    )

    const participants = participantsRes.rows.map((row) => {
      const karmaSnapshot = Number(row.karma_snapshot ?? (row.total_good_karma - row.total_bad_karma))
      return {
        ...toCamel(row),
        walletAddress: row.wallet_address,
        username: row.username,
        discordUserId: row.discord_user_id,
        totalGoodKarma: row.total_good_karma,
        totalBadKarma: row.total_bad_karma,
        netKarma: karmaSnapshot
      }
    })

    const pairsRes = await pool.query(
      `SELECT pr.*, 
              gp.wallet_address AS good_wallet_address,
              gp.username AS good_username,
              ep.wallet_address AS evil_wallet_address,
              ep.username AS evil_username
       FROM duality_pairs pr
       JOIN duality_participants g ON pr.good_participant_id = g.id
       JOIN duality_participants e ON pr.evil_participant_id = e.id
       JOIN profiles gp ON g.profile_id = gp.id
       JOIN profiles ep ON e.profile_id = ep.id
       WHERE pr.cycle_id = $1
       ORDER BY pr.created_at ASC`,
      [cycle.id]
    )

    const pairs = pairsRes.rows.map((row) => ({
      ...toCamel(row),
      goodParticipantId: row.good_participant_id,
      evilParticipantId: row.evil_participant_id,
      goodWalletAddress: row.good_wallet_address,
      goodUsername: row.good_username,
      evilWalletAddress: row.evil_wallet_address,
      evilUsername: row.evil_username
    }))

    const trialsRes = await pool.query(
      `SELECT dt.*, dp.profile_id, dp.alignment, p.wallet_address, p.username, du.discord_user_id
       FROM duality_trials dt
       JOIN duality_participants dp ON dt.participant_id = dp.id
       JOIN profiles p ON dp.profile_id = p.id
       LEFT JOIN discord_users du ON du.profile_id = p.id
       WHERE dt.cycle_id = $1
       ORDER BY dt.scheduled_at ASC`,
      [cycle.id]
    )

    const trials = trialsRes.rows.map((row) => ({
      ...toCamel(row),
      profileId: row.profile_id,
      alignment: row.alignment,
      walletAddress: row.wallet_address,
      username: row.username,
      discordUserId: row.discord_user_id
    }))

    const eventsRes = await pool.query(
      `SELECT de.*, dp.alignment, dp.profile_id
       FROM duality_events de
       LEFT JOIN duality_participants dp ON de.participant_id = dp.id
       WHERE de.cycle_id = $1
       ORDER BY de.occurred_at DESC
       LIMIT 40`,
      [cycle.id]
    )

    const events = eventsRes.rows.map(toCamel)

    return NextResponse.json({ cycle, participants, pairs, trials, events })
  } catch (error) {
    console.error('Duality cycle GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const pool = getPool()
    const body = await request.json().catch(() => ({}))

    const existingRes = await pool.query(
      `SELECT id, status FROM duality_cycles WHERE status IN ('alignment', 'active', 'trial') ORDER BY week_start DESC LIMIT 1`
    )

    if (existingRes.rows.length > 0) {
      return NextResponse.json(
        { error: 'An active Duality cycle already exists.' },
        { status: 400 }
      )
    }

    const now = new Date()
    let weekStart: Date

    if (body.weekStart) {
      weekStart = new Date(body.weekStart)
    } else {
      const day = now.getUTCDay()
      const diff = (day === 0 ? -6 : 1 - day) // start week on Monday UTC
      weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff))
    }

    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

    const insertRes = await pool.query(
      `INSERT INTO duality_cycles (week_start, week_end, status)
       VALUES ($1, $2, 'alignment')
       RETURNING *`,
      [weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10)]
    )

    return NextResponse.json({ cycle: toCamel(insertRes.rows[0]) })
  } catch (error) {
    console.error('Duality cycle POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const pool = getPool()

    const cycleRes = await pool.query(
      `SELECT *
       FROM duality_cycles
       WHERE status IN ('alignment', 'active', 'trial')
       ORDER BY week_start DESC
       LIMIT 1`
    )

    if (cycleRes.rows.length === 0) {
      return NextResponse.json({ error: 'No active Duality cycle to update.' }, { status: 404 })
    }

    const cycleRow = cycleRes.rows[0]

    const fields: string[] = []
    const values: any[] = []
    let index = 1

    if (body.status) {
      fields.push(`status = $${index++}`)
      values.push(body.status)
    }

    if (Object.prototype.hasOwnProperty.call(body, 'activeEffect')) {
      fields.push(`active_effect = $${index++}`)
      values.push(body.activeEffect ?? null)
    }

    if (body.effectExpiresAt) {
      fields.push(`effect_expires_at = $${index++}`)
      values.push(new Date(body.effectExpiresAt))
    } else if (typeof body.effectDurationHours === 'number') {
      const expires = new Date()
      expires.setHours(expires.getHours() + body.effectDurationHours)
      fields.push(`effect_expires_at = $${index++}`)
      values.push(expires)
    } else if (body.clearEffectExpiry) {
      fields.push(`effect_expires_at = NULL`)
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
    }

    fields.push(`updated_at = NOW()`)
    const query = `UPDATE duality_cycles SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`
    values.push(cycleRow.id)

    const updateRes = await pool.query(query, values)
    return NextResponse.json({ cycle: toCamel(updateRes.rows[0]) })
  } catch (error) {
    console.error('Duality cycle PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

