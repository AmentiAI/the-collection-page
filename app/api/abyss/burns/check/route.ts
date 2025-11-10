import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

const ABYSS_CAP = 333

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const txId = (body?.txId ?? '').toString().trim()
    if (!txId) {
      return NextResponse.json({ success: false, error: 'txId is required.' }, { status: 400 })
    }

    const pool = getPool()
    await ensureAbyssBurnsTable(pool)

    const existing = await pool.query(
      `
        SELECT
          id,
          inscription_id,
          tx_id,
          ordinal_wallet,
          payment_wallet,
          status,
          created_at,
          updated_at,
          confirmed_at
        FROM abyss_burns
        WHERE tx_id = $1
      `,
      [txId],
    )
    if (existing.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Burn record not found.' }, { status: 404 })
    }

    let confirmed = false
    try {
      const response = await fetch(`https://mempool.space/api/tx/${txId}`, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json().catch(() => null)
        confirmed = Boolean(payload?.status?.confirmed)
      } else {
        console.warn('[abyss/burns/check] Mempool status request failed', response.status)
      }
    } catch (error) {
      console.warn('[abyss/burns/check] Failed to fetch mempool status:', error)
    }

    const currentStatus = existing.rows[0]?.status ?? 'pending'
    const nextStatus = confirmed ? 'confirmed' : currentStatus

    const updatedRecordResult = await pool.query(
      `
        UPDATE abyss_burns
        SET status = $2,
            confirmed_at = CASE WHEN $2 = 'confirmed' THEN NOW() ELSE confirmed_at END,
            updated_at = NOW(),
            last_checked_at = NOW()
        WHERE tx_id = $1
        RETURNING inscription_id,
                  tx_id,
                  ordinal_wallet,
                  payment_wallet,
                  status,
                  created_at,
                  updated_at,
                  confirmed_at
      `,
      [txId, nextStatus],
    )

    const updatedRecord = updatedRecordResult.rows[0]

    const summaryResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed FROM abyss_burns`,
    )
    const summary = summarizeRow(summaryResult.rows[0])

    return NextResponse.json({
      success: true,
      confirmed,
      summary,
      cap: ABYSS_CAP,
      record: updatedRecord
        ? {
            inscriptionId: updatedRecord.inscription_id,
            txId: updatedRecord.tx_id,
            ordinalWallet: updatedRecord.ordinal_wallet,
            paymentWallet: updatedRecord.payment_wallet,
            status: updatedRecord.status,
            createdAt: updatedRecord.created_at,
            updatedAt: updatedRecord.updated_at,
            confirmedAt: updatedRecord.confirmed_at,
          }
        : null,
    })
  } catch (error) {
    console.error('[abyss/burns/check][POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to check burn status.' }, { status: 500 })
  }
}


