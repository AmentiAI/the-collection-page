-- Add life_force column to battle_ordinals table
ALTER TABLE battle_ordinals 
ADD COLUMN IF NOT EXISTS life_force INTEGER DEFAULT 100 CHECK (life_force >= 0 AND life_force <= 100);

-- Create index on life_force for filtering/sorting
CREATE INDEX IF NOT EXISTS idx_battle_ordinals_life_force ON battle_ordinals(life_force);






