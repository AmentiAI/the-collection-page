-- Add total_fights column to mega_monsters table
ALTER TABLE mega_monsters 
ADD COLUMN IF NOT EXISTS total_fights INTEGER DEFAULT 0;

-- Create index for sorting by total fights
CREATE INDEX IF NOT EXISTS idx_mega_monsters_total_fights ON mega_monsters(total_fights DESC);

