'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { checkGlobalStartTime, formatTimeUntilStart } from '@/lib/utils/global-start-time'

interface GlobalStartTimeLockProps {
  children: React.ReactNode
}

export default function GlobalStartTimeLock({ children }: GlobalStartTimeLockProps) {
  const [isRestricted, setIsRestricted] = useState(false)
  const [timeUntilStart, setTimeUntilStart] = useState(0)
  const [isStarted, setIsStarted] = useState(true)
  const [loading, setLoading] = useState(true)
  const [startTime, setStartTime] = useState<Date | null>(null)

  useEffect(() => {
    const checkStartTime = async () => {
      try {
        const status = await checkGlobalStartTime()
        setIsRestricted(status.isRestricted)
        setTimeUntilStart(status.timeUntilStart)
        setIsStarted(status.isStarted)
        setStartTime(status.startTime)
      } catch (error) {
        console.error('Error checking global start time:', error)
        // On error, allow access
        setIsRestricted(false)
        setIsStarted(true)
      } finally {
        setLoading(false)
      }
    }

    checkStartTime()

    // Update countdown every second if restricted
    let intervalId: NodeJS.Timeout | null = null
    if (isRestricted && !isStarted) {
      intervalId = setInterval(() => {
        if (startTime) {
          const now = new Date()
          const diff = startTime.getTime() - now.getTime()
          setTimeUntilStart(Math.max(0, diff))
          setIsStarted(diff <= 0)
        }
      }, 1000)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [isRestricted, isStarted, startTime])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-12 w-12 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (isRestricted && !isStarted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="max-w-2xl w-full rounded-3xl border-2 border-red-600/80 bg-black/95 p-8 shadow-[0_0_80px_rgba(220,38,38,0.8)]">
          <div className="flex flex-col items-center justify-center gap-6 text-center">
            <AlertTriangle className="h-16 w-16 text-red-500 animate-pulse" />
            <h2 className="text-2xl font-black uppercase tracking-[0.4em] text-red-200 md:text-3xl">
              Access Locked
            </h2>
            <p className="text-lg text-red-300/90 max-w-xl">
              This page is currently locked until the global start time.
            </p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-xs font-mono uppercase tracking-[0.3em] text-red-400/70">
                Opens in:
              </p>
              <p className="text-4xl font-mono font-bold text-red-400 tracking-wider">
                {formatTimeUntilStart(timeUntilStart)}
              </p>
            </div>
            {startTime && (
              <p className="text-sm text-gray-400 mt-4">
                Start time: {startTime.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

