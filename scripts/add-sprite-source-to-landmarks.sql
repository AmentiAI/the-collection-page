-- Add sprite_source column to landmarks table
-- This tracks which image file the sprite was cropped from (landmarks.png or landmarks2.png)
ALTER TABLE landmarks 
ADD COLUMN IF NOT EXISTS sprite_source TEXT DEFAULT 'landmarks.png' CHECK (sprite_source IN ('landmarks.png', 'landmarks2.png'));

-- Update existing landmarks to use landmarks.png as default
UPDATE landmarks 
SET sprite_source = 'landmarks.png' 
WHERE sprite_source IS NULL;

