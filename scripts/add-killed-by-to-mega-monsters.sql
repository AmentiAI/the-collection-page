-- Add killed_by column to mega_monsters table
-- This stores the inscription_id of the army that delivered the killing blow
ALTER TABLE mega_monsters 
ADD COLUMN IF NOT EXISTS killed_by TEXT;

-- Create index on killed_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_mega_monsters_killed_by ON mega_monsters(killed_by);

-- Add comment to explain the column
COMMENT ON COLUMN mega_monsters.killed_by IS 'The inscription_id of the army that delivered the killing blow when health reached 0';

