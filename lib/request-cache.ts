// Simple request cache to prevent duplicate API calls
type CacheEntry = {
  data: any
  timestamp: number
  promise?: Promise<any>
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 30000 // 30 seconds

export function getCachedRequest<T = any>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL
): Promise<T> {
  const now = Date.now()
  const cached = cache.get(key)

  // Return cached data if still valid
  if (cached && now - cached.timestamp < ttl) {
    return Promise.resolve(cached.data)
  }

  // Return in-flight promise if one exists
  if (cached?.promise) {
    return cached.promise
  }

  // Create new request
  const promise = fetcher().then(data => {
    cache.set(key, {
      data,
      timestamp: Date.now(),
      promise: undefined
    })
    return data
  }).catch(error => {
    // Remove failed request from cache
    cache.delete(key)
    throw error
  })

  // Store in-flight promise
  cache.set(key, {
    data: null,
    timestamp: now,
    promise
  })

  return promise
}

export function invalidateCache(keyPattern?: string) {
  if (!keyPattern) {
    cache.clear()
    return
  }

  const keysToDelete: string[] = []
  for (const key of cache.keys()) {
    if (key.includes(keyPattern)) {
      keysToDelete.push(key)
    }
  }
  keysToDelete.forEach(key => cache.delete(key))
}

export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  }
}

