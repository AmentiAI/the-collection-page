import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

interface ParticipantRow {
  id: string
  profile_id: string
  alignment: 'good' | 'evil'
  karma_snapshot: number
  total_good_karma: number
  total_bad_karma: number
}

export async function POST(request: NextRequest) {
  try {
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const pool = getPool()

    const cycleRes = await pool.query(
      `SELECT * FROM duality_cycles WHERE status = 'alignment' ORDER BY week_start DESC LIMIT 1`
    )

    if (cycleRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'No cycle in alignment phase. Start a new cycle first.' },
        { status: 400 }
      )
    }

    const cycle = cycleRes.rows[0]

    const participantsRes = await pool.query(
      `SELECT dp.*, p.total_good_karma, p.total_bad_karma
       FROM duality_participants dp
       JOIN profiles p ON dp.profile_id = p.id
       WHERE dp.cycle_id = $1`,
      [cycle.id]
    )

    if (participantsRes.rows.length < 2) {
      return NextResponse.json({ error: 'Not enough participants to create pairings.' }, { status: 400 })
    }

    const goodList: ParticipantRow[] = []
    const evilList: ParticipantRow[] = []

    for (const row of participantsRes.rows) {
      const participant: ParticipantRow = {
        id: row.id,
        profile_id: row.profile_id,
        alignment: row.alignment,
        karma_snapshot:
          row.karma_snapshot ?? (Number(row.total_good_karma || 0) - Number(row.total_bad_karma || 0)),
        total_good_karma: row.total_good_karma,
        total_bad_karma: row.total_bad_karma
      }

      if (participant.alignment === 'good') {
        goodList.push(participant)
      } else {
        evilList.push(participant)
      }
    }

    if (goodList.length === 0 || evilList.length === 0) {
      return NextResponse.json({ error: 'Need at least one participant on each side to pair.' }, { status: 400 })
    }

    const sortByKarma = (arr: ParticipantRow[]) =>
      arr.sort((a, b) => (b.karma_snapshot || 0) - (a.karma_snapshot || 0))

    sortByKarma(goodList)
    sortByKarma(evilList)

    const pairPlans: Array<{ good: ParticipantRow; evil: ParticipantRow; fate: number }> = []
    const usedEvil = new Set<string>()

    for (const good of goodList) {
      let bestMatch: ParticipantRow | null = null
      let bestDiff = Infinity

      for (const evil of evilList) {
        if (usedEvil.has(evil.id)) continue
        const diff = Math.abs((good.karma_snapshot || 0) - (evil.karma_snapshot || 0))
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
      return NextResponse.json({ error: 'Unable to build pairings with current participants.' }, { status: 400 })
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM duality_pairs WHERE cycle_id = $1', [cycle.id])

      const insertedPairs = []
      for (const plan of pairPlans) {
        const pairRes = await client.query(
          `INSERT INTO duality_pairs (cycle_id, good_participant_id, evil_participant_id, fate_meter)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [cycle.id, plan.good.id, plan.evil.id, plan.fate]
        )
        insertedPairs.push(pairRes.rows[0])

        await client.query(
          `UPDATE duality_participants
           SET fate_meter = $1, locked_at = NOW(), updated_at = NOW()
           WHERE id = ANY($2::uuid[])`,
          [plan.fate, [plan.good.id, plan.evil.id]]
        )
      }

      await client.query(
        `UPDATE duality_cycles SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [cycle.id]
      )

      await client.query('COMMIT')

      return NextResponse.json({
        cycle: { ...cycle, status: 'active' },
        pairs: insertedPairs.map((row) => ({
          id: row.id,
          cycleId: row.cycle_id,
          goodParticipantId: row.good_participant_id,
          evilParticipantId: row.evil_participant_id,
          fateMeter: row.fate_meter,
          status: row.status
        }))
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

