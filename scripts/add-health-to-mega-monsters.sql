-- Add health column to mega_monsters table
ALTER TABLE mega_monsters 
ADD COLUMN IF NOT EXISTS health INTEGER DEFAULT 15000;

-- Update existing records to have 15000 health if they don't have it set
UPDATE mega_monsters 
SET health = 15000 
WHERE health IS NULL;

-- Make health NOT NULL with default (after setting existing values)
ALTER TABLE mega_monsters 
ALTER COLUMN health SET DEFAULT 15000,
ALTER COLUMN health SET NOT NULL;

-- Create index on health for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_mega_monsters_health ON mega_monsters(health DESC);

