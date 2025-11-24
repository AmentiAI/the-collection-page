// Simple in-memory rate limiter
// For production, use Redis or Vercel KV for distributed rate limiting

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up old entries every 60 seconds
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of Array.from(store.entries())) {
    if (now > entry.resetAt) {
      store.delete(key)
    }
  }
}, 60_000)

export function rateLimit(identifier: string, maxRequests: number, windowMs: number): {
  success: boolean
  remaining: number
  resetAt: number
} {
  const now = Date.now()
  const key = identifier
  
  let entry = store.get(key)
  
  // Create new entry or reset if window expired
  if (!entry || now > entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    }
    store.set(key, entry)
  }
  
  // Check if rate limit exceeded
  if (entry.count >= maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    }
  }
  
  // Increment counter
  entry.count++
  
  return {
    success: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  }
}

// Helper to get client identifier (IP + wallet)
export function getClientIdentifier(request: Request, wallet?: string): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown'
  return wallet ? `${ip}:${wallet}` : ip
}

