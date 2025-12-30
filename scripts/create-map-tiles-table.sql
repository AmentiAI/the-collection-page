-- Create map_tiles table to store AI-generated tiles
CREATE TABLE IF NOT EXISTS map_tiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoom_level INTEGER NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  prompt TEXT,
  image_blob_url TEXT,
  image_data TEXT, -- base64 for preview
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(zoom_level, tile_x, tile_y)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_map_tiles_coords ON map_tiles(zoom_level, tile_x, tile_y);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_map_tiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER map_tiles_updated_at
  BEFORE UPDATE ON map_tiles
  FOR EACH ROW
  EXECUTE FUNCTION update_map_tiles_updated_at();










