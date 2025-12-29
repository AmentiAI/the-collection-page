-- Create table to track ordinals in horde chamber
CREATE TABLE IF NOT EXISTS horde_chamber_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  inscription_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ascension_powder_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'destroyed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_horde_chamber_wallet ON horde_chamber_records(LOWER(wallet_address), status);
CREATE INDEX IF NOT EXISTS idx_horde_chamber_inscription ON horde_chamber_records(inscription_id, status);
CREATE INDEX IF NOT EXISTS idx_horde_chamber_entered ON horde_chamber_records(entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_horde_chamber_status ON horde_chamber_records(status);

-- Create unique partial index to ensure only one active chamber entry per ordinal
CREATE UNIQUE INDEX IF NOT EXISTS idx_horde_chamber_unique_active 
ON horde_chamber_records(LOWER(wallet_address), inscription_id) 
WHERE status = 'active';

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_horde_chamber_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER horde_chamber_updated_at
  BEFORE UPDATE ON horde_chamber_records
  FOR EACH ROW
  EXECUTE FUNCTION update_horde_chamber_updated_at();

