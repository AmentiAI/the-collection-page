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

// UTC timezone handling - 1 hour every 6 hours starting at UTC 05:00 (EST midnight)
// Also checks global start time - if set, timer is disabled until global start time passes
export async function isAbyssSummonClosed(): Promise<{ isClosed: boolean; timeUntilOpen: number; timeUntilClose: number }> {
  const now = new Date()
  
  // Check global start time first
  try {
    const response = await fetch('/api/settings/global-start-time', { cache: 'no-store' })
    const data = await response.json()
    
    if (data.success && data.globalStartTime) {
      const globalStartTime = new Date(data.globalStartTime)
      const timeRemaining = globalStartTime.getTime() - now.getTime()
      
      // If global start time hasn't passed, keep closed
      if (timeRemaining > 0) {
        return { isClosed: true, timeUntilOpen: timeRemaining, timeUntilClose: 0 }
      }
    }
  } catch (error) {
    console.error('Error checking global start time:', error)
    // Continue with normal timer logic on error
  }
  
  // Use UTC time directly
  const utcHour = now.getUTCHours()
  const currentMinute = now.getUTCMinutes()
  const currentSecond = now.getUTCSeconds()
  
  // Open for 1 hour every 6 hours starting at UTC 05:00
  // Open windows: 05:00-06:00, 11:00-12:00, 17:00-18:00, 23:00-00:00
  const isOpen = utcHour === 5 || utcHour === 11 || utcHour === 17 || utcHour === 23
  const isClosed = !isOpen
  
  const currentHour = utcHour
  
  if (isClosed) {
    // Calculate time until next opening (next hour in the cycle: 5, 11, 17, 23 UTC)
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond
    let targetHour: number
    
    if (utcHour >= 0 && utcHour < 5) {
      targetHour = 5
    } else if (utcHour >= 6 && utcHour < 11) {
      targetHour = 11
    } else if (utcHour >= 12 && utcHour < 17) {
      targetHour = 17
    } else if (utcHour >= 18 && utcHour < 23) {
      targetHour = 23
    } else {
      // utcHour is 24 or wrapped, next opening is 5 UTC next day
      targetHour = 24 + 5 // Will be handled by adding 24 hours
    }
    
    const targetTotalSeconds = targetHour * 3600
    let secondsUntilOpen = targetTotalSeconds - currentTotalSeconds
    if (secondsUntilOpen <= 0) {
      secondsUntilOpen += 24 * 3600
    }
    
    const timeUntilOpen = secondsUntilOpen * 1000
    return { isClosed: true, timeUntilOpen: Math.max(0, timeUntilOpen), timeUntilClose: 0 }
  } else {
    // Calculate time until next closing (closes 1 hour after opening)
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond
    const closingHour = utcHour + 1 // Closes 1 hour after current hour
    const targetTotalSeconds = closingHour * 3600
    
    let secondsUntilClose = targetTotalSeconds - currentTotalSeconds
    
    // If somehow negative or zero, something went wrong
    if (secondsUntilClose <= 0) {
      secondsUntilClose = 3600 // Default to 1 hour
    }
    
    const timeUntilClose = secondsUntilClose * 1000
    
    return { isClosed: false, timeUntilOpen: 0, timeUntilClose: Math.max(0, timeUntilClose) }
  }
}

