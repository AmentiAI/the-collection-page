-- Create leaderboard stats table for Angels vs Demons
CREATE TABLE IF NOT EXISTS angel_demon_leaderboard (
  side TEXT PRIMARY KEY CHECK (side IN ('Angelic', 'Demonic')),
  total_battles BIGINT NOT NULL DEFAULT 0,
  total_deaths BIGINT NOT NULL DEFAULT 0,
  total_resurrections BIGINT NOT NULL DEFAULT 0,
  score BIGINT NOT NULL DEFAULT 0, -- Calculated: total_battles - total_deaths
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial rows for both sides
INSERT INTO angel_demon_leaderboard (side, total_battles, total_deaths, total_resurrections, score)
VALUES 
  ('Angelic', 0, 0, 0, 0),
  ('Demonic', 0, 0, 0, 0)
ON CONFLICT (side) DO NOTHING;

-- Create index on score for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON angel_demon_leaderboard(score DESC);

-- Create function to update score automatically
CREATE OR REPLACE FUNCTION update_leaderboard_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate score: battles - deaths
  NEW.score = NEW.total_battles - NEW.total_deaths;
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update score
CREATE TRIGGER leaderboard_score_update
  BEFORE INSERT OR UPDATE ON angel_demon_leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION update_leaderboard_score();

