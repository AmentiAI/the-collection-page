-- Update landmarks_sprite_source_check constraint to include marker3.png
-- First, drop the existing constraint
ALTER TABLE landmarks 
DROP CONSTRAINT IF EXISTS landmarks_sprite_source_check;

-- Add the new constraint that includes marker3.png
ALTER TABLE landmarks 
ADD CONSTRAINT landmarks_sprite_source_check 
CHECK (sprite_source IN ('landmarks.png', 'landmarks2.png', 'marker3.png'));

