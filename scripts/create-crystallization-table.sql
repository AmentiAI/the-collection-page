-- Create table to track ordinals in crystallization
CREATE TABLE IF NOT EXISTS crystallization_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  inscription_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'claimed')),
  ascension_powder_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_crystallization_wallet ON crystallization_records(LOWER(wallet_address), status);
CREATE INDEX IF NOT EXISTS idx_crystallization_inscription ON crystallization_records(inscription_id, status);
CREATE INDEX IF NOT EXISTS idx_crystallization_entered ON crystallization_records(entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_crystallization_status ON crystallization_records(status);

-- Create unique partial index to ensure only one active crystallization per ordinal
CREATE UNIQUE INDEX IF NOT EXISTS idx_crystallization_unique_active 
ON crystallization_records(LOWER(wallet_address), inscription_id) 
WHERE status = 'active';

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_crystallization_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crystallization_updated_at
  BEFORE UPDATE ON crystallization_records
  FOR EACH ROW
  EXECUTE FUNCTION update_crystallization_updated_at();

