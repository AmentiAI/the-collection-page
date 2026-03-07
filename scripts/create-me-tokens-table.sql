-- TABLE 1: me_inscriptions
-- Lightweight index of every inscription ID. Mutable fields (owner, listed,
-- price) live here so they can be updated cheaply with HOT updates.

CREATE TABLE IF NOT EXISTS me_inscriptions (
  inscription_id        TEXT PRIMARY KEY,   -- `id` field from API
  collection_symbol     TEXT NOT NULL,
  inscription_number    BIGINT,
  owner                 TEXT,
  listed                BOOLEAN,
  listed_price          BIGINT,             -- sats
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
) WITH (fillfactor = 80);

CREATE INDEX IF NOT EXISTS idx_me_inscriptions_collection ON me_inscriptions(collection_symbol);
CREATE INDEX IF NOT EXISTS idx_me_inscriptions_owner      ON me_inscriptions(owner);
CREATE INDEX IF NOT EXISTS idx_me_inscriptions_listed     ON me_inscriptions(listed) WHERE listed = true;
CREATE INDEX IF NOT EXISTS idx_me_inscriptions_number     ON me_inscriptions(inscription_number);


-- TABLE 2: me_token_details
-- Full static/semi-static detail record. One-to-one with me_inscriptions.
-- Fields sourced from real API response (`tokens` array, `id` as inscription id).

CREATE TABLE IF NOT EXISTS me_token_details (
  inscription_id                  TEXT PRIMARY KEY REFERENCES me_inscriptions(inscription_id) ON DELETE CASCADE,
  collection_symbol               TEXT NOT NULL,
  chain                           TEXT,
  item_type                       TEXT,
  content_type                    TEXT,
  content_uri                     TEXT,
  content_preview_uri             TEXT,
  content_body                    TEXT,         -- present for some token types
  genesis_transaction             TEXT,
  genesis_block_height            INTEGER,
  genesis_block_time              TIMESTAMPTZ,
  genesis_block_hash              TEXT,
  sat                             BIGINT,
  sat_name                        TEXT,
  sat_rarity                      TEXT,
  sat_block_height                INTEGER,
  sat_block_time                  TIMESTAMPTZ,
  satributes                      JSONB,        -- array of rarity labels e.g. ["Common"]
  meta_name                       TEXT,
  display_name                    TEXT,
  attributes                      JSONB,        -- [{trait_type, value}, ...]
  location                        TEXT,
  location_block_height           INTEGER,
  location_block_time             TIMESTAMPTZ,
  location_block_hash             TEXT,
  output                          TEXT,
  output_value                    BIGINT,
  mempool_tx_id                   TEXT,
  mempool_tx_timestamp            TIMESTAMPTZ,
  listed_at                       TIMESTAMPTZ,
  listed_maker_fee_bp             INTEGER,
  listed_seller_receive_address   TEXT,
  listed_for_mint                 BOOLEAN,
  last_sale_price                 BIGINT,
  brc20_transfer_amt              NUMERIC,
  brc20_listed_unit_price         NUMERIC,
  domain                          TEXT,
  sac_address                     TEXT,
  sac_merkle_tree_size            BIGINT,
  has_transient_rbf_protection    BOOLEAN,
  collection_name                 TEXT,         -- from nested collection object
  collection_image_uri            TEXT,
  me_updated_at                   TIMESTAMPTZ,
  raw_data                        JSONB,
  fetched_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_me_token_details_collection ON me_token_details(collection_symbol);
CREATE INDEX IF NOT EXISTS idx_me_token_details_rarity     ON me_token_details(collection_symbol, sat_rarity);


-- TABLE 3: me_token_progress
-- Tracks pagination offset per collection for safe stop/resume.
-- No `total` field in the real API response -- pagination ends when
-- returned count < 100. Supply from me_collections used as reference only.

CREATE TABLE IF NOT EXISTS me_token_progress (
  collection_symbol   TEXT PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'in_progress' | 'complete' | 'error'
  last_offset         INTEGER NOT NULL DEFAULT 0,
  total_fetched       INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_me_token_progress_status ON me_token_progress(status);
