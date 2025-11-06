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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { participantId, scheduledAt, voteEndsAt, metadata } = body

    if (!participantId) {
      return NextResponse.json({ error: 'participantId is required' }, { status: 400 })
    }

    if (!scheduledAt || !voteEndsAt) {
      return NextResponse.json({ error: 'scheduledAt and voteEndsAt are required' }, { status: 400 })
    }

    const pool = getPool()

    const participantRes = await pool.query(
      `SELECT dp.*, cy.id AS cycle_id, cy.status AS cycle_status
       FROM duality_participants dp
       JOIN duality_cycles cy ON dp.cycle_id = cy.id
       WHERE dp.id = $1`,
      [participantId]
    )

    if (participantRes.rows.length === 0) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    const participant = participantRes.rows[0]

    if (participant.cycle_status !== 'trial' && participant.cycle_status !== 'active') {
      return NextResponse.json(
        { error: 'Trials can only be scheduled during active or trial phases.' },
        { status: 400 }
      )
    }

    const insertRes = await pool.query(
      `INSERT INTO duality_trials (cycle_id, participant_id, scheduled_at, vote_ends_at, status, metadata)
       VALUES ($1, $2, $3, $4, 'scheduled', $5)
       RETURNING *`,
      [participant.cycle_id, participantId, new Date(scheduledAt), new Date(voteEndsAt), metadata ? JSON.stringify(metadata) : null]
    )

    await pool.query(
      `UPDATE duality_participants
       SET eligible_for_trial = true, updated_at = NOW()
       WHERE id = $1`,
      [participantId]
    )

    return NextResponse.json({ trial: toCamel(insertRes.rows[0]) })
  } catch (error) {
    console.error('Duality trial POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      trialId,
      status,
      verdict,
      votesAbsolve,
      votesCondemn,
      metadata,
      karmaAdjustments
    } = body

    if (!trialId) {
      return NextResponse.json({ error: 'trialId is required' }, { status: 400 })
    }

    const pool = getPool()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const trialRes = await client.query(`SELECT * FROM duality_trials WHERE id = $1 FOR UPDATE`, [trialId])
      if (trialRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
      }

      const trial = trialRes.rows[0]

      const fields: string[] = []
      const values: any[] = []
      let index = 1

      if (status) {
        fields.push(`status = $${index++}`)
        values.push(status)
      }
      if (verdict !== undefined) {
        fields.push(`verdict = $${index++}`)
        values.push(verdict)
      }
      if (votesAbsolve !== undefined) {
        fields.push(`votes_absolve = $${index++}`)
        values.push(Number(votesAbsolve))
      }
      if (votesCondemn !== undefined) {
        fields.push(`votes_condemn = $${index++}`)
        values.push(Number(votesCondemn))
      }
      if (metadata !== undefined) {
        fields.push(`metadata = $${index++}`)
        values.push(metadata ? JSON.stringify(metadata) : null)
      }

      if (fields.length > 0) {
        fields.push(`updated_at = NOW()`)
        values.push(trialId)
        await client.query(
          `UPDATE duality_trials SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
          values
        )
      }

      if (Array.isArray(karmaAdjustments) && karmaAdjustments.length > 0) {
        const participantRes = await client.query(
          `SELECT dp.id, dp.profile_id, dp.alignment
           FROM duality_participants dp
           JOIN duality_trials dt ON dt.participant_id = dp.id
           WHERE dt.id = $1`,
          [trialId]
        )

        if (participantRes.rows.length === 0) {
          throw new Error('Participant for trial not found')
        }

        const participant = participantRes.rows[0]

        for (const adj of karmaAdjustments) {
          if (!adj || typeof adj.points !== 'number' || adj.points === 0) continue
          const points = Number(adj.points)
          const type = participant.alignment === 'good' ? 'good' : 'evil'
          await client.query(
            `INSERT INTO karma_points (profile_id, points, type, reason, given_by)
             VALUES ($1, $2, $3, $4, $5)`
          , [
            participant.profile_id,
            points,
            type,
            adj.reason || `Duality Trial Verdict: ${verdict || 'pending'}`,
            adj.givenBy || 'duality-trial'
          ])
        }
      }

      await client.query('COMMIT')

      const updatedRes = await pool.query(`SELECT * FROM duality_trials WHERE id = $1`, [trialId])
      return NextResponse.json({ trial: toCamel(updatedRes.rows[0]) })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Duality trial PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

