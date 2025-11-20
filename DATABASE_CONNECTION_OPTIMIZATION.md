# Database Connection Pool Optimization

## Problem

Your application was experiencing the error:
```
remaining connection slots are reserved for roles with the SUPERUSER attribute
```

This occurs when the PostgreSQL connection pool is exhausted - all available connections are in use and no more can be created.

## Root Causes

1. **Pool Size Too Large**: The connection pool was configured with `max: 20` connections, but Supabase/Neon typically only allows **5-10 total connections** on free/starter tiers.

2. **No Minimum Idle Connections Control**: The pool was maintaining idle connections unnecessarily.

3. **Slow Connection Release**: Idle connections were held for 30 seconds before being released.

4. **Redundant DDL Operations**: Many API routes run `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` queries on every request, which hold connections longer than necessary.

## Changes Made

### 1. Reduced Connection Pool Size (`lib/db.ts`)

**Before:**
```typescript
max: 20,
idleTimeoutMillis: 30000,
```

**After:**
```typescript
max: 5, // Supabase/Neon free tier has limited connections (5-10 max)
min: 0, // Don't maintain idle connections
idleTimeoutMillis: 10000, // Release idle connections faster (10 seconds)
```

### 2. Added Connection Pool Monitoring

Added logging and statistics tracking:
- Pool error events are always logged
- Connection lifecycle events (connect/acquire/remove) logged in development mode only
- New `getPoolStats()` function to check pool health
- New `executeQuery()` helper with better error logging

### 3. Created Health Check Endpoint

New endpoint: `/api/health/db-pool`

Returns pool statistics:
```json
{
  "status": "healthy",
  "pool": {
    "total": 3,
    "idle": 1,
    "waiting": 0,
    "active": 2,
    "utilization": "66.7%"
  },
  "timestamp": "2025-11-20T..."
}
```

Status values:
- `healthy`: Normal operation
- `warning`: Pool >80% utilized
- `critical`: Requests waiting for connections

### 4. Optimized Profile Page API Calls

**Before:** Profile page made 3 separate API calls to `/api/abyss/burns`:
- `?ascensionTotal=true`
- `?demonsRevived=true`  
- `?includeLeaderboard=true`

**After:** Single unified call with `?includeStats=true` returns all three values at once.

This reduces:
- Database queries from ~9 to ~3
- API requests from 3 to 1
- Connection usage by 66%

### 5. Added Table Initialization Caching

New helper functions in `lib/db.ts`:
- `markTableInitialized(tableName)` - Mark a table as initialized
- `isTableInitialized(tableName)` - Check if table was initialized
- `clearInitializationCache()` - Reset cache (for testing)

## Recommendations

### Immediate Actions

1. **Monitor the new health endpoint** regularly:
   ```bash
   curl https://your-app.vercel.app/api/health/db-pool
   ```

2. **Check your Supabase connection limit**:
   - Log into Supabase dashboard
   - Go to Database Settings
   - Check "Connection pooling" settings
   - Adjust `max: 5` in `lib/db.ts` if your limit is different

3. **Verify the fix worked** by checking your logs for the error message

### Future Optimizations

1. **Implement Table Initialization Caching**
   
   In routes that call `ensureAbyssBurnsTable()` or similar, add:
   ```typescript
   import { isTableInitialized, markTableInitialized } from '@/lib/db'
   
   async function ensureAbyssBurnsTable(pool: Pool) {
     if (isTableInitialized('abyss_burns')) {
       return // Skip if already initialized
     }
     
     // ... existing DDL queries ...
     
     markTableInitialized('abyss_burns')
   }
   ```

2. **Use Connection Pooling Mode in Supabase**
   
   In your Supabase project settings:
   - Enable "Transaction" pooling mode
   - This gives you more connections (up to 200+)
   - Update connection string in `.env` to use the pooler connection string

3. **Consider Supabase Edge Functions**
   
   For frequently-called endpoints, consider migrating to Supabase Edge Functions which have direct database access without connection limits.

4. **Add Request Caching**
   
   Your app already uses `getCachedRequest()` in some places. Consider expanding this to more read-heavy endpoints.

5. **Implement Query Timeout Protection**
   
   Add timeout wrappers for long-running queries:
   ```typescript
   const result = await Promise.race([
     pool.query(query, values),
     new Promise((_, reject) => 
       setTimeout(() => reject(new Error('Query timeout')), 5000)
     )
   ])
   ```

## Monitoring

### Watch for these warning signs:

1. **Pool utilization consistently >80%**: Consider reducing concurrent requests or increasing pool size (if your database tier supports it)

2. **Waiting connections > 0**: Immediate action needed - connections are exhausted

3. **Frequent "connection timeout" errors**: Either queries are too slow or pool is too small

4. **Many "Client removed from pool" events**: Indicates connections are being created/destroyed frequently (wasteful)

## Testing

Test the changes:

```bash
# Check pool health
curl https://your-app.vercel.app/api/health/db-pool

# Test profile page (should make fewer DB calls now)
# Open browser DevTools → Network tab
# Load profile page and count API requests to /api/abyss/burns
# Should see only 1 call with includeStats=true instead of 3 separate calls
```

## Rollback Plan

If issues occur, you can temporarily increase the pool size:

```typescript
// In lib/db.ts
max: 10, // Increase if your Supabase tier supports it
```

But this is NOT a long-term solution - you need to fix connection leaks or upgrade your database tier.

## Summary

**Before:**
- Pool: 20 connections (exceeds Supabase limit)
- Idle timeout: 30 seconds
- No monitoring
- Profile page: 3 API calls

**After:**
- Pool: 5 connections (within Supabase limits)
- Idle timeout: 10 seconds
- Full monitoring + health endpoint
- Profile page: 1 unified API call

**Expected Results:**
- No more "connection slots reserved for SUPERUSER" errors
- Faster response times (fewer API calls)
- Better visibility into connection usage
- More efficient resource usage

