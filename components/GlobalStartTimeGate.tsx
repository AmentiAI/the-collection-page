'use client'

import { useState, useEffect } from 'react'
import { Clock, AlertCircle } from 'lucide-react'

interface GlobalStartTimeGateProps {
  children: React.ReactNode
  pageName?: string
}

export function GlobalStartTimeGate({ children, pageName = 'This page' }: GlobalStartTimeGateProps) {
  const [isAccessible, setIsAccessible] = useState<boolean | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAccess()
    const interval = setInterval(checkAccess, 1000) // Check every second
    return () => clearInterval(interval)
  }, [])

  const checkAccess = async () => {
    try {
      const response = await fetch('/api/settings/global-start-time', { cache: 'no-store' })
      const data = await response.json()

      if (data.success) {
        setIsAccessible(data.isAccessible)
        setTimeRemaining(data.timeRemaining || 0)
      } else {
        // On error, allow access (fail open)
        setIsAccessible(true)
        setTimeRemaining(null)
      }
    } catch (error) {
      console.error('Error checking global start time:', error)
      // On error, allow access (fail open)
      setIsAccessible(true)
      setTimeRemaining(null)
    } finally {
      setLoading(false)
    }
  }

  const formatTimeRemaining = (ms: number) => {
    if (ms <= 0) return '0s'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (isAccessible === false && timeRemaining !== null && timeRemaining > 0) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="max-w-2xl w-full rounded-3xl border-2 border-red-600/80 bg-black/95 p-12 shadow-[0_0_80px_rgba(220,38,38,0.8)]">
          <div className="flex flex-col items-center justify-center gap-6 text-center">
            <AlertCircle className="h-20 w-20 text-red-500 animate-pulse" />
            <h2 className="text-3xl font-black uppercase tracking-[0.4em] text-red-200 md:text-4xl">
              Coming Soon
            </h2>
            <p className="text-lg text-gray-300 max-w-md">
              {pageName} will be accessible once the global start time has passed.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-red-400">
                <Clock className="h-5 w-5" />
                <p className="text-sm font-mono uppercase tracking-[0.3em]">
                  Opens in:
                </p>
              </div>
              <div className="text-3xl font-mono font-bold text-red-300">
                {formatTimeRemaining(timeRemaining)}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

