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

// EST/EDT timezone handling
export function isAbyssSummonClosed(): { isClosed: boolean; timeUntilOpen: number; timeUntilClose: number } {
  const now = new Date()
  
  // Get current time in EST/EDT using Intl.DateTimeFormat
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  })
  
  const estHour = parseInt(estFormatter.formatToParts(now).find(p => p.type === 'hour')?.value || '0')
  
  // Closed from 7:00 PM to 10:00 AM EST (opens 1 hour later, closes 3 hours sooner)
  const isClosed = estHour >= 19 || estHour < 10
  
  // Get full EST date components
  const estDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  
  const estParts = estDateFormatter.formatToParts(now)
  const year = parseInt(estParts.find(p => p.type === 'year')?.value || '0')
  const month = parseInt(estParts.find(p => p.type === 'month')?.value || '0') - 1
  const day = parseInt(estParts.find(p => p.type === 'day')?.value || '0')
  const currentHour = parseInt(estParts.find(p => p.type === 'hour')?.value || '0')
  const currentMinute = parseInt(estParts.find(p => p.type === 'minute')?.value || '0')
  const currentSecond = parseInt(estParts.find(p => p.type === 'second')?.value || '0')
  
  if (isClosed) {
    // Calculate time until 10:00 AM EST (when it opens)
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond
    const targetTotalSeconds = 10 * 3600 // 10 AM
    
    let secondsUntil10 = targetTotalSeconds - currentTotalSeconds
    if (secondsUntil10 <= 0) {
      // Add 24 hours if we need to go to next day
      secondsUntil10 += 24 * 3600
    }
    
    const timeUntilOpen = secondsUntil10 * 1000
    return { isClosed: true, timeUntilOpen: Math.max(0, timeUntilOpen), timeUntilClose: 0 }
  } else {
    // Calculate time until 7:00 PM EST (when it closes)
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond
    const targetTotalSeconds = 19 * 3600 // 7 PM = 68400 seconds
    
    let secondsUntil7 = targetTotalSeconds - currentTotalSeconds
    
    // If we're at or past 7 PM (hour >= 19), we need tomorrow's 7 PM
    if (currentHour >= 19) {
      secondsUntil7 += 24 * 3600
    }
    // If we're before 7 PM, secondsUntil7 should already be positive
    // But if somehow it's negative or zero, add 24 hours as safety
    if (secondsUntil7 <= 0) {
      secondsUntil7 += 24 * 3600
    }
    
    const timeUntilClose = secondsUntil7 * 1000
    
    return { isClosed: false, timeUntilOpen: 0, timeUntilClose: Math.max(0, timeUntilClose) }
  }
}

