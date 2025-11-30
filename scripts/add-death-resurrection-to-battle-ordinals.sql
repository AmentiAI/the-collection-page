-- Add death and resurrection tracking to battle_ordinals table
ALTER TABLE battle_ordinals 
ADD COLUMN IF NOT EXISTS is_dead BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS death_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resurrection_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_heal_time TIMESTAMPTZ;

-- Create indexes for filtering dead armies and resurrection queries
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_is_dead ON battle_ordinals(is_dead);
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_resurrection_time ON battle_ordinals(resurrection_time);

