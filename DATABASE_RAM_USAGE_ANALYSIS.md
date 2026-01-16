# Database RAM Usage Analysis - 24/7 High Memory Usage

## Problem
Database is using RAM 24/7, indicating connections are not being released properly.

## Root Causes Identified

### 1. 🔴 CRITICAL: Connection Leaks (13 endpoints remaining)
**Impact: VERY HIGH**

13 API endpoints still use `pool.query('BEGIN')` without dedicated client connections:
- When `pool.query('BEGIN')` is called, it gets a connection from the pool
- Subsequent `pool.query()` calls may get **DIFFERENT** connections
- If an error occurs or early return happens, the connection with `BEGIN` stays in **"idle in transaction"** state
- These leaked connections consume RAM and are never released
- Eventually exhausts the connection pool

**Affected Endpoints:**
1. `app/api/profile/reset-karma/route.ts` (POST)
2. `app/api/afk-circle/reward/route.ts` (GET)
3. `app/api/wallet/link/route.ts` (POST)
4. `app/api/afk-circle/route.ts` (POST)
5. `app/api/ascension/ass-circles/[circleId]/dismiss/route.ts` (POST)
6. `app/api/dead-demons/circles/[circleId]/join/route.ts` (POST)
7. `app/api/dead-demons/circles/[circleId]/complete/route.ts` (POST)
8. `app/api/damned-pool/circles/[circleId]/join/route.ts` (POST)
9. `app/api/damned-pool/circles/[circleId]/complete/route.ts` (POST)
10. `app/api/ascension/circles/[circleId]/join/route.ts` (POST)
11. `app/api/ascension/circles/[circleId]/complete/route.ts` (POST)
12. `app/api/abyss/summons/[summonId]/join/route.ts` (POST)
13. `app/api/abyss/summons/[summonId]/complete/route.ts` (POST)

### 2. ⚠️ Pool Size Too High
**Impact: MEDIUM**

Current pool size is `max: 10` connections. If connections are leaking, all 10 can be stuck in "idle in transaction" state, consuming RAM continuously.

**Recommendation:** Reduce to `max: 5` until leaks are fixed.

### 3. ⚠️ Cron Jobs Running Continuously
**Impact: MEDIUM**

Multiple cron jobs run periodically and hold connections:
- `dungeon-crawl-restart`: Runs every minute
- `mega-monster-attack`: Runs periodically
- `sync-flashnet-pools`: Runs every 15 minutes
- `holders/cron-check`: Runs every 10 minutes

If these jobs have connection leaks or long-running queries, they keep connections open.

### 4. ⚠️ Client-Side Polling
**Impact: LOW-MEDIUM**

Even though optimized to 120 seconds, if many users have pages open:
- Multiple pages poll every 2 minutes
- Each poll creates a new connection
- If connections aren't released properly, they accumulate

## Solution

### Immediate Fix: Fix All Connection Leaks

**Pattern to Fix:**

**WRONG:**
```typescript
await pool.query('BEGIN')
try {
  await pool.query('SELECT ...') // Might get different connection!
  await pool.query('COMMIT')
} catch (error) {
  await pool.query('ROLLBACK') // Might rollback wrong connection!
}
```

**CORRECT:**
```typescript
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query('SELECT ...') // Same connection
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release() // ALWAYS release
}
```

### Secondary Fix: Reduce Pool Size

Temporarily reduce pool size to prevent too many leaked connections:
```typescript
max: 5, // Reduced from 10 until leaks are fixed
```

## Expected Results

After fixing all connection leaks:
- Connections will be properly released after transactions
- RAM usage should drop significantly
- No more "idle in transaction" connections
- Pool utilization should be normal

## Monitoring

Check for leaked connections:
```sql
SELECT 
  pid,
  usename,
  application_name,
  state,
  query_start,
  state_change,
  wait_event_type,
  wait_event,
  query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY state_change;
```

If you see many connections in "idle in transaction" state, those are leaked connections consuming RAM.
