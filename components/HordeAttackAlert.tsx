'use client'

import { useState, useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useLaserEyes } from '@omnisat/lasereyes'

export default function HordeAttackAlert() {
  const { connected, address } = useLaserEyes()
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [readyCount, setReadyCount] = useState<number | null>(null)
  const [injuredCount, setInjuredCount] = useState<number | null>(null)
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

  // Fetch ready army count and injured count
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
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error fetching ready count:', error)
        }
      }
    }

    fetchReadyCount()
    // Refresh every 30 seconds
    const interval = setInterval(fetchReadyCount, 30000)
    
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [addressKey, connected]) // Use stable addressKey and connected boolean

  // Fetch next dungeon crawl time
  useEffect(() => {
    let countdownInterval: NodeJS.Timeout | null = null
    
    const fetchDungeonCrawlTime = async () => {
      try {
        const response = await fetch('/api/dungeon-crawls', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.crawls && data.crawls.length > 0) {
            // Find the earliest nextRestartAt from all active crawls
            const nextRestartTimes = data.crawls
              .map((crawl: { nextRestartAt?: string | null }) => crawl.nextRestartAt)
              .filter((time: string | null | undefined): time is string => time != null)
              .map((time: string) => new Date(time).getTime())
              .filter((time: number) => !isNaN(time) && time > Date.now())
            
            if (nextRestartTimes.length > 0) {
              const earliestTime = Math.min(...nextRestartTimes)
              const calculateTimeRemaining = () => {
                const now = Date.now()
                const remaining = earliestTime - now
                return remaining > 0 ? remaining : 0
              }
              
              const updateCountdown = () => {
                setDungeonCrawlTimeRemaining(calculateTimeRemaining())
              }
              
              // Clear existing interval if any
              if (countdownInterval) {
                clearInterval(countdownInterval)
              }
              
              updateCountdown()
              countdownInterval = setInterval(updateCountdown, 1000)
            } else {
              setDungeonCrawlTimeRemaining(null)
            }
          } else {
            setDungeonCrawlTimeRemaining(null)
          }
        }
      } catch (error) {
        console.error('Error fetching dungeon crawl time:', error)
        setDungeonCrawlTimeRemaining(null)
      }
    }

    fetchDungeonCrawlTime()
    // Refresh every 60 seconds
    const fetchInterval = setInterval(fetchDungeonCrawlTime, 60000)
    
    return () => {
      clearInterval(fetchInterval)
      if (countdownInterval) {
        clearInterval(countdownInterval)
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
      
      <div className="relative z-10 container mx-auto px-4 py-2 sm:py-3 flex items-center justify-center gap-3 flex-wrap">
        <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-200 flex-shrink-0 animate-pulse" />
        <span className="text-red-100 font-bold text-sm sm:text-base md:text-lg uppercase tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {readyCount !== null && (
            <span className="text-red-50 font-mono mr-2">
              Army: {readyCount}
              {injuredCount !== null && injuredCount > 0 && (
                <span className="text-yellow-300"> (Injured: {injuredCount})</span>
              )}
            </span>
          )}
          {readyCount !== null && <span className="text-red-200/70 mx-2">|</span>}
          Horde Attacks: <span className="text-red-50 font-mono text-base sm:text-lg md:text-xl ml-1">{formatCountdown(timeRemaining)}</span>
          {dungeonCrawlTimeRemaining !== null && dungeonCrawlTimeRemaining > 0 && (
            <>
              <span className="text-red-200/70 mx-2">|</span>
              <span className="text-red-100">Crawl: <span className="text-red-50 font-mono text-base sm:text-lg md:text-xl ml-1">{formatMinutesCountdown(dungeonCrawlTimeRemaining)}</span></span>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

