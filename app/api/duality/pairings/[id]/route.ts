import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import {
  completeDualityPairSuccess,
  ensureDualitySchema,
  failDualityPair,
} from '@/lib/duality'

export const dynamic = 'force-dynamic'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (ADMIN_TOKEN) {
      const headerToken = request.headers.get('x-admin-token')
      if (headerToken !== ADMIN_TOKEN) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const pairId = params.id
    if (!pairId) {
      return NextResponse.json({ error: 'Pair id is required.' }, { status: 400 })
    }

    const { status, cooldownMinutes = 60 } = await request.json().catch(() => ({}))
    if (!status) {
      return NextResponse.json({ error: 'status is required.' }, { status: 400 })
    }

    if (!['completed', 'expired', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }

    const pool = getPool()
    await ensureDualitySchema(pool)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const pairRes = await client.query(
        `SELECT * FROM duality_pairs WHERE id = $1 FOR UPDATE`,
        [pairId],
      )

      if (pairRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Pairing session not found.' }, { status: 404 })
      }

      const pairRow = pairRes.rows[0] as any
      let result: any = null

      if (status === 'completed') {
        if (pairRow.reward_status === 'awarded') {
          result = { alreadyCompleted: true }
        } else if (pairRow.good_checkin_at && pairRow.evil_checkin_at) {
          result = await completeDualityPairSuccess(client, pairRow, {
            reason: 'Scheduled completion',
          })
        } else {
          result = await failDualityPair(client, pairRow, {
            reason: 'Pair finalized without both check-ins',
            cooldownMinutes,
          })
        }
      } else if (status === 'expired') {
        result = await failDualityPair(client, pairRow, {
          reason: 'Window expired',
          cooldownMinutes,
        })
      } else {
        result = await failDualityPair(client, pairRow, {
          reason: 'Pairing cancelled',
          cooldownMinutes,
        })
        await client.query(
          `UPDATE duality_pairs
           SET status = 'cancelled', updated_at = NOW()
           WHERE id = $1`,
          [pairId],
        )
      }

      const updatedPairRes = await client.query(
        `SELECT * FROM duality_pairs WHERE id = $1`,
        [pairId],
      )

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        status,
        result,
        pair: updatedPairRes.rows[0],
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Duality pair release error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
