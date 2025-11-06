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

export async function GET(_request: NextRequest) {
  try {
    const pool = getPool()

    const cycleRes = await pool.query(
      `SELECT *
       FROM duality_cycles
       WHERE status IN ('alignment', 'active', 'trial')
       ORDER BY week_start DESC
       LIMIT 1`
    )

    if (cycleRes.rows.length === 0) {
      return NextResponse.json({ cycle: null, metrics: null })
    }

    const cycle = cycleRes.rows[0]

    const participantsRes = await pool.query(
      `SELECT alignment
       FROM duality_participants
       WHERE cycle_id = $1`,
      [cycle.id]
    )

    const participantCounts = participantsRes.rows.reduce(
      (acc: Record<string, number>, row) => {
        acc[row.alignment] = (acc[row.alignment] || 0) + 1
        return acc
      },
      { good: 0, evil: 0 }
    )

    const pairCountRes = await pool.query(
      `SELECT COUNT(*) AS count
       FROM duality_pairs
       WHERE cycle_id = $1`,
      [cycle.id]
    )

    const trialStatsRes = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM duality_trials
       WHERE cycle_id = $1
       GROUP BY status`,
      [cycle.id]
    )

    const trialCounts: Record<string, number> = { scheduled: 0, voting: 0, resolved: 0, cancelled: 0 }
    for (const row of trialStatsRes.rows) {
      trialCounts[row.status] = Number(row.count)
    }

    const eventsRes = await pool.query(
      `SELECT karma_delta_good, karma_delta_evil, occurred_at
       FROM duality_events
       WHERE cycle_id = $1`,
      [cycle.id]
    )

    let karmaGood = 0
    let karmaEvil = 0
    let eventsToday = 0
    const now = new Date()
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const startTs = startOfDay.getTime()
    const endTs = startTs + 24 * 60 * 60 * 1000

    for (const row of eventsRes.rows) {
      karmaGood += Number(row.karma_delta_good || 0)
      karmaEvil += Number(row.karma_delta_evil || 0)
      const occurred = new Date(row.occurred_at).getTime()
      if (occurred >= startTs && occurred < endTs) {
        eventsToday += 1
      }
    }

    return NextResponse.json({
      cycle: toCamel(cycle),
      metrics: {
        participants: participantCounts,
        pairCount: Number(pairCountRes.rows[0]?.count || 0),
        trials: trialCounts,
        eventsTotal: eventsRes.rows.length,
        eventsToday,
        karma: {
          good: karmaGood,
          evil: karmaEvil
        }
      }
    })
  } catch (error) {
    console.error('Duality summary error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

