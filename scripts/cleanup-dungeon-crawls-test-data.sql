-- Cleanup script to remove all dungeon crawl test data
-- WARNING: This will delete ALL dungeon crawl data!
-- Only run this if you're sure you want to delete everything

-- Delete in order to respect foreign key constraints
BEGIN;

-- Delete reward items (references instances)
DELETE FROM dungeon_crawl_reward_items;

-- Delete rewards (references instances)
DELETE FROM dungeon_crawl_rewards;

-- Delete participants (references instances)
DELETE FROM dungeon_crawl_participants;

-- Delete instances (references crawls)
DELETE FROM dungeon_crawl_instances;

-- Delete crawl configurations
DELETE FROM dungeon_crawls;

COMMIT;

-- Verify cleanup
SELECT 
  (SELECT COUNT(*) FROM dungeon_crawls) as crawls_remaining,
  (SELECT COUNT(*) FROM dungeon_crawl_instances) as instances_remaining,
  (SELECT COUNT(*) FROM dungeon_crawl_participants) as participants_remaining,
  (SELECT COUNT(*) FROM dungeon_crawl_rewards) as rewards_remaining,
  (SELECT COUNT(*) FROM dungeon_crawl_reward_items) as reward_items_remaining;









