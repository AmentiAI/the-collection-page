/**
 * Utility functions for checking global start time restrictions
 */

export interface GlobalStartTimeStatus {
  isRestricted: boolean
  startTime: Date | null
  timeUntilStart: number // milliseconds until start, 0 if already started
  isStarted: boolean
}

/**
 * Check if the global start time has passed
 * Returns status information about the global start time restriction
 */
export async function checkGlobalStartTime(): Promise<GlobalStartTimeStatus> {
  try {
    const response = await fetch('/api/admin/global-settings?key=global_start_time', {
      cache: 'no-store'
    })

    if (!response.ok) {
      console.error('Failed to fetch global start time setting')
      // If we can't fetch, assume no restriction (allow access)
      return {
        isRestricted: false,
        startTime: null,
        timeUntilStart: 0,
        isStarted: true
      }
    }

    const data = await response.json()
    const settingValue = data.setting?.setting_value || ''

    // Empty string means no restriction
    if (!settingValue || settingValue.trim() === '') {
      return {
        isRestricted: false,
        startTime: null,
        timeUntilStart: 0,
        isStarted: true
      }
    }

    // Parse the timestamp
    const startTime = new Date(settingValue.trim())
    if (isNaN(startTime.getTime())) {
      console.error('Invalid global start time format:', settingValue)
      // Invalid format, assume no restriction
      return {
        isRestricted: false,
        startTime: null,
        timeUntilStart: 0,
        isStarted: true
      }
    }

    const now = new Date()
    const timeUntilStart = Math.max(0, startTime.getTime() - now.getTime())
    const isStarted = timeUntilStart === 0

    return {
      isRestricted: true,
      startTime,
      timeUntilStart,
      isStarted
    }
  } catch (error) {
    console.error('Error checking global start time:', error)
    // On error, assume no restriction (allow access)
    return {
      isRestricted: false,
      startTime: null,
      timeUntilStart: 0,
      isStarted: true
    }
  }
}

/**
 * Format time remaining until start
 */
export function formatTimeUntilStart(ms: number): string {
  if (ms <= 0) return '00:00:00'

  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

