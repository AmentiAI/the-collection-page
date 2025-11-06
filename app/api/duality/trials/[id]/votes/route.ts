import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const trialId = params.id
    if (!trialId) {
      return NextResponse.json({ error: 'trialId is required' }, { status: 400 })
    }

    const { counts, metadata } = await request.json()

    if (
      !counts ||
      typeof counts.votesAbsolve !== 'number' ||
      typeof counts.votesCondemn !== 'number'
    ) {
      return NextResponse.json(
        { error: 'counts.votesAbsolve and counts.votesCondemn must be numbers' },
        { status: 400 }
      )
    }

    const { votesAbsolve, votesCondemn } = counts

    const pool = getPool()
    const result = await pool.query(
      `UPDATE duality_trials
       SET votes_absolve = $1,
           votes_condemn = $2,
           metadata = COALESCE($3::jsonb, metadata),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [votesAbsolve, votesCondemn, metadata ? JSON.stringify(metadata) : null, trialId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
    }

    return NextResponse.json({ trial: result.rows[0] })
  } catch (error) {
    console.error('Duality trial votes error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

