# Simplified Dungeon Crawl Timing System

## Overview
The new system uses a central `dungeon_crawl_timing` table to control all timing and level states, making the system much simpler and easier to maintain.

## Key Changes

### 1. Central Timing Table
- **Table**: `dungeon_crawl_timing`
- **Purpose**: Single source of truth for all timing and level states
- **Key Fields**:
  - `instance_started_at` / `instance_ended_at` - When instance started/finished
  - `instance_status` - 'active', 'completed', or 'failed'
  - `level_1_started_at` / `level_1_ended_at` / `level_1_active` - Level 1 timing and state
  - `level_2_started_at` / `level_2_ended_at` / `level_2_active` - Level 2 timing and state
  - `level_3_started_at` / `level_3_ended_at` / `level_3_active` - Level 3 timing and state
  - `next_instance_starts_at` - When the next instance should be created

### 2. Simplified Logic

#### Creating New Instances
- Check `shouldCreateNewInstance()` helper function
- Uses timing table to determine if cooldown/restart delay has passed
- No complex queries needed - just check timing table

#### Level States
- Check timing table: `level_X_active` boolean
- Check timing table: `level_X_started_at` and `level_X_ended_at` for window calculations
- No need to calculate from instance status - it's all in the timing table

#### Window Calculations
- Use `calculateLevelWindow()` helper
- Base time is always `level_1_started_at` from timing table
- Simple addition of window start/duration minutes

### 3. Migration Path
1. Run `scripts/create-dungeon-crawl-timing-table.sql` to create the table
2. Update API routes to use timing helpers from `lib/dungeon-crawl-timing.ts`
3. Update instance creation to set timing table
4. Update level completion to update timing table
5. Frontend can use timing table directly for simpler state management

## Benefits
- **Simpler**: One table controls everything
- **Clearer**: Easy to see when things happen
- **Easier to debug**: All timing in one place
- **Better performance**: Fewer complex queries
- **Easier to extend**: Add new timing features easily

