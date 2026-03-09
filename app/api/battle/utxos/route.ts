import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/battle/utxos?queue_id=<uuid>
 *   OR /api/battle/utxos?player_id=<wallet>
 *
 * Returns both players' signed UTXO commitments for a matched battle,
 * formatted for building the combined PSBT.
 *
 * Response shape:
 * {
 *   match: {
 *     queue_id: string,
 *     status: string,
 *     ready: boolean,        // true when both players have committed
 *   },
 *   players: [
 *     {
 *       player_id: string,
 *       inscription_id: string,
 *       utxo: {
 *         txid: string,
 *         vout: number,
 *         value_sats: number,
 *         script_pubkey: string,  // hex
 *       },
 *       address: string,
 *       public_key: string | null,
 *       signed_psbt: string,      // base64 — input-only PSBT signed by player
 *       committed_at: string,
 *     }
 *   ]
 * }
 */
export async function GET(req: NextRequest) {
  const queue_id = req.nextUrl.searchParams.get('queue_id')
  const player_id = req.nextUrl.searchParams.get('player_id')

  if (!queue_id && !player_id) {
    return NextResponse.json({ error: 'queue_id or player_id required' }, { status: 400 })
  }

  const pool = getPool()

  // Resolve queue_id from player_id if needed
  let resolvedQueueId = queue_id

  if (!resolvedQueueId && player_id) {
    // Find the player's matched queue entry, then get both sides
    const { rows } = await pool.query(
      `SELECT id, status, opponent_queue_id
       FROM matchmaking_queue
       WHERE player_id = $1
         AND status = 'matched'
         AND expires_at > NOW()
       ORDER BY joined_at DESC
       LIMIT 1`,
      [player_id]
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'No active matched battle found for this player' }, { status: 404 })
    }

    // Use the player's own queue_id — commitments are linked by queue_id on both sides
    resolvedQueueId = rows[0].id
  }

  // Get the match record
  const { rows: matchRows } = await pool.query(
    `SELECT id, status, player_id, opponent_queue_id, expires_at
     FROM matchmaking_queue
     WHERE id = $1`,
    [resolvedQueueId]
  )

  if (!matchRows.length) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const match = matchRows[0]

  // Get both queue IDs in the match pair
  const queueIds = [match.id, match.opponent_queue_id].filter(Boolean)

  // Get all commitments linked to either queue entry
  const { rows: commitments } = await pool.query(
    `SELECT
       bc.player_id,
       bc.inscription_id,
       bc.txid,
       bc.vout,
       bc.output_value,
       bc.script_pubkey,
       bc.address,
       bc.public_key,
       bc.signed_psbt,
       bc.created_at,
       bc.queue_id AS commitment_queue_id
     FROM battle_commitments bc
     WHERE bc.queue_id = ANY($1)
     ORDER BY bc.created_at ASC`,
    [queueIds]
  )

  const players = commitments.map((c) => ({
    player_id: c.player_id,
    inscription_id: c.inscription_id,
    utxo: {
      txid: c.txid,
      vout: c.vout,
      value_sats: Number(c.output_value),
      script_pubkey: c.script_pubkey,
    },
    address: c.address,
    public_key: c.public_key ?? null,
    signed_psbt: c.signed_psbt,
    committed_at: c.created_at,
  }))

  return NextResponse.json({
    match: {
      queue_id: match.id,
      opponent_queue_id: match.opponent_queue_id,
      status: match.status,
      expires_at: match.expires_at,
      ready: players.length === 2,
    },
    players,
  })
}
