# Professional Data Freshness Strategy for Spark Tokens

## Executive Summary

For trading platforms, **data freshness is critical**. Token prices can change dramatically in seconds, making 15-minute intervals unacceptable for traders. This document outlines professional best practices and practical solutions for our Vercel/serverless architecture.

## Industry Best Practices (Research Findings)

### 1. **WebSocket for Real-Time Updates** (Gold Standard)
- **Professional standard**: WebSocket connections for continuous, low-latency updates
- **Latency**: Sub-second updates vs. polling delays
- **Efficiency**: Push-based (only updates when data changes) vs. pull-based (constant polling)
- **Examples**: Binance, Coinbase, major exchanges all use WebSockets

**Sources:**
- [Real-time cryptocurrency price monitoring](https://sdlccorp.com/post/how-to-implement-real-time-price-monitoring-on-crypto-exchanges/)
- [Best practices for high-volume market data](https://finage.co.uk/blog/best-practices-for-handling-highvolume-market-data-in-your-app)

### 2. **Low Latency is Critical**
- **Slippage risk**: Even small delays cause trades to execute at wrong prices
- **Professional requirement**: < 1 second latency for trading data
- **Impact**: Minutes of delay = significant financial losses for traders

**Source:** [Why you need a cryptocurrency price API](https://www.coinapi.io/blog/why-you-need-a-cryptocurrency-price-api)

### 3. **Efficient Data Handling**
- **Time-series databases**: QuestDB, TimescaleDB for high-frequency data
- **Data pruning**: Only store necessary data, discard old data
- **Rolling buffers**: Keep recent data in memory, archive old data

**Source:** [Building a real-time cryptocurrency price tracker](https://redpanda-data.medium.com/building-a-real-time-cryptocurrency-price-tracker-fc2d4a45c92c)

## Our Current Constraints

### 1. **Vercel Serverless Limitations**
- ❌ **No persistent WebSocket connections** (serverless functions are stateless)
- ❌ **10-second execution limit** for free tier (60s for Pro)
- ⚠️ **Cron jobs**: Minimum 1-minute intervals
- ✅ **API Routes**: Can handle requests, but not persistent connections

### 2. **Flashnet SDK Limitations**
- ❌ **REST API only**: `client.listPools()` is HTTP-based, not WebSocket
- ⚠️ **No real-time subscriptions**: Must poll for updates
- ✅ **Batch support**: Can fetch multiple pools efficiently

### 3. **Database Architecture**
- ✅ **PostgreSQL**: Good for structured data, not optimized for time-series
- ⚠️ **No Redis cache**: Missing fast in-memory layer for hot data
- ✅ **Connection pooling**: Already implemented

## Professional Solutions (Within Our Constraints)

### Solution 1: **Hybrid Approach - Fast Polling + Client-Side Updates**

Since we can't use WebSockets, we'll use the fastest polling possible with smart client-side updates:

#### A. **Backend: Aggressive Cron Schedule**
```json
{
  "path": "/api/cron/sync-flashnet-pools",
  "schedule": "*/1 * * * *"  // Every 1 minute (Vercel minimum)
}
```

**Why 1 minute:**
- Vercel's minimum cron interval
- Balances freshness with API costs
- Still not real-time, but much better than 15 minutes

#### B. **Frontend: Client-Side Polling**
```typescript
// Poll every 30 seconds when page is active
useEffect(() => {
  fetchPools()
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      fetchPools()
    }
  }, 30000) // 30 seconds
  return () => clearInterval(interval)
}, [])
```

**Benefits:**
- Users see updates every 30 seconds (not 1 minute)
- Only polls when tab is visible (saves resources)
- Combines with backend updates for maximum freshness

#### C. **Separate Fast-Changing from Slow-Changing Data**

**Fast-changing (update every 1-2 minutes):**
- Prices (`current_price_a_in_b`)
- Volume (`volume_24h_asset_b`)
- TVL (`tvl_asset_b`)
- Price change (`price_change_percent_24h`)
- Reserves (`asset_a_reserve`, `asset_b_reserve`)

**Slow-changing (update every 15-30 minutes):**
- Token metadata (names, symbols, supply)
- Pool configuration (fees, curve type)
- Token addresses (never change)

### Solution 2: **Optimized Database Updates**

#### A. **Selective Updates**
Only update fields that change frequently:

```sql
-- Fast update query (only price/volume fields)
UPDATE flashnet_pools SET
  current_price_a_in_b = $1,
  volume_24h_asset_b = $2,
  tvl_asset_b = $3,
  price_change_percent_24h = $4,
  asset_a_reserve = $5,
  asset_b_reserve = $6,
  last_synced_at = NOW()
WHERE lp_public_key = $7
```

#### B. **Batch Updates**
Update multiple pools in a single transaction:

```typescript
// Update all pools in one query
await client.query(`
  UPDATE flashnet_pools AS p SET
    current_price_a_in_b = c.current_price_a_in_b,
    volume_24h_asset_b = c.volume_24h_asset_b,
    ...
  FROM (VALUES 
    ($1, $2, $3, ...),
    ($4, $5, $6, ...)
  ) AS c(...)
  WHERE p.lp_public_key = c.lp_public_key
`)
```

### Solution 3: **Client-Side Caching with Smart Invalidation**

```typescript
// Cache pools in memory, only fetch deltas
const [poolsCache, setPoolsCache] = useState<Map<string, FlashnetPool>>(new Map())

// On update, merge with cache
const updatePools = (newPools: FlashnetPool[]) => {
  setPoolsCache(prev => {
    const updated = new Map(prev)
    newPools.forEach(pool => {
      updated.set(pool.lp_public_key, pool)
    })
    return updated
  })
}
```

## Recommended Implementation

### Phase 1: Immediate (Current)
1. ✅ **Cron job**: Every 1 minute (`*/1 * * * *`)
2. ✅ **Client polling**: Every 30 seconds when visible
3. ✅ **Selective updates**: Only update fast-changing fields

### Phase 2: Optimization (Next)
1. **Redis cache layer** (if available):
   - Cache pool data for 10-15 seconds
   - Serve from cache, update in background
   - Reduces database load

2. **Smart polling**:
   - Poll faster for active pools (top 20 by volume)
   - Poll slower for inactive pools
   - Adaptive based on market activity

3. **Incremental updates**:
   - Only fetch pools that changed since last sync
   - Use `last_synced_at` timestamps
   - Reduce API calls by 70-80%

### Phase 3: Future (If SDK Supports)
1. **WebSocket support** (if Flashnet SDK adds it):
   - Real-time price updates
   - Push notifications for price changes
   - Sub-second latency

2. **Server-Sent Events (SSE)**:
   - Lighter than WebSockets
   - Works with Vercel Edge Functions
   - Push updates to clients

3. **Time-series database**:
   - QuestDB or TimescaleDB
   - Optimized for high-frequency data
   - Better query performance

## Performance Targets

### Current (15 min cron):
- ❌ **Update frequency**: 15 minutes
- ❌ **User experience**: Stale data, poor for trading
- ✅ **Cost**: Low (96 syncs/day)

### Recommended (1 min cron + 30s client):
- ✅ **Update frequency**: 30 seconds (client) + 1 minute (backend)
- ✅ **User experience**: Fresh data, acceptable for trading
- ⚠️ **Cost**: Medium (1,440 syncs/day backend + client polls)

### Ideal (WebSocket):
- ✅ **Update frequency**: Real-time (< 1 second)
- ✅ **User experience**: Professional-grade, perfect for trading
- ⚠️ **Cost**: Low (only updates on change)

## Cost Analysis

### Current (15 min cron):
- Backend: 96 syncs/day × ~2 seconds = 192 seconds/day
- Cost: Low

### Recommended (1 min cron):
- Backend: 1,440 syncs/day × ~2 seconds = 2,880 seconds/day
- Client: ~2,880 polls/day × ~0.5 seconds = 1,440 seconds/day
- **Total**: ~4,320 seconds/day (still within limits)
- Cost: Medium (but acceptable for trading data)

## Monitoring & Alerts

1. **Sync latency tracking**:
   ```typescript
   const syncDuration = Date.now() - startTime
   if (syncDuration > 5000) {
     console.warn('[Flashnet] Slow sync detected:', syncDuration)
   }
   ```

2. **Data freshness metrics**:
   ```sql
   SELECT 
     lp_public_key,
     NOW() - last_synced_at AS age
   FROM flashnet_pools
   WHERE NOW() - last_synced_at > INTERVAL '2 minutes'
   ```

3. **API rate limit monitoring**:
   - Track SDK errors
   - Alert on rate limit hits
   - Implement exponential backoff

## Conclusion

**For a trading platform, 15 minutes is unacceptable.** 

**Recommended approach:**
1. **1-minute cron** (Vercel minimum)
2. **30-second client polling** (when page visible)
3. **Selective updates** (only fast-changing fields)
4. **Smart caching** (reduce redundant calls)

This gives us **~30-second effective update frequency**, which is acceptable for most traders while working within Vercel/serverless constraints.

**Future improvements:**
- Redis cache layer
- Incremental updates
- WebSocket support (if SDK adds it)
- Time-series database

## References

1. [Real-time cryptocurrency price monitoring](https://sdlccorp.com/post/how-to-implement-real-time-price-monitoring-on-crypto-exchanges/)
2. [Best practices for high-volume market data](https://finage.co.uk/blog/best-practices-for-handling-highvolume-market-data-in-your-app)
3. [Building a real-time cryptocurrency price tracker](https://redpanda-data.medium.com/building-a-real-time-cryptocurrency-price-tracker-fc2d4a45c92c)
4. [Why you need a cryptocurrency price API](https://www.coinapi.io/blog/why-you-need-a-cryptocurrency-price-api)
5. [Top 5 cryptocurrency data APIs](https://www.linkedin.com/pulse/top-5-cryptocurrency-data-apis-comprehensive-2025-kevin-meneses-huojf)

