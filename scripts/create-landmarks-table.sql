-- Create landmarks table to store landmark positions and sprite data
CREATE TABLE IF NOT EXISTS landmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('demonic', 'angelic')),
  sprite_x INTEGER NOT NULL,
  sprite_y INTEGER NOT NULL,
  sprite_width INTEGER NOT NULL,
  sprite_height INTEGER NOT NULL,
  map_x INTEGER NOT NULL CHECK (map_x >= 0 AND map_x <= 4096),
  map_y INTEGER NOT NULL CHECK (map_y >= 0 AND map_y <= 2728),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_landmarks_type ON landmarks(type);
CREATE INDEX IF NOT EXISTS idx_landmarks_map_position ON landmarks(map_x, map_y);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_landmarks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER landmarks_updated_at
  BEFORE UPDATE ON landmarks
  FOR EACH ROW
  EXECUTE FUNCTION update_landmarks_updated_at();

