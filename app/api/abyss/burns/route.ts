import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

const ABYSS_CAP = 333
const BURN_COOLDOWN_MS = 30 * 60 * 1_000

async function ensureAbyssBurnsTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_burns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inscription_id TEXT UNIQUE NOT NULL,
      tx_id TEXT UNIQUE NOT NULL,
      ordinal_wallet TEXT NOT NULL,
      payment_wallet TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_status ON abyss_burns(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_tx_id ON abyss_burns(tx_id)`)
}

function summarizeRow(row?: { total?: unknown; confirmed?: unknown }) {
  return {
    total: Number(row?.total ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
  }
}

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureAbyssBurnsTable(pool)

    const { searchParams } = request.nextUrl
    const ordinalWallet = searchParams.get('ordinalWallet')?.trim() ?? ''
    const paymentWallet = searchParams.get('paymentWallet')?.trim() ?? ''
    const includePending =
      searchParams.get('includePending') === 'true' ||
      searchParams.get('pending') === 'true' ||
      searchParams.get('pendingOnly') === 'true'
    const includeCooldown =
      searchParams.get('includeCooldown') === 'true' ||
      searchParams.get('cooldown') === 'true'

    let pending: Array<{
      inscriptionId: string
      txId: string
      ordinalWallet: string
      paymentWallet: string
      status: string
      createdAt: unknown
      updatedAt: unknown
      confirmedAt: unknown
    }> = []

    if ((includePending || includeCooldown) && !ordinalWallet && !paymentWallet) {
      return NextResponse.json(
        {
          success: false,
          error: 'ordinalWallet or paymentWallet query parameter is required when includePending or includeCooldown is true.',
        },
        { status: 400 },
      )
    }

    if (includePending) {
      if (!ordinalWallet && !paymentWallet) {
        return NextResponse.json(
          {
            success: false,
            error: 'ordinalWallet or paymentWallet query parameter is required when includePending is true.',
          },
          { status: 400 },
        )
      }

      const filters: string[] = []
      const values: unknown[] = []
      let paramIndex = 1

      if (ordinalWallet) {
        filters.push(`LOWER(ordinal_wallet) = LOWER($${paramIndex})`)
        values.push(ordinalWallet)
        paramIndex += 1
      }

      if (paymentWallet) {
        filters.push(`LOWER(payment_wallet) = LOWER($${paramIndex})`)
        values.push(paymentWallet)
        paramIndex += 1
      }

      const filterSql = filters.length > 0 ? `AND (${filters.join(' OR ')})` : ''

      const pendingResult = await pool.query(
        `
          SELECT inscription_id,
                 tx_id,
                 ordinal_wallet,
                 payment_wallet,
                 status,
                 created_at,
                 updated_at,
                 confirmed_at
          FROM abyss_burns
          WHERE status = 'pending'
          ${filterSql}
          ORDER BY updated_at DESC
        `,
        values,
      )

      pending = pendingResult.rows.map((row) => ({
        inscriptionId: row.inscription_id,
        txId: row.tx_id,
        ordinalWallet: row.ordinal_wallet,
        paymentWallet: row.payment_wallet,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        confirmedAt: row.confirmed_at,
      }))
    }

    let leaderboard: Array<{
      ordinalWallet: string
      paymentWallet: string
      total: number
      confirmed: number
    }> = []
    const includeLeaderboard = searchParams.get('includeLeaderboard') === 'true'

    let cooldown: {
      active: boolean
      remainingMs: number
      nextEligibleAt: string | null
      lastEventAt: string | null
      source: 'ordinal' | 'payment' | 'either' | null
    } | null = null

    if (includeCooldown && (ordinalWallet || paymentWallet)) {
      let ordinalLast: Date | null = null
      let paymentLast: Date | null = null

      if (ordinalWallet) {
        const ordinalResult = await pool.query(
          `SELECT MAX(updated_at) AS last_event FROM abyss_burns WHERE LOWER(ordinal_wallet) = LOWER($1)`,
          [ordinalWallet],
        )
        const rawOrdinal = ordinalResult.rows[0]?.last_event
        if (rawOrdinal) {
          const candidate = new Date(rawOrdinal)
          ordinalLast = Number.isNaN(candidate.getTime()) ? null : candidate
        }
      }

      if (paymentWallet) {
        const paymentResult = await pool.query(
          `SELECT MAX(updated_at) AS last_event FROM abyss_burns WHERE LOWER(payment_wallet) = LOWER($1)`,
          [paymentWallet],
        )
        const rawPayment = paymentResult.rows[0]?.last_event
        if (rawPayment) {
          const candidate = new Date(rawPayment)
          paymentLast = Number.isNaN(candidate.getTime()) ? null : candidate
        }
      }

      let source: 'ordinal' | 'payment' | 'either' | null = null
      let lastEventAt: Date | null = null

      if (ordinalLast && paymentLast) {
        if (ordinalLast.getTime() === paymentLast.getTime()) {
          lastEventAt = ordinalLast
          source = 'either'
        } else if (ordinalLast > paymentLast) {
          lastEventAt = ordinalLast
          source = 'ordinal'
        } else {
          lastEventAt = paymentLast
          source = 'payment'
        }
      } else if (ordinalLast) {
        lastEventAt = ordinalLast
        source = 'ordinal'
      } else if (paymentLast) {
        lastEventAt = paymentLast
        source = 'payment'
      }

      if (lastEventAt) {
        const nextEligibleAt = new Date(lastEventAt.getTime() + BURN_COOLDOWN_MS)
        const remainingMs = Math.max(0, nextEligibleAt.getTime() - Date.now())
        cooldown = {
          active: remainingMs > 0,
          remainingMs,
          nextEligibleAt: nextEligibleAt.toISOString(),
          lastEventAt: lastEventAt.toISOString(),
          source,
        }
      }
    }

    if (includeLeaderboard) {
      const leaderboardResult = await pool.query(
        `
          SELECT
            ordinal_wallet,
            payment_wallet,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed
          FROM abyss_burns
          GROUP BY ordinal_wallet, payment_wallet
          ORDER BY confirmed DESC, total DESC
          LIMIT 50
        `,
      )
      leaderboard = leaderboardResult.rows.map((row) => ({
        ordinalWallet: row.ordinal_wallet ?? '',
        paymentWallet: row.payment_wallet ?? '',
        total: Number(row.total ?? 0),
        confirmed: Number(row.confirmed ?? 0),
      }))
    }

    const summaryResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed FROM abyss_burns`,
    )
    const summary = summarizeRow(summaryResult.rows[0])

    const responseBody: Record<string, unknown> = { success: true, summary, cap: ABYSS_CAP }
    if (includePending) {
      responseBody.pending = pending
    }
    if (includeCooldown) {
      responseBody.cooldown = cooldown
    }
    if (includeLeaderboard) {
      responseBody.leaderboard = leaderboard
    }

    return NextResponse.json(responseBody)
  } catch (error) {
    console.error('[abyss/burns][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch abyss burns summary.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const inscriptionId = (body?.inscriptionId ?? '').toString().trim()
    const txId = (body?.txId ?? '').toString().trim()
    const ordinalWallet = (body?.ordinalWallet ?? '').toString().trim()
    const paymentWallet = (body?.paymentWallet ?? '').toString().trim()

    if (!inscriptionId || !txId || !ordinalWallet || !paymentWallet) {
      return NextResponse.json(
        { success: false, error: 'inscriptionId, txId, ordinalWallet, and paymentWallet are required.' },
        { status: 400 },
      )
    }

    const pool = getPool()
    await ensureAbyssBurnsTable(pool)

    const preSummaryResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed FROM abyss_burns`,
    )
    const preSummary = summarizeRow(preSummaryResult.rows[0])
    if (preSummary.confirmed >= ABYSS_CAP) {
      return NextResponse.json(
        { success: false, error: 'Abyss burn cap reached.', summary: preSummary, cap: ABYSS_CAP },
        { status: 403 },
      )
    }

    await pool.query(
      `
        INSERT INTO abyss_burns (inscription_id, tx_id, ordinal_wallet, payment_wallet, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
        ON CONFLICT (inscription_id) DO UPDATE
          SET tx_id = EXCLUDED.tx_id,
              ordinal_wallet = EXCLUDED.ordinal_wallet,
              payment_wallet = EXCLUDED.payment_wallet,
              status = 'pending',
              updated_at = NOW(),
              confirmed_at = NULL,
              last_checked_at = NULL
      `,
      [inscriptionId, txId, ordinalWallet, paymentWallet],
    )

    const summaryResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed FROM abyss_burns`,
    )
    const summary = summarizeRow(summaryResult.rows[0])

    return NextResponse.json({ success: true, summary, cap: ABYSS_CAP })
  } catch (error) {
    console.error('[abyss/burns][POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to record abyss burn.' }, { status: 500 })
  }
}


