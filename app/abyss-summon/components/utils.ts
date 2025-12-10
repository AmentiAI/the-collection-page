export function formatCountdown(ms: number) {
  if (ms <= 0) {
    return '00:00'
  }
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

// Cache for global start time to prevent API spam
let cachedAbyssStatus: { isRestricted: boolean; timeUntilStart: number; startTime: Date | null } | null = null
let cachedAbyssTimestamp: number = 0
const CACHE_DURATION_MS = 30000 // Cache for 30 seconds

// Check global start time restriction
export async function checkGlobalStartTimeForAbyss(): Promise<{ isRestricted: boolean; timeUntilStart: number; startTime: Date | null }> {
  // Return cached result if still valid
  const now = Date.now()
  if (cachedAbyssStatus && (now - cachedAbyssTimestamp) < CACHE_DURATION_MS) {
    // Update timeUntilStart based on cached startTime
    if (cachedAbyssStatus.startTime) {
      const diff = cachedAbyssStatus.startTime.getTime() - now
      return {
        ...cachedAbyssStatus,
        timeUntilStart: Math.max(0, diff)
      }
    }
    return cachedAbyssStatus
  }

  try {
    const response = await fetch('/api/admin/global-settings?key=global_start_time', {
      cache: 'no-store'
    })

    if (!response.ok) {
      const result = { isRestricted: false, timeUntilStart: 0, startTime: null }
      cachedAbyssStatus = result
      cachedAbyssTimestamp = Date.now()
      return result
    }

    const data = await response.json()
    const settingValue = data.setting?.setting_value || ''

    if (!settingValue || settingValue.trim() === '') {
      const result = { isRestricted: false, timeUntilStart: 0, startTime: null }
      cachedAbyssStatus = result
      cachedAbyssTimestamp = Date.now()
      return result
    }

    const startTime = new Date(settingValue.trim())
    if (isNaN(startTime.getTime())) {
      const result = { isRestricted: false, timeUntilStart: 0, startTime: null }
      cachedAbyssStatus = result
      cachedAbyssTimestamp = Date.now()
      return result
    }

    const currentTime = new Date()
    const timeUntilStart = Math.max(0, startTime.getTime() - currentTime.getTime())

    const result = {
      isRestricted: true,
      timeUntilStart,
      startTime
    }

    // Cache the result
    cachedAbyssStatus = result
    cachedAbyssTimestamp = Date.now()

    return result
  } catch (error) {
    console.error('Error checking global start time:', error)
    const result = { isRestricted: false, timeUntilStart: 0, startTime: null }
    cachedAbyssStatus = result
    cachedAbyssTimestamp = Date.now()
    return result
  }
}

// Check if abyss-summon is closed
// Abyss-summon is always open - not blocked by global start time
// No more 6-hour cycle - just open all the time
export async function isAbyssSummonClosed(): Promise<{ isClosed: boolean; timeUntilOpen: number; timeUntilClose: number; globalRestriction?: { isRestricted: boolean; timeUntilStart: number; startTime: Date | null } }> {
  // Always open - not restricted by global start time
  return {
    isClosed: false,
    timeUntilOpen: 0,
    timeUntilClose: 0,
    globalRestriction: undefined
  }
}

