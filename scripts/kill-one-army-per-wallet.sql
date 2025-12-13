-- Script to kill exactly one army per wallet
-- For each wallet_address, sets one army to life_force = 0 and is_dead = TRUE
-- If a wallet has multiple armies, only one will be killed
-- If a wallet has only one army, that one will be killed

-- First, let's see what we're working with
SELECT 
  wallet_address,
  COUNT(*) as total_armies,
  COUNT(*) FILTER (WHERE is_dead = true) as already_dead,
  COUNT(*) FILTER (WHERE is_dead = false) as alive
FROM battle_ordinals
WHERE wallet_address IS NOT NULL
GROUP BY wallet_address
ORDER BY total_armies DESC
LIMIT 10;

-- Update: Kill one army per wallet
-- This picks the army with the lowest life_force (or lowest id if tied) for each wallet
-- Only updates armies that are not already dead
WITH wallet_armies AS (
  SELECT 
    id,
    wallet_address,
    ROW_NUMBER() OVER (
      PARTITION BY wallet_address 
      ORDER BY life_force ASC, id ASC
    ) as row_num
  FROM battle_ordinals
  WHERE wallet_address IS NOT NULL
    AND is_dead = false
),
armies_to_kill AS (
  SELECT id
  FROM wallet_armies
  WHERE row_num = 1
)
UPDATE battle_ordinals bo
SET 
  life_force = 0,
  is_dead = true,
  death_time = NOW(),
  updated_at = NOW()
FROM armies_to_kill atk
WHERE bo.id = atk.id;

-- Show results after update
SELECT 
  wallet_address,
  COUNT(*) as total_armies,
  COUNT(*) FILTER (WHERE is_dead = true) as dead_count,
  COUNT(*) FILTER (WHERE is_dead = false) as alive_count
FROM battle_ordinals
WHERE wallet_address IS NOT NULL
GROUP BY wallet_address
ORDER BY total_armies DESC
LIMIT 10;

