-- Add name and full_body_image_blob_url columns to mega_monsters table
ALTER TABLE mega_monsters 
ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE mega_monsters 
ADD COLUMN IF NOT EXISTS full_body_image_blob_url TEXT;

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_mega_monsters_name ON mega_monsters(name);

