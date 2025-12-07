-- Add allowed_traits column to dungeon_crawls table
-- Values: 'all' (default), 'angelic', 'demonic'

DO $$
BEGIN
  -- Check if column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dungeon_crawls' 
    AND column_name = 'allowed_traits'
  ) THEN
    ALTER TABLE dungeon_crawls
    ADD COLUMN allowed_traits TEXT NOT NULL DEFAULT 'all' 
    CHECK (allowed_traits IN ('all', 'angelic', 'demonic'));
  END IF;
END $$;


