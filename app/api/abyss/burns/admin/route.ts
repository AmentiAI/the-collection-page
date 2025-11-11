import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

const ABYSS_CAP = 333
const DEFAULT_LIMIT = ABYSS_CAP

export const dynamic = 'force-dynamic'

async function ensureAbyssBurnsTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_burns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inscription_id TEXT UNIQUE NOT NULL,
      tx_id TEXT UNIQUE NOT NULL,
      ordinal_wallet TEXT NOT NULL,
      payment_wallet TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'abyss',
      summon_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ
    )
  `)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'abyss'`)
  await pool.query(`ALTER TABLE abyss_burns ADD COLUMN IF NOT EXISTS summon_id UUID`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_status ON abyss_burns(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_tx_id ON abyss_burns(tx_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_burns_source ON abyss_burns(source)`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_summons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_wallet TEXT NOT NULL,
      creator_inscription_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      required_participants INTEGER NOT NULL DEFAULT 4,
      locked_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      bonus_granted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summons_status ON abyss_summons(status)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summons_creator ON abyss_summons((LOWER(creator_wallet)))`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_summon_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      summon_id UUID NOT NULL REFERENCES abyss_summons(id) ON DELETE CASCADE,
      wallet TEXT NOT NULL,
      inscription_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'participant',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(summon_id, wallet),
      UNIQUE(summon_id, inscription_id)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_summon ON abyss_summon_participants(summon_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_wallet ON abyss_summon_participants((LOWER(wallet)))`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abyss_bonus_allowances (
      wallet TEXT PRIMARY KEY,
      available INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
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
             source,
             summon_id,
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
        source: row.source,
        summonId: row.summon_id,
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


