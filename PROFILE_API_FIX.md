# Profile API Fix - Table Structure Corrections

## Problem
The `/api/profile-with-data` endpoint was not showing:
- Discord name and avatar
- Executioner Role status
- Bonus Burns count
- Portal Summoner status

## Root Cause
The endpoint was querying **incorrect table names** that don't exist in the database:
- ❌ `damned_profiles` (doesn't exist)
- ❌ `ascension_circles` (wrong table for summons)
- ✅ `profiles` (correct)
- ✅ `abyss_summons` (correct for summons)
- ✅ `damned_pool_circles` (correct for portals)

## Fixes Applied

### 1. **Profile Table Query**
**Before:**
```sql
SELECT username, avatar_url, total_good_karma, total_bad_karma, chosen_side
FROM damned_profiles  -- ❌ Table doesn't exist
WHERE LOWER(ordinal_wallet) = $1
```

**After:**
```sql
SELECT id, username, avatar_url, total_good_karma, total_bad_karma, chosen_side, bonus_allowance
FROM profiles  -- ✅ Correct table
WHERE LOWER(wallet_address) = $1  -- ✅ Correct column
```

### 2. **Social Connections (Discord/Twitter)**
**Before:**
```sql
SELECT discord_user_id, discord_username, twitter_user_id, twitter_username
FROM damned_profiles  -- ❌ Wrong - socials in separate tables
```

**After:**
```sql
SELECT du.discord_user_id, tu.twitter_user_id, tu.twitter_username
FROM profiles p
LEFT JOIN discord_users du ON du.profile_id = p.id  -- ✅ Separate table with FK
LEFT JOIN twitter_users tu ON tu.profile_id = p.id  -- ✅ Separate table with FK
WHERE LOWER(p.wallet_address) = $1
```

### 3. **Summons Count Query**
**Before:**
```sql
-- Used wrong table name
FROM ascension_circles  -- ❌ Wrong table
JOIN ascension_circle_participants  -- ❌ Wrong table
```

**After:**
```sql
-- Using correct abyss summons tables
FROM abyss_summons  -- ✅ Correct
JOIN abyss_summon_participants  -- ✅ Correct
```

### 4. **Portal Summary Query**
**Before:**
```sql
FROM ascension_circles WHERE circle_type = 'damned_pool'  -- ❌ Wrong table
JOIN ascension_circle_participants  -- ❌ Wrong table
```

**After:**
```sql
FROM damned_pool_circles  -- ✅ Correct - portals have own table
JOIN damned_pool_participants  -- ✅ Correct
```

### 5. **Bonus Allowance**
**Before:** Queried separately from `damned_profiles`

**After:** Fetched from `profiles.bonus_allowance` column in initial profile query

## Database Schema Clarification

### Profiles & Social
```
profiles (main table)
├── id (PK)
├── wallet_address
├── username
├── avatar_url
├── bonus_allowance
└── ...

discord_users
├── id (PK)
├── profile_id (FK → profiles.id)
└── discord_user_id

twitter_users
├── id (PK)
├── profile_id (FK → profiles.id)
├── twitter_user_id
└── twitter_username
```

### Summons System
```
abyss_summons
├── id (PK)
├── creator_wallet
├── status
└── ...

abyss_summon_participants
├── id (PK)
├── summon_id (FK → abyss_summons.id)
├── wallet
└── ...
```

### Portal System (Damned Pool)
```
damned_pool_circles
├── id (PK)
├── creator_wallet
├── status
└── ...

damned_pool_participants
├── id (PK)
├── circle_id (FK → damned_pool_circles.id)
├── wallet
└── ...
```

## Testing Checklist
- ✅ Discord name and avatar now display correctly
- ✅ Executioner role shows correct status (based on abyss_burns records)
- ✅ Bonus burns count displays correctly (from profiles.bonus_allowance)
- ✅ Portal summoner status shows correctly (based on completed portals)
- ✅ All counts are accurate (using correct table names)
- ✅ No linter errors
- ✅ Optimized queries (counts instead of full records)

## Performance
All queries remain optimized:
- Parallel execution with `Promise.allSettled()`
- COUNT queries instead of full record dumps
- LEFT JOINs for optional social connections
- No N+1 query problems

