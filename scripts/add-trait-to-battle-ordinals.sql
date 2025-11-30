-- Add trait column to battle_ordinals to track Angelic/Demonic
ALTER TABLE battle_ordinals 
ADD COLUMN IF NOT EXISTS trait TEXT CHECK (trait IN ('Angelic', 'Demonic'));

-- Create index on trait for fast filtering
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_trait ON battle_ordinals(trait);

-- Create composite index for common queries (trait + status + is_dead)
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_trait_status_dead ON battle_ordinals(trait, status, is_dead);

