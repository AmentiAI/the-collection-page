-- Add battle statistics to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS battles_won INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS battles_lost INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS resurrections INTEGER DEFAULT 0;

-- Create indexes for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_battles_won ON profiles(battles_won DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_battles_lost ON profiles(battles_lost DESC);

