import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

type KarmaAdjustment = {
  participantId: string
  alignment: 'good' | 'evil'
  points: number
  reason: string
  givenBy?: string
}

function toCamel(row: any) {
  if (!row) return null
  const obj: Record<string, any> = {}
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    obj[camel] = row[key]
  }
  return obj
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      pairId,
      participantId,
      eventType,
      result,
      cycleDay,
      metadata,
      fateMeter,
      karmaDeltaGood = 0,
      karmaDeltaEvil = 0,
      adjustments
    } = body

    if (!pairId) {
      return NextResponse.json({ error: 'pairId is required' }, { status: 400 })
    }

    if (!eventType) {
      return NextResponse.json({ error: 'eventType is required' }, { status: 400 })
    }

    const pool = getPool()

    const pairRes = await pool.query(
      `SELECT pr.*, cy.status AS cycle_status
       FROM duality_pairs pr
       JOIN duality_cycles cy ON pr.cycle_id = cy.id
       WHERE pr.id = $1`,
      [pairId]
    )

    if (pairRes.rows.length === 0) {
      return NextResponse.json({ error: 'Pair not found' }, { status: 404 })
    }

    const pair = pairRes.rows[0]

    const participantsRes = await pool.query(
      `SELECT id, alignment, profile_id FROM duality_participants WHERE id = ANY($1::uuid[])`,
      [[pair.good_participant_id, pair.evil_participant_id]]
    )

    const participants = new Map<string, { id: string; alignment: 'good' | 'evil'; profile_id: string }>()
    for (const row of participantsRes.rows) {
      participants.set(row.id, {
        id: row.id,
        alignment: row.alignment,
        profile_id: row.profile_id
      })
    }

    if (!participants.has(pair.good_participant_id) || !participants.has(pair.evil_participant_id)) {
      return NextResponse.json({ error: 'Pair participants missing for this cycle' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const eventInsert = await client.query(
        `INSERT INTO duality_events (cycle_id, pair_id, participant_id, event_type, cycle_day, result, karma_delta_good, karma_delta_evil, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          pair.cycle_id,
          pairId,
          participantId ?? null,
          eventType,
          cycleDay ?? null,
          result ?? null,
          karmaDeltaGood,
          karmaDeltaEvil,
          metadata ? JSON.stringify(metadata) : null
        ]
      )

      const karmaAdjustments: KarmaAdjustment[] = []

      if (karmaDeltaGood !== 0) {
        const goodParticipant = participants.get(pair.good_participant_id)!
        karmaAdjustments.push({
          participantId: goodParticipant.id,
          alignment: 'good',
          points: Number(karmaDeltaGood),
          reason: `Duality Event: ${eventType}${result ? ` (${result})` : ''}`,
          givenBy: 'system'
        })
      }

      if (karmaDeltaEvil !== 0) {
        const evilParticipant = participants.get(pair.evil_participant_id)!
        karmaAdjustments.push({
          participantId: evilParticipant.id,
          alignment: 'evil',
          points: Number(karmaDeltaEvil),
          reason: `Duality Event: ${eventType}${result ? ` (${result})` : ''}`,
          givenBy: 'system'
        })
      }

      if (Array.isArray(adjustments)) {
        for (const adj of adjustments) {
          if (!adj || !adj.participantId || !participants.has(adj.participantId)) continue
          karmaAdjustments.push({
            participantId: adj.participantId,
            alignment: participants.get(adj.participantId)!.alignment,
            points: Number(adj.points || 0),
            reason: adj.reason || `Duality Event: ${eventType}`,
            givenBy: adj.givenBy || 'system'
          })
        }
      }

      const incrementParticipationIds = new Set<string>()

      for (const adj of karmaAdjustments) {
        if (!adj.points || adj.points === 0) continue

        const participant = participants.get(adj.participantId)
        if (!participant) continue

        const type = adj.alignment === 'good' ? 'good' : 'evil'

        await client.query(
          `INSERT INTO karma_points (profile_id, points, type, reason, given_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [participant.profile_id, adj.points, type, adj.reason, adj.givenBy || 'system']
        )

        incrementParticipationIds.add(participant.id)
      }

      if (incrementParticipationIds.size > 0) {
        const idsArray = Array.from(incrementParticipationIds)
        await client.query(
          `UPDATE duality_participants
           SET participation_count = participation_count + 1,
               updated_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          [idsArray]
        )
      }

      if (fateMeter !== undefined && fateMeter !== null) {
        await client.query(
          `UPDATE duality_pairs SET fate_meter = $1, updated_at = NOW() WHERE id = $2`,
          [Math.max(0, Math.min(100, Number(fateMeter))), pairId]
        )

        await client.query(
          `UPDATE duality_participants
           SET fate_meter = $1, updated_at = NOW()
           WHERE id = ANY($2::uuid[])`,
          [Math.max(0, Math.min(100, Number(fateMeter))), [pair.good_participant_id, pair.evil_participant_id]]
        )
      }

      await client.query('COMMIT')

      return NextResponse.json({
        event: toCamel(eventInsert.rows[0]),
        karmaAdjustments: karmaAdjustments.map((adj) => ({
          participantId: adj.participantId,
          alignment: adj.alignment,
          points: adj.points
        }))
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Duality event error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

