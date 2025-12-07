-- Add archived_at column to dungeon_crawl_participants for preserving participant history
-- Instead of deleting participants when instances fail, we archive them

ALTER TABLE dungeon_crawl_participants 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add index for querying archived participants
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_participants_archived 
ON dungeon_crawl_participants(instance_id, archived_at) 
WHERE archived_at IS NOT NULL;

-- Add index for querying active (non-archived) participants
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_participants_active 
ON dungeon_crawl_participants(instance_id) 
WHERE archived_at IS NULL;

