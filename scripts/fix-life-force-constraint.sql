-- Fix life_force constraint to allow values greater than 100
-- The original constraint limited life_force to <= 100, but life_force_cap can exceed 100
-- This allows armies with bonuses to be healed to their full cap

-- Drop the existing constraint
ALTER TABLE battle_ordinals 
DROP CONSTRAINT IF EXISTS battle_ordinals_life_force_check;

-- Add new constraint that only checks lower bound (>= 0)
-- Upper bound is enforced by life_force_cap column and application logic
ALTER TABLE battle_ordinals 
ADD CONSTRAINT battle_ordinals_life_force_check 
CHECK (life_force >= 0);

