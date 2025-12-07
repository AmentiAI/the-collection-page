-- Create table to track daily ascension powder earnings from crystallization
CREATE TABLE IF NOT EXISTS crystallization_daily_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  date DATE NOT NULL,
  total_ascension_powder INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One record per wallet per day
  UNIQUE(wallet_address, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_crystallization_history_wallet ON crystallization_daily_history(LOWER(wallet_address), date DESC);
CREATE INDEX IF NOT EXISTS idx_crystallization_history_date ON crystallization_daily_history(date DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_crystallization_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crystallization_history_updated_at
  BEFORE UPDATE ON crystallization_daily_history
  FOR EACH ROW
  EXECUTE FUNCTION update_crystallization_history_updated_at();

