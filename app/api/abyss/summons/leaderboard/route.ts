import { NextResponse } from 'next/server'
import type { Pool } from 'pg'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureSummonInfrastructure(pool: Pool) {
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
      inscription_image TEXT,
      role TEXT NOT NULL DEFAULT 'participant',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(summon_id, wallet),
      UNIQUE(summon_id, inscription_id)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_summon ON abyss_summon_participants(summon_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_abyss_summon_participants_wallet ON abyss_summon_participants((LOWER(wallet)))`)
  await pool.query(`ALTER TABLE abyss_summon_participants ADD COLUMN IF NOT EXISTS inscription_image TEXT`)
}

export async function GET() {
  try {
    const pool = getPool()
    await ensureSummonInfrastructure(pool)

    const result = await pool.query(`
      WITH completed_summons AS (
        SELECT id, LOWER(creator_wallet) AS wallet, completed_at
        FROM abyss_summons
        WHERE status = 'completed'
      ),
      hosted AS (
        SELECT wallet, COUNT(*) AS hosted_count, MAX(completed_at) AS last_hosted_at
        FROM completed_summons
        GROUP BY wallet
      ),
      participation AS (
        SELECT LOWER(asp.wallet) AS wallet,
               COUNT(*) AS participations,
               MAX(s.completed_at) AS last_participated_at
        FROM abyss_summon_participants asp
        INNER JOIN abyss_summons s ON s.id = asp.summon_id
        WHERE s.status = 'completed'
        GROUP BY LOWER(asp.wallet)
      ),
      burns AS (
        SELECT LOWER(ordinal_wallet) AS wallet,
               COUNT(*) AS burn_count,
               COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_burn_count,
               MAX(updated_at) AS last_burn_at
        FROM abyss_burns
        GROUP BY LOWER(ordinal_wallet)
      ),
      combined AS (
        SELECT wallet FROM hosted
        UNION
        SELECT wallet FROM participation
      )
      SELECT
        c.wallet,
        COALESCE(b.burn_count, 0) AS burns,
        COALESCE(b.confirmed_burn_count, 0) AS confirmed_burns,
        COALESCE(h.hosted_count, 0) AS hosted,
        COALESCE(p.participations, 0) AS participated,
        b.last_burn_at,
        h.last_hosted_at,
        p.last_participated_at,
        (COALESCE(b.burn_count, 0) * 4)
          + (COALESCE(h.hosted_count, 0) * 2)
          + (COALESCE(p.participations, 0) * 1) AS score
      FROM combined c
      LEFT JOIN burns b ON b.wallet = c.wallet
      LEFT JOIN hosted h ON h.wallet = c.wallet
      LEFT JOIN participation p ON p.wallet = c.wallet
      WHERE COALESCE(h.hosted_count, 0) > 0 OR COALESCE(p.participations, 0) > 0
      ORDER BY score DESC, burns DESC, hosted DESC, participated DESC, c.wallet
    `)

    const entries = result.rows.map((row) => ({
      wallet: (row.wallet ?? '').toString(),
      burns: Number(row.burns ?? 0),
      confirmedBurns: Number(row.confirmed_burns ?? 0),
      hosted: Number(row.hosted ?? 0),
      participated: Number(row.participated ?? 0),
      score: Number(row.score ?? 0),
      lastBurnAt: row.last_burn_at ? new Date(row.last_burn_at).toISOString() : null,
      lastHostedAt: row.last_hosted_at ? new Date(row.last_hosted_at).toISOString() : null,
      lastParticipatedAt: row.last_participated_at ? new Date(row.last_participated_at).toISOString() : null,
    }))

    return NextResponse.json({ success: true, entries })
  } catch (error) {
    console.error('[abyss/summons/leaderboard][GET]', error)
    const message = error instanceof Error ? error.message : 'Failed to load summoning leaderboard.'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}


