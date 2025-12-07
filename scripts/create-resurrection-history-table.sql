-- Create table to track resurrection history
CREATE TABLE IF NOT EXISTS resurrection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  inscription_id TEXT NOT NULL,
  trait TEXT CHECK (trait IN ('Angelic', 'Demonic')),
  resurrected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_resurrection_history_wallet ON resurrection_history(LOWER(wallet_address), resurrected_at DESC);
CREATE INDEX IF NOT EXISTS idx_resurrection_history_created ON resurrection_history(resurrected_at DESC);

