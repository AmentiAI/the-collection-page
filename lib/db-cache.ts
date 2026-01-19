// Database query caching utility
// Reduces database load by caching frequently accessed read-only data

type CacheEntry<T = any> = {
  data: T
  timestamp: number
  promise?: Promise<T>
}

const cache = new Map<string, CacheEntry>()
const DEFAULT_TTL = 30000 // 30 seconds default

// Cache TTLs for different endpoint types
export const CACHE_TTLS = {
  // Frequently polled endpoints (short cache)
  SUMMONS: 10000, // 10 seconds - data changes frequently
  DUNGEON_CRAWLS: 30000, // 30 seconds - instances update periodically
  CRYSTALLIZATION: 15000, // 15 seconds - status updates every 30s
  BURN_WINDOW: 5000, // 5 seconds - changes infrequently but polled often
  GATES_RATIO: 10000, // 10 seconds
  FLASHNET_POOLS: 60000, // 60 seconds - updated by cron every 15 min
  
  // Less frequently accessed (longer cache)
  PROFILE: 60000, // 60 seconds - user data doesn't change often
  LEADERBOARD: 120000, // 2 minutes - leaderboards update less frequently
  STATS: 30000, // 30 seconds - aggregate stats
  
  // Static/semi-static data
  CONFIG: 300000, // 5 minutes - configuration rarely changes
} as const

/**
 * Get cached data or fetch fresh data
 * Prevents duplicate requests and reduces database load
 */
export function getCachedQuery<T = any>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  const now = Date.now()
  const cached = cache.get(key)

  // Return in-flight promise if one exists (prevents duplicate requests)
  if (cached?.promise) {
    return cached.promise
  }

  // Return cached data if still valid
  if (cached && cached.data !== null && now - cached.timestamp < ttl) {
    return Promise.resolve(cached.data)
  }

  // Create new request
  const promise = fetcher()
    .then(data => {
      cache.set(key, {
        data,
        timestamp: Date.now(),
        promise: undefined
      })
      return data
    })
    .catch(error => {
      // Remove failed request from cache
      cache.delete(key)
      throw error
    })

  // Store in-flight promise
  cache.set(key, {
    data: null as any,
    timestamp: now,
    promise
  })

  return promise
}

/**
 * Invalidate cache entries matching a pattern
 */
export function invalidateCache(keyPattern?: string) {
  if (!keyPattern) {
    cache.clear()
    return
  }

  const keysToDelete: string[] = []
  for (const key of Array.from(cache.keys())) {
    if (key.includes(keyPattern)) {
      keysToDelete.push(key)
    }
  }
  keysToDelete.forEach(key => cache.delete(key))
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const now = Date.now()
  const entries = Array.from(cache.entries())
  
  return {
    totalEntries: cache.size,
    validEntries: entries.filter(([_, entry]) => 
      entry.data !== null && now - entry.timestamp < DEFAULT_TTL
    ).length,
    inFlightRequests: entries.filter(([_, entry]) => entry.promise !== undefined).length,
    keys: Array.from(cache.keys())
  }
}

/**
 * Clear expired cache entries (call periodically)
 */
export function cleanupExpiredCache() {
  const now = Date.now()
  const keysToDelete: string[] = []
  
  for (const [key, entry] of cache.entries()) {
    // Remove entries older than 5 minutes (even if TTL was longer)
    if (now - entry.timestamp > 300000 && !entry.promise) {
      keysToDelete.push(key)
    }
  }
  
  keysToDelete.forEach(key => cache.delete(key))
  return keysToDelete.length
}

// Cleanup expired cache every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredCache, 5 * 60 * 1000)
}
