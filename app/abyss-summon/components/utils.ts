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

// Check global start time restriction
export async function checkGlobalStartTimeForAbyss(): Promise<{ isRestricted: boolean; timeUntilStart: number; startTime: Date | null }> {
  try {
    const response = await fetch('/api/admin/global-settings?key=global_start_time', {
      cache: 'no-store'
    })

    if (!response.ok) {
      return { isRestricted: false, timeUntilStart: 0, startTime: null }
    }

    const data = await response.json()
    const settingValue = data.setting?.setting_value || ''

    if (!settingValue || settingValue.trim() === '') {
      return { isRestricted: false, timeUntilStart: 0, startTime: null }
    }

    const startTime = new Date(settingValue.trim())
    if (isNaN(startTime.getTime())) {
      return { isRestricted: false, timeUntilStart: 0, startTime: null }
    }

    const now = new Date()
    const timeUntilStart = Math.max(0, startTime.getTime() - now.getTime())

    return {
      isRestricted: true,
      timeUntilStart,
      startTime
    }
  } catch (error) {
    console.error('Error checking global start time:', error)
    return { isRestricted: false, timeUntilStart: 0, startTime: null }
  }
}

// Check if abyss-summon is closed
// If global start time is set and not passed, it's closed
// Otherwise, it's always open (no more 6-hour cycle)
export async function isAbyssSummonClosed(): Promise<{ isClosed: boolean; timeUntilOpen: number; timeUntilClose: number; globalRestriction?: { isRestricted: boolean; timeUntilStart: number; startTime: Date | null } }> {
  // First check global start time
  const globalStatus = await checkGlobalStartTimeForAbyss()
  
  // If global start time is set and not passed, it's closed
  if (globalStatus.isRestricted && globalStatus.timeUntilStart > 0) {
    return {
      isClosed: true,
      timeUntilOpen: globalStatus.timeUntilStart,
      timeUntilClose: 0,
      globalRestriction: globalStatus
    }
  }
  
  // If global start time has passed or is not set, it's always open
  // No more 6-hour cycle - just open all the time
  return {
    isClosed: false,
    timeUntilOpen: 0,
    timeUntilClose: 0,
    globalRestriction: undefined
  }
}

