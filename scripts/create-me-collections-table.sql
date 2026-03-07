-- Create me_collections table for Magic Eden collection data
CREATE TABLE IF NOT EXISTS me_collections (
  slug                          TEXT PRIMARY KEY,
  name                          TEXT,
  description                   TEXT,
  chain                         TEXT,
  image_uri                     TEXT,
  inscription_icon              TEXT,
  supply                        INTEGER,
  twitter                       TEXT,
  discord                       TEXT,
  website                       TEXT,
  telegram                      TEXT,
  coin_market_cap               TEXT,
  creator_tips_address          TEXT,
  labels                        JSONB,
  enable_collection_offer       BOOLEAN,
  me_created_at                 TIMESTAMPTZ,
  raw_data                      JSONB,
  fetch_status                  TEXT NOT NULL DEFAULT 'success',
  fetched_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_me_collections_fetch_status ON me_collections(fetch_status);
CREATE INDEX IF NOT EXISTS idx_me_collections_supply ON me_collections(supply DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_me_collections_chain ON me_collections(chain);
