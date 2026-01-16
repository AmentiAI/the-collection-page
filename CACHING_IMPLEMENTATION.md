# Database Query Caching Implementation

## Overview

Implemented intelligent caching for frequently accessed read-only endpoints to dramatically reduce database queries and RAM usage.

## What Was Added

### 1. Enhanced Caching Utility (`lib/db-cache.ts`)

- **In-memory cache** with configurable TTLs
- **Prevents duplicate requests** - if a request is in-flight, returns the same promise
- **Automatic cleanup** of expired entries
- **Cache statistics** for monitoring

### 2. Cached Endpoints

#### High-Impact Endpoints (Frequently Polled)

1. **`/api/abyss/summons`** - Cached for 10 seconds
   - Polled every 30 seconds by multiple users
   - **Impact**: Reduces DB queries by ~66% (cached for 1/3 of poll interval)

2. **`/api/dungeon-crawls`** - Cached for 30 seconds
   - Polled every 2 minutes by multiple users
   - **Impact**: Reduces DB queries by ~75% (cached for 1/4 of poll interval)

3. **`/api/crystallization/status`** - Cached for 15 seconds
   - Polled every 30 seconds
   - **Impact**: Reduces DB queries by ~50%

4. **`/api/abyss/burn-window`** - Cached for 5 seconds
   - Polled every 10 seconds
   - **Impact**: Reduces DB queries by ~50%

#### Medium-Impact Endpoints

5. **`/api/flashnet/pools`** - Already has some caching, can be enhanced
   - Updated by cron every 15 minutes
   - Can cache for 60 seconds safely

## Cache Invalidation

When data is modified via POST endpoints, cache is automatically invalidated:

- **`/api/abyss/summons` (POST)** - Invalidates `abyss-summons` cache
- **`/api/abyss/summons/[summonId]/join`** - Invalidates `abyss-summons` cache
- **`/api/abyss/summons/[summonId]/complete`** - Invalidates `abyss-summons` cache
- **`/api/dungeon-crawls/[instanceId]/join`** - Invalidates `dungeon-crawls` cache
- **`/api/dungeon-crawls/[instanceId]/complete-level`** - Invalidates `dungeon-crawls` cache

## Expected Results

### Before Caching
- 10 users polling `/api/abyss/summons` every 30s = **20 queries/minute**
- 10 users polling `/api/dungeon-crawls` every 2min = **5 queries/minute**
- 10 users polling `/api/crystallization/status` every 30s = **20 queries/minute**
- 10 users polling `/api/abyss/burn-window` every 10s = **60 queries/minute**
- **Total: ~105 queries/minute = 151,200 queries/day**

### After Caching
- 10 users polling `/api/abyss/summons` every 30s = **~7 queries/minute** (66% reduction)
- 10 users polling `/api/dungeon-crawls` every 2min = **~1 query/minute** (80% reduction)
- 10 users polling `/api/crystallization/status` every 30s = **~10 queries/minute** (50% reduction)
- 10 users polling `/api/abyss/burn-window` every 10s = **~30 queries/minute** (50% reduction)
- **Total: ~48 queries/minute = 69,120 queries/day**

**Reduction: ~54% fewer database queries = ~82,000 fewer queries per day**

## Cache TTL Strategy

TTLs are set based on:
1. **How often data changes** - Frequently changing data = shorter TTL
2. **How often it's polled** - Frequently polled = shorter TTL to balance freshness vs. load
3. **User expectations** - Real-time data needs shorter TTL

### TTL Guidelines

- **Very dynamic** (changes every few seconds): 5-10 seconds
- **Moderately dynamic** (changes every 30-60 seconds): 15-30 seconds
- **Semi-static** (changes every few minutes): 60-120 seconds
- **Static** (rarely changes): 5+ minutes

## Monitoring

Check cache effectiveness:

```typescript
import { getCacheStats } from '@/lib/db-cache'

const stats = getCacheStats()
console.log('Cache stats:', stats)
// {
//   totalEntries: 15,
//   validEntries: 12,
//   inFlightRequests: 2,
//   keys: ['abyss-summons:all:25:none', ...]
// }
```

## Future Enhancements

1. **Redis caching** - For multi-instance deployments
2. **Cache warming** - Pre-populate cache for popular endpoints
3. **Adaptive TTLs** - Adjust TTL based on how often data actually changes
4. **Cache hit/miss metrics** - Track cache effectiveness
5. **More endpoints** - Add caching to:
   - `/api/ascension/leaderboard`
   - `/api/gates/ratio` (if exists)
   - `/api/pooloflife/status`
   - `/api/horde/chamber/status`

## Notes

- Cache is **in-memory only** - resets on server restart (fine for serverless)
- Cache **prevents duplicate requests** - if 10 users request same data simultaneously, only 1 DB query runs
- Cache **automatically expires** - no stale data issues
- Cache **invalidates on writes** - ensures data consistency
