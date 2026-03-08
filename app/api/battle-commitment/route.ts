import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureTable() {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battle_commitments (
      id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      queue_id       UUID,
      player_id      TEXT NOT NULL,
      inscription_id TEXT NOT NULL,
      txid           TEXT NOT NULL,
      vout           INTEGER NOT NULL,
      output_value   BIGINT NOT NULL,
      script_pubkey  TEXT NOT NULL,
      signed_psbt    TEXT NOT NULL,
      address        TEXT NOT NULL,
      public_key     TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (player_id, inscription_id)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bc_queue ON battle_commitments (queue_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bc_player ON battle_commitments (player_id)`)
}

// POST — save a signed commitment from a player
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { player_id, inscription_id, txid, vout, output_value, script_pubkey, signed_psbt, address, public_key, queue_id } = body

  if (!player_id || !inscription_id || !txid || vout == null || !output_value || !script_pubkey || !signed_psbt || !address) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const pool = getPool()
  await ensureTable()

  await pool.query(
    `INSERT INTO battle_commitments
       (queue_id, player_id, inscription_id, txid, vout, output_value, script_pubkey, signed_psbt, address, public_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (player_id, inscription_id)
     DO UPDATE SET
       queue_id     = EXCLUDED.queue_id,
       signed_psbt  = EXCLUDED.signed_psbt,
       script_pubkey = EXCLUDED.script_pubkey,
       output_value = EXCLUDED.output_value,
       public_key   = EXCLUDED.public_key,
       created_at   = NOW()`,
    [queue_id ?? null, player_id, inscription_id, txid, vout, output_value, script_pubkey, signed_psbt, address, public_key ?? null]
  )

  return NextResponse.json({ ok: true })
}

// GET — fetch commitments for a queue_id (for cron to build final tx)
export async function GET(req: NextRequest) {
  const queue_id = req.nextUrl.searchParams.get('queue_id')
  const player_id = req.nextUrl.searchParams.get('player_id')

  if (!queue_id && !player_id) {
    return NextResponse.json({ error: 'queue_id or player_id required' }, { status: 400 })
  }

  const pool = getPool()
  await ensureTable()

  if (queue_id) {
    const { rows } = await pool.query(
      `SELECT * FROM battle_commitments WHERE queue_id = $1 ORDER BY created_at`,
      [queue_id]
    )
    return NextResponse.json({ commitments: rows })
  }

  const { rows } = await pool.query(
    `SELECT * FROM battle_commitments WHERE player_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [player_id]
  )
  return NextResponse.json({ commitments: rows })
}
