'use client'

import { useState, useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useLaserEyes } from '@omnisat/lasereyes'

export default function HordeAttackAlert() {
  const { connected, address } = useLaserEyes()
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [readyCount, setReadyCount] = useState<number | null>(null)
  const [injuredCount, setInjuredCount] = useState<number | null>(null)
  const [deadCount, setDeadCount] = useState<number | null>(null)
  const [dungeonCrawlTimeRemaining, setDungeonCrawlTimeRemaining] = useState<number | null>(null)
  
  // Use refs to store current values and prevent unnecessary effect re-runs
  const addressRef = useRef<string | null | undefined>(undefined)
  const connectedRef = useRef<boolean>(false)

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

  // Fetch ready army count and injured count - only on page load/navigation, no polling
  // Use stable string keys to prevent unnecessary re-runs
  const addressKey = address ? address.toLowerCase() : ''
  const prevAddressKeyRef = useRef<string>('')
  const prevConnectedRef = useRef<boolean>(false)
  
  useEffect(() => {
    // Only run if address or connected actually changed
    if (addressKey === prevAddressKeyRef.current && connected === prevConnectedRef.current) {
      return
    }
    
    prevAddressKeyRef.current = addressKey
    prevConnectedRef.current = connected
    
    if (!connected || !address) {
      setReadyCount(null)
      setInjuredCount(null)
      setDeadCount(null)
      return
    }

    let isMounted = true
    const currentAddress = address
    
    const fetchReadyCount = async () => {
      if (!isMounted || prevAddressKeyRef.current !== addressKey) {
        return
      }
      
      try {
        const response = await fetch(
          `/api/battle/ordinals?walletAddress=${encodeURIComponent(currentAddress)}`,
          { cache: 'no-store' }
        )
        if (response.ok && isMounted && prevAddressKeyRef.current === addressKey) {
          const data = await response.json()
          const readyArmies = (data.ordinals || []).filter(
            (ord: { status: string; lifeForce: number }) => 
              ord.status === 'ready' && ord.lifeForce > 0
          )
          if (isMounted && prevAddressKeyRef.current === addressKey) {
            setReadyCount(readyArmies.length)
            
            // Count injured (life force < 40)
            const injuredArmies = readyArmies.filter(
              (ord: { lifeForce: number }) => ord.lifeForce < 40
            )
            setInjuredCount(injuredArmies.length)
            
            // Count dead (is_dead = TRUE)
            const deadArmies = (data.ordinals || []).filter(
              (ord: { isDead?: boolean }) => ord.isDead === true
            )
            setDeadCount(deadArmies.length)
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching ready count:', error)
        }
      }
    }

    // Fetch once on mount/page change - no polling interval
    fetchReadyCount()
    
    return () => {
      isMounted = false
    }
  }, [addressKey, connected]) // Use stable addressKey and connected boolean

  // Fetch next dungeon crawl time - ONLY on mount/page navigation, NO polling
  const earliestTimeRef = useRef<number | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  useEffect(() => {
    const fetchDungeonCrawlTime = async () => {
      try {
        const response = await fetch('/api/dungeon-crawls', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.crawls && data.crawls.length > 0) {
            const now = Date.now()
            
            // Calculate actual restart times for each crawl (with client-side validation)
            // Match the logic from dungeon-crawl page
            const actualRestartTimes = data.crawls
              .map((crawl: { 
                nextRestartAt?: string | null
                lastFailedAt?: string | null
                restartAfterFailureHours?: number
                instances?: Array<{ status: string }>
              }) => {
                // Skip if there's an active instance
                const hasActiveInstance = crawl.instances?.some(
                  (i: { status: string }) => 
                    ['open', 'filling', 'ready', 'level_1', 'level_2', 'level_3'].includes(i.status)
                )
                if (hasActiveInstance) return null
                
                // Client-side validation: Check if we're in a failure cooldown period
                let actualRestartTime: number | null = null
                
                if (crawl.lastFailedAt) {
                  const lastFailedTime = new Date(crawl.lastFailedAt).getTime()
                  const restartAfterFailureMs = (crawl.restartAfterFailureHours || 2) * 60 * 60 * 1000
                  const failureCooldownEnds = lastFailedTime + restartAfterFailureMs
                  const timeUntilFailureCooldownEnds = failureCooldownEnds - now
                  
                  // If we're still in the failure cooldown period, use that as the actual restart time
                  if (timeUntilFailureCooldownEnds > 0) {
                    actualRestartTime = failureCooldownEnds
                  }
                }
                
                // Use actual restart time if in failure cooldown, otherwise use nextRestartAt
                const restartTime = actualRestartTime || (crawl.nextRestartAt ? new Date(crawl.nextRestartAt).getTime() : null)
                
                return restartTime && !isNaN(restartTime) ? restartTime : null
              })
              .filter((time: number | null): time is number => time !== null && time > now)
            
            if (actualRestartTimes.length > 0) {
              const newEarliestTime = Math.min(...actualRestartTimes)
              
              // Only update if the time has changed significantly (more than 1 minute difference)
              // This prevents glitching from minor timestamp differences
              if (!earliestTimeRef.current || Math.abs(newEarliestTime - earliestTimeRef.current) > 60000) {
                earliestTimeRef.current = newEarliestTime
              }
            } else {
              earliestTimeRef.current = null
              setDungeonCrawlTimeRemaining(null)
            }
          } else {
            earliestTimeRef.current = null
            setDungeonCrawlTimeRemaining(null)
          }
        }
      } catch (error) {
        console.error('Error fetching dungeon crawl time:', error)
        earliestTimeRef.current = null
        setDungeonCrawlTimeRemaining(null)
      }
    }

    // Countdown update function that uses the ref (no API call, just UI update)
    const updateCountdown = () => {
      if (earliestTimeRef.current) {
        const now = Date.now()
        const remaining = earliestTimeRef.current - now
        setDungeonCrawlTimeRemaining(remaining > 0 ? remaining : 0)
      } else {
        setDungeonCrawlTimeRemaining(null)
      }
    }

    // Only fetch once on mount/page navigation - NO polling interval
    fetchDungeonCrawlTime()
    
    // Start countdown interval (this only updates UI, no API calls)
    updateCountdown()
    countdownIntervalRef.current = setInterval(updateCountdown, 1000)
    
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
    }
  }, [])

  const formatCountdown = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const formatMinutesCountdown = (ms: number): string => {
    const totalMinutes = Math.floor(ms / (1000 * 60))
    return `${totalMinutes}m`
  }

  return (
    <div className="w-full bg-gradient-to-r from-red-900/95 via-red-800/95 to-red-900/95 border-b-2 border-red-600/80 shadow-lg relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/20 to-transparent animate-pulse" />
      
      <div className="relative z-10 container mx-auto px-2 sm:px-4 py-1.5 sm:py-2 md:py-3 flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-200 flex-shrink-0 animate-pulse" />
        <span className="text-red-100 font-bold text-xs sm:text-sm md:text-base lg:text-lg uppercase tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {readyCount !== null && (
            <span className="text-red-50 font-mono mr-1 sm:mr-2">
              Army: {readyCount}
              {deadCount !== null && deadCount > 0 && (
                <span className="text-gray-400"> - Dead: {deadCount}</span>
              )}
              {injuredCount !== null && injuredCount > 0 && (
                <span className="text-yellow-300"> (Injured: {injuredCount})</span>
              )}
            </span>
          )}
          {readyCount !== null && <span className="text-red-200/70 mx-1 sm:mx-2">|</span>}
          Horde Attacks: <span className="text-red-50 font-mono text-xs sm:text-sm md:text-base lg:text-lg ml-1">{formatCountdown(timeRemaining)}</span>
          {dungeonCrawlTimeRemaining !== null && dungeonCrawlTimeRemaining > 0 && (
            <>
              <span className="text-red-200/70 mx-1 sm:mx-2">|</span>
              <span className="text-red-100">Crawl: <span className="text-red-50 font-mono text-xs sm:text-sm md:text-base lg:text-lg ml-1">{formatMinutesCountdown(dungeonCrawlTimeRemaining)}</span></span>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

