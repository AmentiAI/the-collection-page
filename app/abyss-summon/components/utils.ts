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
  
  // Open windows: 12:00 AM - 1:00 AM and 12:00 PM - 3:00 PM EST
  // Closed: 1:00 AM - 12:00 PM and 3:00 PM - 12:00 AM
  const isClosed = (estHour >= 1 && estHour < 12) || estHour >= 15
  
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
    // Calculate time until next opening
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond
    let targetTotalSeconds: number
    
    if (estHour >= 1 && estHour < 12) {
      // Closed between 1 AM - 12 PM, next opening is 12 PM
      targetTotalSeconds = 12 * 3600
    } else {
      // Closed between 3 PM - midnight, next opening is midnight (0:00 AM)
      targetTotalSeconds = 24 * 3600 // midnight of next day
    }
    
    let secondsUntilOpen = targetTotalSeconds - currentTotalSeconds
    if (secondsUntilOpen <= 0) {
      secondsUntilOpen += 24 * 3600
    }
    
    const timeUntilOpen = secondsUntilOpen * 1000
    return { isClosed: true, timeUntilOpen: Math.max(0, timeUntilOpen), timeUntilClose: 0 }
  } else {
    // Calculate time until next closing
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond
    let targetTotalSeconds: number
    
    if (estHour >= 0 && estHour < 1) {
      // Open from midnight to 1 AM, closes at 1 AM
      targetTotalSeconds = 1 * 3600
    } else {
      // Open from 12 PM to 3 PM, closes at 3 PM
      targetTotalSeconds = 15 * 3600
    }
    
    let secondsUntilClose = targetTotalSeconds - currentTotalSeconds
    
    // If somehow negative or zero, add 24 hours as safety
    if (secondsUntilClose <= 0) {
      secondsUntilClose += 24 * 3600
    }
    
    const timeUntilClose = secondsUntilClose * 1000
    
    return { isClosed: false, timeUntilOpen: 0, timeUntilClose: Math.max(0, timeUntilClose) }
  }
}

