import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

const ABYSS_CAP = 333
const DEFAULT_LIMIT = ABYSS_CAP

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

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()
    await ensureAbyssBurnsTable(pool)

    const { searchParams } = request.nextUrl
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), ABYSS_CAP) : DEFAULT_LIMIT
    const statusFilter = searchParams.get('status')?.trim().toLowerCase()

    const filters: string[] = []
    const values: unknown[] = []

    if (statusFilter && ['pending', 'confirmed', 'failed'].includes(statusFilter)) {
      filters.push(`LOWER(status) = LOWER($${values.length + 1})`)
      values.push(statusFilter)
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''

    const query = `
      SELECT id,
             inscription_id,
             tx_id,
             ordinal_wallet,
             payment_wallet,
             status,
             created_at,
             updated_at,
             confirmed_at,
             last_checked_at
      FROM abyss_burns
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `

    const result = await pool.query(query, values)

    return NextResponse.json({
      success: true,
      count: result.rowCount ?? 0,
      records: result.rows.map((row) => ({
        id: row.id,
        inscriptionId: row.inscription_id,
        txId: row.tx_id,
        ordinalWallet: row.ordinal_wallet,
        paymentWallet: row.payment_wallet,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        confirmedAt: row.confirmed_at,
        lastCheckedAt: row.last_checked_at,
      })),
    })
  } catch (error) {
    console.error('[abyss/burns/admin][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch abyss burn records.' }, { status: 500 })
  }
}


