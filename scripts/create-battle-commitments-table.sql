-- Stores the signed PSBT inputs from each player for the cron to combine into the final battle tx
CREATE TABLE IF NOT EXISTS battle_commitments (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id          UUID NOT NULL REFERENCES matchmaking_queue(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL,                  -- wallet address
  inscription_id    TEXT NOT NULL,                  -- ordinal being committed
  txid              TEXT NOT NULL,                  -- UTXO txid
  vout              INTEGER NOT NULL,               -- UTXO vout
  output_value      BIGINT NOT NULL,                -- sats
  script_pubkey     TEXT NOT NULL,                  -- hex-encoded scriptPubKey
  signed_psbt       TEXT NOT NULL,                  -- base64 signed PSBT (input only, no output)
  address           TEXT NOT NULL,                  -- taproot address
  public_key        TEXT,                           -- x-only pubkey (optional)
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (queue_id, player_id)                      -- one commitment per player per match
);

CREATE INDEX IF NOT EXISTS idx_battle_commitments_queue ON battle_commitments (queue_id);
CREATE INDEX IF NOT EXISTS idx_battle_commitments_player ON battle_commitments (player_id);
