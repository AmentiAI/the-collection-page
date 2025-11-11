 'use client'

import { useEffect, useMemo, useState } from 'react'

type TimeParts = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

const defaultTarget = () => new Date('2025-11-11T02:00:00Z')

interface CountdownTimerProps {
  targetDate?: Date | string
  className?: string
  label?: string
}

function getTimeParts(target: Date): TimeParts {
  const now = new Date()
  const diff = Math.max(0, target.getTime() - now.getTime())

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  return { days, hours, minutes, seconds }
}

export function CountdownTimer({ targetDate, className, label }: CountdownTimerProps) {
  const target = useMemo(() => {
    if (targetDate instanceof Date) return targetDate
    if (typeof targetDate === 'string') {
      const parsed = new Date(targetDate)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed
      }
    }
    return defaultTarget()
  }, [targetDate])

  const [timeParts, setTimeParts] = useState<TimeParts>(() => getTimeParts(target))

  useEffect(() => {
    setTimeParts(getTimeParts(target))
    const interval = window.setInterval(() => {
      setTimeParts(getTimeParts(target))
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [target])

  return (
    <div className={className}>
      {label ? (
        <p className="mb-4 text-center text-sm uppercase tracking-[0.35em] text-red-300">{label}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
        <CountdownSegment label="Days" value={timeParts.days} />
        <CountdownSegment label="Hours" value={timeParts.hours} />
        <CountdownSegment label="Minutes" value={timeParts.minutes} />
        <CountdownSegment label="Seconds" value={timeParts.seconds} />
      </div>
    </div>
  )
}

interface CountdownSegmentProps {
  value: number
  label: string
}

function CountdownSegment({ value, label }: CountdownSegmentProps) {
  return (
    <div className="rounded-lg border border-red-700/40 bg-black/50 p-4 shadow-[0_0_18px_rgba(220,38,38,0.25)]">
      <div className="text-4xl font-black text-red-500 md:text-5xl">{value.toString().padStart(2, '0')}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.35em] text-red-200/80">{label}</div>
    </div>
  )
}


