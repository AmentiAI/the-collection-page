import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

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

    const pool = getPool()
    const body = await request.json().catch(() => ({}))
    const windowMinutes = Number(body.windowMinutes) > 0 ? Number(body.windowMinutes) : 60
    const cooldownMinutes = Number(body.cooldownMinutes) > 0 ? Number(body.cooldownMinutes) : 60

    const cycleRes = await pool.query(
      `SELECT *
       FROM duality_cycles
       WHERE status IN ('alignment', 'active')
       ORDER BY week_start DESC
       LIMIT 1`
    )

    if (cycleRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'No active Duality cycle. Start a new cycle first.' },
        { status: 400 }
      )
    }

    const cycle = cycleRes.rows[0]

    const participantsRes = await pool.query(
      `SELECT dp.*, p.total_good_karma, p.total_bad_karma
       FROM duality_participants dp
       JOIN profiles p ON dp.profile_id = p.id
       WHERE dp.cycle_id = $1
         AND COALESCE(dp.ready_for_pairing, false) = true
         AND dp.current_pair_id IS NULL
         AND (dp.next_available_at IS NULL OR dp.next_available_at <= NOW())`,
      [cycle.id]
    )

    if (participantsRes.rows.length < 2) {
      return NextResponse.json({
        cycle: { ...cycle },
        pairs: [],
        message: 'Not enough ready participants to create pairings.'
      })
    }

    const normalize = (row: any) => ({
      id: row.id as string,
      profileId: row.profile_id as string,
      alignment: row.alignment as 'good' | 'evil',
      karmaSnapshot:
        row.karma_snapshot ?? (Number(row.total_good_karma || 0) - Number(row.total_bad_karma || 0))
    })

    const goodList = participantsRes.rows.filter((row) => row.alignment === 'good').map(normalize)
    const evilList = participantsRes.rows.filter((row) => row.alignment === 'evil').map(normalize)

    if (goodList.length === 0 || evilList.length === 0) {
      return NextResponse.json({
        cycle: { ...cycle },
        pairs: [],
        message: 'Need at least one ready participant on each side to create pairings.'
      })
    }

    const sortByKarma = (arr: typeof goodList) =>
      arr.sort((a, b) => (b.karmaSnapshot || 0) - (a.karmaSnapshot || 0))

    sortByKarma(goodList)
    sortByKarma(evilList)

    const pairPlans: Array<{ good: (typeof goodList)[number]; evil: (typeof evilList)[number]; fate: number }> = []
    const usedEvil = new Set<string>()

    for (const good of goodList) {
      let bestMatch: (typeof evilList)[number] | null = null
      let bestDiff = Infinity

      for (const evil of evilList) {
        if (usedEvil.has(evil.id)) continue
        const diff = Math.abs((good.karmaSnapshot || 0) - (evil.karmaSnapshot || 0))
        if (diff < bestDiff) {
          bestDiff = diff
          bestMatch = evil
        }
      }

      if (bestMatch) {
        usedEvil.add(bestMatch.id)
        const fate = Math.floor(Math.random() * 41) + 30 // 30-70
        pairPlans.push({ good, evil: bestMatch, fate })
      }
    }

    if (pairPlans.length === 0) {
      return NextResponse.json({
        cycle: { ...cycle },
        pairs: [],
        message: 'Unable to build pairings with the current queue.'
      })
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const insertedPairs = []

      for (const plan of pairPlans) {
        const windowStart = new Date()
        const windowEnd = new Date(windowStart.getTime() + windowMinutes * 60 * 1000)

        const pairRes = await client.query(
          `INSERT INTO duality_pairs (cycle_id, good_participant_id, evil_participant_id, fate_meter, window_start, window_end, cooldown_minutes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            cycle.id,
            plan.good.id,
            plan.evil.id,
            plan.fate,
            windowStart.toISOString(),
            windowEnd.toISOString(),
            cooldownMinutes
          ]
        )
        const pairRow = pairRes.rows[0]
        insertedPairs.push(pairRow)

        await client.query(
          `UPDATE duality_participants
           SET fate_meter = $1,
               locked_at = $2,
               ready_for_pairing = false,
               current_pair_id = $3,
               updated_at = NOW()
           WHERE id = ANY($4::uuid[])`,
          [plan.fate, windowStart.toISOString(), pairRow.id, [plan.good.id, plan.evil.id]]
        )
      }

      if (cycle.status !== 'active') {
        await client.query(
          `UPDATE duality_cycles SET status = 'active', updated_at = NOW() WHERE id = $1`,
          [cycle.id]
        )
      }

      await client.query('COMMIT')

      return NextResponse.json({
        cycle: { ...cycle, status: 'active' },
        pairs: insertedPairs.map((row) => ({
          id: row.id,
          cycleId: row.cycle_id,
          goodParticipantId: row.good_participant_id,
          evilParticipantId: row.evil_participant_id,
          fateMeter: row.fate_meter,
          status: row.status,
          windowStart: row.window_start,
          windowEnd: row.window_end,
          cooldownMinutes: row.cooldown_minutes
        })),
        windowMinutes,
        cooldownMinutes
      })
    } catch (transactionError) {
      await client.query('ROLLBACK')
      throw transactionError
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Duality pairings error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

