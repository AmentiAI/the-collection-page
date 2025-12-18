-- Create battle_ordinals table to track battle status for ordinals
CREATE TABLE IF NOT EXISTS battle_ordinals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  inscription_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'sanctuary')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_address, inscription_id)
);

-- Create index on wallet_address for faster lookups
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_wallet ON battle_ordinals(wallet_address);

-- Create index on inscription_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_inscription ON battle_ordinals(inscription_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_status ON battle_ordinals(status);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_battle_ordinals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER battle_ordinals_updated_at
  BEFORE UPDATE ON battle_ordinals
  FOR EACH ROW
  EXECUTE FUNCTION update_battle_ordinals_updated_at();







