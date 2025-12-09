-- Global Settings Table
-- Stores global configuration settings like start times for pages

CREATE TABLE IF NOT EXISTS global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_global_settings_key ON global_settings(setting_key);

-- Insert default setting for global start time (null means no restriction)
INSERT INTO global_settings (setting_key, setting_value, description)
VALUES ('global_start_time', '', 'Global start time for pages: /battlez, /battlefield, /leaderboard, /dungeon-crawl, /crystallizationz, /abyss-summon. ISO 8601 timestamp. Empty string means no restriction.')
ON CONFLICT (setting_key) DO NOTHING;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_global_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER global_settings_updated_at
  BEFORE UPDATE ON global_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_global_settings_updated_at();

