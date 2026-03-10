import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureTable() {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matchmaking_queue (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      player_id TEXT NOT NULL,
      fighter_data JSONB NOT NULL,
      signed_psbt TEXT,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled')),
      opponent_queue_id UUID,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
    )
  `)
  // Add signed_psbt column if table already existed without it
  await pool.query(`
    ALTER TABLE matchmaking_queue ADD COLUMN IF NOT EXISTS signed_psbt TEXT
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_matchmaking_status_joined
    ON matchmaking_queue (status, joined_at)
    WHERE status = 'waiting'
  `)
}

export async function POST(req: NextRequest) {
  const { player_id, fighter_data, signed_psbt } = await req.json()
  if (!player_id || !fighter_data) {
    return NextResponse.json({ error: 'player_id and fighter_data required' }, { status: 400 })
  }

  const pool = getPool()
  await ensureTable()

  const inscription_id: string = fighter_data?.id ?? ''

  // Clean expired and completed entries globally, then for this player
  await pool.query(`DELETE FROM matchmaking_queue WHERE expires_at < NOW()`)
  await pool.query(`DELETE FROM matchmaking_queue WHERE player_id = $1 AND status = 'completed'`, [player_id])

  // Try to atomically claim a waiting opponent
  // Must match same utxoValue (330 vs 330, 546 vs 546) — no cross-value matches
  const utxo_value = fighter_data?.utxoValue ?? 330
  const { rows: claimed } = await pool.query(`
    UPDATE matchmaking_queue
    SET status = 'matched'
    WHERE id = (
      SELECT id FROM matchmaking_queue
      WHERE status = 'waiting'
        AND player_id != $1
        AND ($2 = '' OR fighter_data->>'id' != $2)
        AND expires_at > NOW()
        AND (fighter_data->>'utxoValue')::int = $3
      ORDER BY joined_at ASC
      LIMIT 1
    )
    RETURNING id, fighter_data
  `, [player_id, inscription_id, utxo_value])

  if (claimed.length > 0) {
    const opp = claimed[0]
    // ON CONFLICT on active_player_key/active_inscription_key: if player already matched, update their entry
    const { rows: me } = await pool.query(`
      INSERT INTO matchmaking_queue (player_id, fighter_data, signed_psbt, status, opponent_queue_id, expires_at)
      VALUES ($1, $2, $3, 'matched', $4, NOW() + INTERVAL '24 hours')
      ON CONFLICT (active_player_key) WHERE active_player_key IS NOT NULL
        DO UPDATE SET fighter_data = EXCLUDED.fighter_data, signed_psbt = EXCLUDED.signed_psbt,
                      opponent_queue_id = EXCLUDED.opponent_queue_id, expires_at = EXCLUDED.expires_at
      RETURNING id
    `, [player_id, JSON.stringify(fighter_data), signed_psbt ?? null, opp.id])

    await pool.query(`UPDATE matchmaking_queue SET opponent_queue_id = $1 WHERE id = $2`, [me[0].id, opp.id])

    if (signed_psbt && inscription_id) {
      await pool.query(
        `UPDATE battle_commitments SET queue_id = $1, signed_psbt = $2 WHERE player_id = $3 AND inscription_id = $4`,
        [me[0].id, signed_psbt, player_id, inscription_id]
      ).catch(() => {})
    }

    return NextResponse.json({ matched: true, queue_id: me[0].id, opponent: opp.fighter_data })
  }

  // No one waiting — enter the queue atomically (ON CONFLICT = player already waiting, just update their fighter/psbt)
  const { rows: me } = await pool.query(`
    INSERT INTO matchmaking_queue (player_id, fighter_data, signed_psbt, expires_at)
    VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
    ON CONFLICT (active_player_key) WHERE active_player_key IS NOT NULL
      DO UPDATE SET fighter_data = EXCLUDED.fighter_data, signed_psbt = EXCLUDED.signed_psbt,
                    expires_at = EXCLUDED.expires_at
    RETURNING id
  `, [player_id, JSON.stringify(fighter_data), signed_psbt ?? null])

  // Update battle_commitments with the real queue_id and signed PSBT
  if (signed_psbt && inscription_id) {
    await pool.query(
      `UPDATE battle_commitments SET queue_id = $1, signed_psbt = $2 WHERE player_id = $3 AND inscription_id = $4`,
      [me[0].id, signed_psbt, player_id, inscription_id]
    ).catch(() => {})
  }

  return NextResponse.json({ matched: false, queue_id: me[0].id })
}
