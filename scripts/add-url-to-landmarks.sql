-- Add url column to landmarks table
ALTER TABLE landmarks ADD COLUMN IF NOT EXISTS url TEXT;

