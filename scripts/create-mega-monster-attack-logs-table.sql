-- Create mega_monster_attack_logs table to track individual attacks
CREATE TABLE IF NOT EXISTS mega_monster_attack_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monster_id UUID NOT NULL REFERENCES mega_monsters(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  army_id UUID NOT NULL REFERENCES battle_ordinals(id) ON DELETE CASCADE,
  damage INTEGER NOT NULL,
  was_blocked BOOLEAN NOT NULL DEFAULT false,
  life_force_before INTEGER NOT NULL,
  life_force_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_attack_logs_wallet ON mega_monster_attack_logs(wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attack_logs_army ON mega_monster_attack_logs(army_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attack_logs_monster ON mega_monster_attack_logs(monster_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attack_logs_created_at ON mega_monster_attack_logs(created_at DESC);

