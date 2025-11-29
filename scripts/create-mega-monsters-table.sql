-- Create mega_monsters table for admin-generated mega monster images
CREATE TABLE IF NOT EXISTS mega_monsters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT,
  inscription_id TEXT,
  commit_txid TEXT,
  broadcast_txid TEXT,
  prompt TEXT NOT NULL,
  image_data TEXT,
  image_blob_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on wallet_address for faster lookups
CREATE INDEX IF NOT EXISTS idx_mega_monsters_wallet ON mega_monsters(wallet_address);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_mega_monsters_created_at ON mega_monsters(created_at DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_mega_monsters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mega_monsters_updated_at
  BEFORE UPDATE ON mega_monsters
  FOR EACH ROW
  EXECUTE FUNCTION update_mega_monsters_updated_at();

