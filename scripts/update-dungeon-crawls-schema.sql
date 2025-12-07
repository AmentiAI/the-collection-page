-- Update dungeon_crawls table schema
-- Changes:
-- 1. Rename restart_interval_hours to restart_after_failure_hours
-- 2. Rename cooldown_days to cooldown_hours (convert existing values)
-- 3. Add never_restart_after_completion boolean
-- 4. Remove reward_duration_hours (rewards are now permanent)

-- Add new columns (using DO block for better compatibility)
DO $$
BEGIN
  -- Add restart_after_failure_hours if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dungeon_crawls' 
    AND column_name = 'restart_after_failure_hours'
  ) THEN
    ALTER TABLE dungeon_crawls ADD COLUMN restart_after_failure_hours INTEGER;
  END IF;

  -- Add cooldown_hours if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dungeon_crawls' 
    AND column_name = 'cooldown_hours'
  ) THEN
    ALTER TABLE dungeon_crawls ADD COLUMN cooldown_hours INTEGER;
  END IF;

  -- Add never_restart_after_completion if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'dungeon_crawls' 
    AND column_name = 'never_restart_after_completion'
  ) THEN
    ALTER TABLE dungeon_crawls ADD COLUMN never_restart_after_completion BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Migrate existing data
UPDATE dungeon_crawls
SET 
  restart_after_failure_hours = COALESCE(restart_after_failure_hours, restart_interval_hours, 2),
  cooldown_hours = COALESCE(cooldown_hours, COALESCE(cooldown_days, 7) * 24, 168),
  never_restart_after_completion = COALESCE(never_restart_after_completion, FALSE);

-- Set defaults for new columns
ALTER TABLE dungeon_crawls
  ALTER COLUMN restart_after_failure_hours SET DEFAULT 2,
  ALTER COLUMN cooldown_hours SET DEFAULT 168,
  ALTER COLUMN restart_after_failure_hours SET NOT NULL,
  ALTER COLUMN cooldown_hours SET NOT NULL;

-- Drop old columns (optional - comment out if you want to keep them for now)
-- ALTER TABLE dungeon_crawls DROP COLUMN IF EXISTS restart_interval_hours;
-- ALTER TABLE dungeon_crawls DROP COLUMN IF EXISTS cooldown_days;
-- ALTER TABLE dungeon_crawls DROP COLUMN IF EXISTS reward_duration_hours;

