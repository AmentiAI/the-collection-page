'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function HordeAttackAlert() {
  const [timeRemaining, setTimeRemaining] = useState<number>(0)

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date()
      const currentMinutes = now.getMinutes()
      const currentSeconds = now.getSeconds()
      const currentMilliseconds = now.getMilliseconds()
      
      // Calculate milliseconds until the end of the current hour
      const minutesRemaining = 59 - currentMinutes
      const secondsRemaining = 59 - currentSeconds
      const millisecondsRemaining = 1000 - currentMilliseconds
      
      const totalMs = (minutesRemaining * 60 * 1000) + (secondsRemaining * 1000) + millisecondsRemaining
      return totalMs
    }

    const updateCountdown = () => {
      setTimeRemaining(calculateTimeRemaining())
    }

    // Update immediately
    updateCountdown()

    // Update every second
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatCountdown = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return (
    <div className="w-full bg-gradient-to-r from-red-900/95 via-red-800/95 to-red-900/95 border-b-2 border-red-600/80 shadow-lg relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/20 to-transparent animate-pulse" />
      
      <div className="relative z-10 container mx-auto px-4 py-2 sm:py-3 flex items-center justify-center gap-3">
        <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-200 flex-shrink-0 animate-pulse" />
        <span className="text-red-100 font-bold text-sm sm:text-base md:text-lg uppercase tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          The horde attack again in: <span className="text-red-50 font-mono text-base sm:text-lg md:text-xl ml-1">{formatCountdown(timeRemaining)}</span>
        </span>
      </div>
    </div>
  )
}

