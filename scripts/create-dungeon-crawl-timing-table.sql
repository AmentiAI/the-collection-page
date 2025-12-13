-- Simplified Dungeon Crawl Timing System
-- Central table that controls all timing and level states

CREATE TABLE IF NOT EXISTS dungeon_crawl_timing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_id UUID NOT NULL REFERENCES dungeon_crawls(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES dungeon_crawl_instances(id) ON DELETE SET NULL,
  
  -- Instance timing
  instance_started_at TIMESTAMPTZ,
  instance_ended_at TIMESTAMPTZ,
  instance_status TEXT CHECK (instance_status IN ('active', 'completed', 'failed')),
  
  -- Level timing and states
  level_1_started_at TIMESTAMPTZ,
  level_1_ended_at TIMESTAMPTZ,
  level_1_active BOOLEAN NOT NULL DEFAULT FALSE,
  
  level_2_started_at TIMESTAMPTZ,
  level_2_ended_at TIMESTAMPTZ,
  level_2_active BOOLEAN NOT NULL DEFAULT FALSE,
  
  level_3_started_at TIMESTAMPTZ,
  level_3_ended_at TIMESTAMPTZ,
  level_3_active BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Next instance timing
  next_instance_starts_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_timing_crawl ON dungeon_crawl_timing(crawl_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_timing_active ON dungeon_crawl_timing(crawl_id, instance_status) WHERE instance_status = 'active';

-- Partial unique index: Only one active timing record per crawl
CREATE UNIQUE INDEX IF NOT EXISTS idx_dungeon_crawl_timing_unique_active 
  ON dungeon_crawl_timing(crawl_id) 
  WHERE instance_status = 'active';
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_timing_next ON dungeon_crawl_timing(next_instance_starts_at) WHERE next_instance_starts_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dungeon_crawl_timing_instance ON dungeon_crawl_timing(instance_id) WHERE instance_id IS NOT NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dungeon_crawl_timing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dungeon_crawl_timing_updated_at
  BEFORE UPDATE ON dungeon_crawl_timing
  FOR EACH ROW
  EXECUTE FUNCTION update_dungeon_crawl_timing_updated_at();

