-- Create table to track heal history
CREATE TABLE IF NOT EXISTS heal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  healed_count INTEGER NOT NULL DEFAULT 0,
  healed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_heal_history_wallet ON heal_history(LOWER(wallet_address), healed_at DESC);
CREATE INDEX IF NOT EXISTS idx_heal_history_created ON heal_history(healed_at DESC);

