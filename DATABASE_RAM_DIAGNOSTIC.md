# Database RAM Usage - Additional Diagnostics

## Understanding the Dashboard

The dashboard shows:
- **Allocated: 1.07 GB** - This is your **minimum compute setting** (0.25 CU = ~1 GB)
- **Used: 660 MB** - Active data in memory
- **Cached: 711 MB** - PostgreSQL cache (normal and beneficial)

**This is NORMAL PostgreSQL behavior!** The database is designed to cache frequently accessed data in RAM for performance.

## Why RAM Stays Constant

1. **Minimum Compute Setting**: Your database has `Min: 0.25 CU (~1 GB RAM)`, which means it **always allocates 1 GB** even when idle. This prevents autosuspend.

2. **PostgreSQL Caching**: PostgreSQL uses RAM to cache:
   - Frequently accessed tables
   - Indexes
   - Query results
   - Connection metadata

3. **Regular Activity**: The periodic updates every 10-15 minutes keep the database active, preventing it from suspending.

## Is This a Problem?

**No, if:**
- RAM usage stays around 1 GB (your minimum)
- No continuous growth over days/weeks
- Database performance is good

**Yes, if:**
- RAM usage grows continuously over time
- You see many "idle in transaction" connections
- Database becomes slow

## How to Verify Connection Leaks Are Fixed

Run this SQL query in your database to check for leaked connections:

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
  LEFT(query, 100) as query_preview
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY state_change;
```

**Expected Result**: Should return 0 rows (or very few that clear quickly)

**If you see many rows**: There are still connection leaks.

## Additional Checks

### 1. Check Long-Running Queries

```sql
SELECT 
  pid,
  now() - query_start AS duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
  AND now() - query_start > interval '5 seconds'
ORDER BY duration DESC;
```

### 2. Check Active Connections

```sql
SELECT 
  state,
  COUNT(*) as count
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count DESC;
```

### 3. Check Connection Pool Stats

Visit: `/api/health/db-pool`

Look for:
- `waiting > 0` - Connections are exhausted
- `utilization > 80%` - Pool is heavily used
- `active` connections staying high

## Reducing RAM Usage (If Needed)

### Option 1: Lower Minimum Compute

If you want the database to suspend when idle:
- Set `Min: 0` (or remove minimum)
- Increase `Autosuspend delay` to 5-10 minutes
- **Trade-off**: Cold starts when database wakes up

### Option 2: Optimize Queries

- Add indexes to frequently queried columns
- Use `LIMIT` clauses where appropriate
- Avoid `SELECT *` - only fetch needed columns
- Use pagination for large result sets

### Option 3: Reduce Cache Size

PostgreSQL automatically manages cache, but you can:
- Review `shared_buffers` setting (usually not needed)
- Clear cache: `SELECT pg_stat_reset()` (only for testing)

## What We Fixed

✅ **Connection leaks** - All 17 endpoints now properly release connections
✅ **Pool size** - Reduced from 10 to 5 to limit potential leaks
✅ **Transaction handling** - All transactions use dedicated client connections

## Expected Behavior After Fixes

1. **RAM stays at ~1 GB** (your minimum allocation) - ✅ Normal
2. **No continuous growth** - ✅ Should be stable
3. **Connections release properly** - ✅ Fixed
4. **No "idle in transaction" leaks** - ✅ Fixed

## If RAM Still Grows

If you see RAM growing continuously over days/weeks:

1. **Check for other leaks**:
   - Long-running queries
   - Unclosed cursors
   - Background processes holding connections

2. **Monitor connection pool**:
   - Check `/api/health/db-pool` regularly
   - Look for patterns in utilization

3. **Review cron jobs**:
   - Ensure they complete quickly
   - Check for queries that take too long

4. **Database-level issues**:
   - Check for table bloat
   - Review index usage
   - Consider VACUUM if needed

## Summary

**The constant ~1 GB RAM usage is likely NORMAL** - it's your minimum compute allocation plus PostgreSQL's caching.

The connection leaks we fixed will prevent RAM from **growing** over time, but the baseline ~1 GB is expected given your minimum compute setting.

To truly reduce RAM usage, you'd need to:
1. Lower or remove the minimum compute setting (allows autosuspend)
2. Accept cold starts when database wakes up
3. Or upgrade to a plan with better RAM management
