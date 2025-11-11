import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const SUMMON_DURATION_MS = 30 * 60 * 1000

type RouteParams = {
  params: {
    summonId: string
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const summonId = params?.summonId?.trim()
  if (!summonId) {
    return NextResponse.json({ success: false, error: 'summonId required' }, { status: 400 })
  }

  const pool = getPool()
  const wallet = (await request.json().catch(() => ({})))?.wallet
  if (typeof wallet !== 'string' || wallet.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const summonRes = await client.query(
      `SELECT creator_wallet, status, created_at, expires_at FROM abyss_summons WHERE id = $1 FOR UPDATE`,
      [summonId],
    )

    if (summonRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Summon not found' }, { status: 404 })
    }

    const summon = summonRes.rows[0] as {
      creator_wallet: string
      status: string
      created_at: string | null
      expires_at: string | null
    }

    if (summon.creator_wallet.toLowerCase() !== wallet.trim().toLowerCase()) {
      await client.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Only the creator can dismiss this circle' }, { status: 403 })
    }

    const createdAtMs = summon.created_at ? Date.parse(summon.created_at) : Date.now()
    const rawExpiresAtMs = summon.expires_at ? Date.parse(summon.expires_at) : Number.POSITIVE_INFINITY
    const fallbackExpiryMs = createdAtMs + SUMMON_DURATION_MS
    const effectiveExpiryMs = Math.min(rawExpiresAtMs, fallbackExpiryMs)
    const nowMs = Date.now()

    if (!Number.isFinite(effectiveExpiryMs) || Number.isNaN(effectiveExpiryMs)) {
      // If somehow no expiry is set, fall back to 30 minutes from creation
      if (nowMs < fallbackExpiryMs) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: false, error: 'Circle must be expired before dismissal' }, { status: 400 })
      }
    } else if (nowMs < effectiveExpiryMs) {
      await client.query('ROLLBACK')
      return NextResponse.json({ success: false, error: 'Circle must be expired before dismissal' }, { status: 400 })
    }

    if (summon.status !== 'expired') {
      await client.query(
        `UPDATE abyss_summons SET status = 'expired', expires_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [summonId],
      )
    }

    await client.query(`DELETE FROM abyss_summons WHERE id = $1`, [summonId])

    await client.query('COMMIT')
    return NextResponse.json({ success: true })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Dismiss summon failed:', error)
    return NextResponse.json({ success: false, error: 'Failed to dismiss circle' }, { status: 500 })
  } finally {
    client.release()
  }
}
