'use client'

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import Image from 'next/image'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Loader2, Sword, Shield, Clock, Users, CheckCircle2, XCircle, Gift, Trophy, Skull, ScrollText, Swords, ChevronDown, ChevronUp, RotateCw } from 'lucide-react'
import GlobalStartTimeLock from '@/components/GlobalStartTimeLock'
// LaserEyesWrapper is already provided by app/layout.tsx, no need to wrap again

interface DungeonCrawl {
  id: string
  name: string
  description?: string
  requiredParticipants: number
  allowMultipleFromStock: boolean
  allowedTraits?: 'all' | 'angelic' | 'demonic'
  rewardType: 'block_chance' | 'life_force_cap'
  rewardValue: number
  rewardDropChance1Ordinal: number
  rewardDropChance2Ordinals: number
  rewardDropChance3PlusOrdinals: number
  level1WindowStartMinutes: number
  level1WindowDurationMinutes: number
  level2WindowStartMinutes: number
  level2WindowDurationMinutes: number
  level3WindowStartMinutes: number
  level3WindowDurationMinutes: number
  minParticipationPercent: number
  restartAfterFailureHours: number
  cooldownHours: number
  neverRestartAfterCompletion: boolean
  instances: DungeonCrawlInstance[]
  nextRestartAt?: string | null
  lastCompletedAt?: string | null
  lastFailedAt?: string | null
  createdAt: string
  updatedAt: string
}

interface DungeonCrawlInstance {
  id: string
  crawlId: string
  status: 'open' | 'filling' | 'ready' | 'level_1' | 'level_2' | 'level_3' | 'completed' | 'failed' | 'expired'
  startedAt: string
  level1StartedAt?: string
  level1CompletedAt?: string
  level2StartedAt?: string
  level2CompletedAt?: string
  level3StartedAt?: string
  level3CompletedAt?: string
  completedAt?: string
  updatedAt?: string
  expiresAt?: string
  participants: Participant[]
  participantCount?: number
  myRewardCount?: number
}

interface Participant {
  id: string
  wallet: string
  inscriptionId: string
  image?: string
  trait?: 'Angelic' | 'Demonic'
  joinedAt: string
  level1Completed: boolean
  level1CompletedAt?: string
  level2Completed: boolean
  level2CompletedAt?: string
  level3Completed: boolean
  level3CompletedAt?: string
  username?: string | null
  avatarUrl?: string | null
}

interface BattleOrdinal {
  inscriptionId: string
  imageUrl: string
  trait: 'Angelic' | 'Demonic'
  status: 'ready' | 'sanctuary' | null
  lifeForce: number
}

interface LevelWindowData {
  windowStartMs: number
  windowEndMs: number
  baseStartTime: number
}

// Memoized Level Card Component to prevent unnecessary re-renders
// Accepts a timeKey prop that changes every second to trigger timer updates
const LevelCard = memo(({
  level,
  instance,
  crawl,
  windowData,
  myParticipant,
  onComplete,
  completingLevel,
  currentTime,
}: {
  level: number
  instance: DungeonCrawlInstance
  crawl: DungeonCrawl
  windowData: LevelWindowData | null
  myParticipant: Participant | null
  onComplete: (level: number) => void
  completingLevel: number | null
  currentTime: number // Current time in ms, updates every second
}) => {
  const [isHolding, setIsHolding] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const holdIntervalRef = useRef<number | null>(null)
  const holdStartTimeRef = useRef<number | null>(null)
  const HOLD_DURATION_MS = 1500 // 1.5 seconds to complete
  // Memoize completed count calculation
  const completedCount = useMemo(() => {
    return instance.participants.filter((p) => {
      if (level === 1) return p.level1Completed
      if (level === 2) return p.level2Completed
      return p.level3Completed
    }).length
  }, [instance.participants, level])

  // Use required participants count for the denominator, same as the display above
  const totalParticipants = crawl.requiredParticipants
  const participationPercent = useMemo(() => {
    return totalParticipants > 0
      ? (completedCount / totalParticipants) * 100
      : 0
  }, [completedCount, totalParticipants])

  const isMyCompleted = useMemo(() => {
    if (!myParticipant) return false
    if (level === 1) return myParticipant.level1Completed
    if (level === 2) return myParticipant.level2Completed
    return myParticipant.level3Completed
  }, [myParticipant, level])

  // Calculate window state with current time - this is cheap, just comparisons
  const windowState = useMemo(() => {
    if (!windowData) return { isOpen: false, timeUntilEnd: 0, timeUntilStart: 0 }
    
    const timeUntilEnd = Math.max(0, windowData.windowEndMs - currentTime) / 1000 // seconds
    const timeUntilStart = Math.max(0, windowData.windowStartMs - currentTime) / 1000 // seconds
    const isOpen = currentTime >= windowData.windowStartMs && currentTime <= windowData.windowEndMs
    
    return { isOpen, timeUntilEnd, timeUntilStart }
  }, [windowData, currentTime])

  // Recalculate canComplete with current time
  const canComplete = useMemo(() => {
    // Must be a participant to complete
    if (!instance || !myParticipant) return false
    if (isMyCompleted || !windowState.isOpen) return false
    if (level === 1) return instance.status === 'ready' || instance.status === 'level_1'
    if (level === 2) return instance.status === 'level_1' || instance.status === 'level_2'
    return instance.status === 'level_2' || instance.status === 'level_3'
  }, [instance, myParticipant, isMyCompleted, windowState.isOpen, level])

  const timeDisplay = useMemo(() => {
    if (!windowData) return null
    
    if (windowState.isOpen) {
      const totalSeconds = Math.floor(windowState.timeUntilEnd)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `${minutes}m ${seconds}s`
    } else if (windowState.timeUntilStart > 0) {
      const totalSeconds = Math.floor(windowState.timeUntilStart)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `Opens in ${minutes}m ${seconds}s`
    }
    return 'Window closed'
  }, [windowData, windowState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current)
      }
    }
  }, [])

  const handleHoldStart = () => {
    if (completingLevel === level) return
    if (!myParticipant) return // Don't allow if not a participant
    setIsHolding(true)
    setHoldProgress(0)
    holdStartTimeRef.current = Date.now()
    
    holdIntervalRef.current = window.setInterval(() => {
      if (holdStartTimeRef.current) {
        const elapsed = Date.now() - holdStartTimeRef.current
        const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100)
        setHoldProgress(progress)
        
        if (progress >= 100) {
          // Complete!
          if (holdIntervalRef.current) {
            clearInterval(holdIntervalRef.current)
            holdIntervalRef.current = null
          }
          setIsHolding(false)
          setHoldProgress(0)
          const startTime = holdStartTimeRef.current
          holdStartTimeRef.current = null
          // Only call onComplete if we actually held for the full duration
          if (Date.now() - startTime >= HOLD_DURATION_MS) {
            onComplete(level)
          }
        }
      }
    }, 16) // ~60fps updates
  }

  const handleHoldEnd = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current)
      holdIntervalRef.current = null
    }
    setIsHolding(false)
    setHoldProgress(0)
    holdStartTimeRef.current = null
  }

  return (
    <div
      className={`border-2 rounded-lg p-4 backdrop-blur-sm transition-all ${
        windowState.isOpen 
          ? 'level-card-active bg-gradient-to-br from-amber-950/40 to-red-950/40 shadow-lg shadow-amber-500/20' 
          : 'border-stone-600/60 bg-stone-900/50'
      }`}
    >
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <h3 className={`font-bold text-sm sm:text-base md:text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
          windowState.isOpen ? 'text-amber-300' : 'text-stone-400'
        }`}>Level {level}</h3>
        {isMyCompleted ? (
          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-green-500" />
        ) : (
          <XCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-stone-500" />
        )}
      </div>
      <div className="text-xs sm:text-sm md:text-base text-stone-200 mb-2 sm:mb-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        {instance?.status === 'ready' && level === 1 && completedCount === 0 && windowState.isOpen ? (
          <span>Waiting for first completion to start...</span>
        ) : (
          <span>
            {completedCount} / {crawl.requiredParticipants} completed ({Math.round(participationPercent)}%)
          </span>
        )}
      </div>
      {timeDisplay && participationPercent < 100 && (
        <div className={`text-xs sm:text-sm md:text-base font-semibold mb-2 sm:mb-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${windowState.isOpen ? 'text-amber-300' : 'text-orange-300'}`}>
          {timeDisplay}
        </div>
      )}
      {/* Show completion status if minimum is met but not 100% yet - show even when window is closed */}
      {participationPercent >= crawl.minParticipationPercent && participationPercent < 100 && (
        <div className="text-xs sm:text-sm text-amber-400 mb-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {windowState.isOpen 
            ? 'Minimum reached! Continue completing to reach 100%'
            : 'Minimum reached! Level will advance automatically'
          }
        </div>
      )}
      {canComplete && (
        <div className="mt-2 relative">
          <Button
            onMouseDown={handleHoldStart}
            onMouseUp={handleHoldEnd}
            onMouseLeave={handleHoldEnd}
            onTouchStart={handleHoldStart}
            onTouchEnd={handleHoldEnd}
            disabled={completingLevel === level}
            className="relative w-full border-2 border-amber-600 hover:border-amber-500 bg-amber-900/50 hover:bg-amber-800/60 text-white font-bold py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm md:text-base rounded-lg transition-all shadow-lg hover:shadow-amber-500/40 backdrop-blur-sm overflow-hidden z-10"
          >
            {completingLevel === level ? (
              <>
                <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                <span className="text-xs sm:text-sm md:text-base">Completing...</span>
              </>
            ) : isHolding ? (
              <span className="relative z-10 text-xs sm:text-sm md:text-base">Hold to Complete... {Math.round(holdProgress)}%</span>
            ) : (
              <span className="text-xs sm:text-sm md:text-base">Hold to Complete Level</span>
            )}
            
            {/* Progress bar */}
            {isHolding && (
              <div 
                className="absolute inset-0 bg-gradient-to-r from-amber-600/80 via-yellow-500/80 to-amber-600/80 transition-all duration-75 ease-linear"
                style={{ 
                  width: `${holdProgress}%`,
                  transition: 'width 0.05s linear'
                }}
              />
            )}
          </Button>
        </div>
      )}
    </div>
  )
})

LevelCard.displayName = 'LevelCard'

export default function DungeonCrawlPage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isWalletConnected, setIsWalletConnected] = useState(connected)
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [battleFormationExpanded, setBattleFormationExpanded] = useState(true) // Default to expanded
  const [crawls, setCrawls] = useState<DungeonCrawl[]>([])
  const [history, setHistory] = useState<DungeonCrawl[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedCrawl, setSelectedCrawl] = useState<DungeonCrawl | null>(null)
  const [selectedInstance, setSelectedInstance] = useState<DungeonCrawlInstance | null>(null)
  const [ordinals, setOrdinals] = useState<BattleOrdinal[]>([])
  const [selectedOrdinalsByInstance, setSelectedOrdinalsByInstance] = useState<Map<string, Set<string>>>(new Map())
  const [joining, setJoining] = useState(false)
  const [completingLevel, setCompletingLevel] = useState<number | null>(null)
  
  // Use ref for time to avoid re-renders - only update UI elements that need it
  const nowRef = useRef(Date.now())
  const [, forceUpdate] = useState(0)
  const timeUpdateIntervalRef = useRef<number | null>(null)

  // Update time ref every second, but only force update countdown elements
  // Only run when page is visible and has active instances
  useEffect(() => {
    // Clean up any existing interval
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current)
      timeUpdateIntervalRef.current = null
    }

    // Only run timer if we have crawls to display
    if (crawls.length === 0 && history.length === 0) {
      return
    }

    timeUpdateIntervalRef.current = window.setInterval(() => {
      nowRef.current = Date.now()
      // Only force update for countdown displays
      forceUpdate((prev) => prev + 1)
    }, 1000)
    
    return () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current)
        timeUpdateIntervalRef.current = null
      }
    }
  }, [crawls.length, history.length, connected])

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const handleConnectedChange = useCallback(
    (connected: boolean) => {
      setIsWalletConnected(connected)
      if (!connected) {
        setIsHolder(undefined)
        setIsVerifying(false)
        setOrdinals([])
        setSelectedOrdinalsByInstance(new Map())
        setJoining(false)
        setCompletingLevel(null)
        // Don't clear crawls/history - they're public data
      }
    },
    []
  )

  const fetchCrawlsRef = useRef<() => Promise<void>>()

  const fetchCrawls = useCallback(async () => {
    // Always fetch crawls - they're public data, don't require wallet connection
    try {
      const url = address 
        ? `/api/dungeon-crawls?wallet=${encodeURIComponent(address)}`
        : '/api/dungeon-crawls'
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Failed to fetch dungeon crawls:', response.status, errorText)
        throw new Error(`Failed to fetch dungeon crawls: ${response.status}`)
      }
      const data = await response.json()
      if (data.success) {
        const newCrawls = data.crawls || []
        setCrawls(newCrawls)
        setHistory(data.history || [])
        
        setSelectedInstance((prevInstance) => {
          if (!prevInstance) {
            if (newCrawls.length > 0) {
              const firstCrawl = newCrawls[0]
              if (firstCrawl.instances && firstCrawl.instances.length > 0) {
                setSelectedCrawl(firstCrawl)
                return firstCrawl.instances[0]
              }
            }
            return null
          }
          
          const matchingInstance = newCrawls
            .flatMap((c: DungeonCrawl) => c.instances || [])
            .find((i: DungeonCrawlInstance) => i.id === prevInstance.id)
          
          if (matchingInstance) {
            const matchingCrawl = newCrawls.find((c: DungeonCrawl) => 
              c.instances?.some((i: DungeonCrawlInstance) => i.id === matchingInstance.id)
            )
            if (matchingCrawl) {
              setSelectedCrawl(matchingCrawl)
            }
            return matchingInstance
          }
          
          const sameCrawlInstance = newCrawls
            .find((c: DungeonCrawl) => c.id === prevInstance.crawlId)
            ?.instances?.[0]
          
          return sameCrawlInstance || null
        })
      } else {
        console.error('API returned success:false:', data)
      }
    } catch (error) {
      console.error('Error fetching crawls:', error)
      setCrawls((prev) => {
        if (prev.length === 0) {
        toast.error('Failed to load dungeon crawls')
      }
        return prev
      })
    }
  }, [address, toast])

  useEffect(() => {
    fetchCrawlsRef.current = fetchCrawls
  }, [fetchCrawls])

  // Auto-refetch when restart countdown is low or overdue to catch new instances
  useEffect(() => {
    if (crawls.length === 0 || !fetchCrawlsRef.current) return

    // Check if any crawl is overdue or countdown is very low (< 2 minutes)
    const checkAndRefresh = () => {
      const now = Date.now()
      let needsRefresh = false
      let refreshInterval = 10000 // Default 10 seconds

      for (const crawl of crawls) {
        if (crawl.instances && crawl.instances.length > 0) continue
        if (!crawl.nextRestartAt) continue
        
        const restartTime = new Date(crawl.nextRestartAt).getTime()
        const timeUntilRestart = restartTime - now
        
        // If overdue, refresh immediately and frequently
        if (timeUntilRestart <= 0) {
          needsRefresh = true
          refreshInterval = 3000 // Refresh every 3 seconds when overdue
          break
        }
        
        // If countdown is < 2 minutes, refresh more frequently
        if (timeUntilRestart > 0 && timeUntilRestart < 2 * 60 * 1000) {
          needsRefresh = true
          refreshInterval = Math.min(refreshInterval, 5000) // Refresh every 5 seconds when < 2 min
        }
      }

      if (needsRefresh && fetchCrawlsRef.current) {
        fetchCrawlsRef.current()
      }
    }

    // Check immediately
    checkAndRefresh()

    // Set up interval - check every 3-10 seconds depending on urgency
    const interval = setInterval(checkAndRefresh, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [crawls])

  const fetchBattleOrdinals = useCallback(async () => {
    if (!address) {
      setOrdinals([])
      return
    }

    try {
      const response = await fetch(`/api/battle/ordinals?walletAddress=${encodeURIComponent(address)}`)
      if (!response.ok) throw new Error('Failed to fetch ordinals')
      const data = await response.json()
      if (data.success) {
        const ascendedOrdinals = (data.ordinals || []).filter(
          (o: BattleOrdinal) => 
            (o.trait === 'Angelic' || o.trait === 'Demonic') &&
            o.lifeForce > 0 // Filter out dead ordinals (life force 0)
        )
        setOrdinals(ascendedOrdinals)
      }
    } catch (error) {
      console.error('Error fetching ordinals:', error)
    }
  }, [address])

  const fetchBattleOrdinalsRef = useRef<() => Promise<void>>()
  useEffect(() => {
    fetchBattleOrdinalsRef.current = fetchBattleOrdinals
  }, [fetchBattleOrdinals])

  // Sync isWalletConnected with useLaserEyes connected state
  // Use a ref to prevent unnecessary updates during connection attempts
  const connectedRef = useRef(connected)
  useEffect(() => {
    // Only update if actually changed to prevent re-renders during connection
    if (connectedRef.current !== connected) {
      connectedRef.current = connected
      setIsWalletConnected(connected)
    }
  }, [connected])

  // Always fetch crawls on mount and when connection changes (crawls are public)
  useEffect(() => {
    let isMounted = true
      setLoading(true)
    
    const fetchData = async () => {
      // Always fetch crawls (public data)
      await fetchCrawlsRef.current?.()
      // Only fetch ordinals if wallet is connected
      if (connected && address) {
        await fetchBattleOrdinalsRef.current?.()
      } else {
        setOrdinals([])
      }
    }
    
    fetchData().finally(() => {
      if (isMounted) {
        setLoading(false)
      }
    })
    
    return () => {
      isMounted = false
    }
  }, [connected, address])

  const visibilityHandlerRef = useRef<(() => void) | null>(null)
  const intervalRef = useRef<number | null>(null)
  const isSetupRef = useRef(false)

  useEffect(() => {
    // Don't run cleanup immediately - only on unmount or when dependencies change
    if (!connected || !address) {
      // Clean up when disconnected
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
        visibilityHandlerRef.current = null
      }
      isSetupRef.current = false
      return
    }

    // Don't set up again if already set up
    if (isSetupRef.current) {
      return
    }

    const cleanup = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
        visibilityHandlerRef.current = null
      }
      isSetupRef.current = false
    }

    const POLL_INTERVAL = 5_000 // Poll every 5 seconds to catch failures quickly
    let isMounted = true

    const doPoll = () => {
      if (isMounted && document.visibilityState === 'visible' && fetchCrawlsRef.current) {
        fetchCrawlsRef.current()
      }
    }

    intervalRef.current = window.setInterval(doPoll, POLL_INTERVAL)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && fetchCrawlsRef.current) {
        fetchCrawlsRef.current()
      }
    }

    visibilityHandlerRef.current = handleVisibilityChange
    document.addEventListener('visibilitychange', handleVisibilityChange)
    isSetupRef.current = true

    return cleanup
  }, [connected, address])

  const handleJoin = async (instanceId: string) => {
    if (!address || !instanceId) return
    
    const selectedOrdinals = selectedOrdinalsByInstance.get(instanceId) || new Set()
    if (selectedOrdinals.size === 0) return

    setJoining(true)
    let isMounted = true
    try {
      const response = await fetch(`/api/dungeon-crawls/${instanceId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          inscriptionIds: Array.from(selectedOrdinals),
        }),
      })

      const data = await response.json()
      if (!isMounted) return
      
      if (data.success) {
        // Show message based on what was actually inserted
        if (data.actuallyInserted === data.requested) {
          toast.success(`Joined with ${data.actuallyInserted} inscription(s)!`)
        } else {
          toast.success(`Joined with ${data.actuallyInserted} of ${data.requested} inscription(s) (some were already in the crawl)`)
        }
        
        setSelectedOrdinalsByInstance((prev) => {
          const next = new Map(prev)
          next.delete(instanceId)
          return next
        })
        
        // Refresh data to show updated participant count
        await fetchCrawls()
      } else {
        toast.error(data.error || 'Failed to join dungeon crawl')
      }
    } catch (error) {
      if (!isMounted) return
      console.error('Error joining:', error)
      toast.error('Failed to join dungeon crawl')
    } finally {
      if (isMounted) {
      setJoining(false)
      }
    }
  }
  
  const getSelectedOrdinals = (instanceId: string): Set<string> => {
    return selectedOrdinalsByInstance.get(instanceId) || new Set()
  }
  
  const setSelectedOrdinalsForInstance = (instanceId: string, ordinals: Set<string>) => {
    setSelectedOrdinalsByInstance((prev) => {
      const next = new Map(prev)
      if (ordinals.size === 0) {
        next.delete(instanceId)
      } else {
        next.set(instanceId, ordinals)
      }
      return next
    })
  }

  const handleCompleteLevel = async (level: number) => {
    if (!address || !selectedInstance) return

    setCompletingLevel(level)
    let isMounted = true
    try {
      const response = await fetch(`/api/dungeon-crawls/${selectedInstance.id}/complete-level`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          level,
        }),
      })

      const data = await response.json()
      if (!isMounted) return
      
      if (data.success) {
        if (data.instanceCompleted) {
          toast.success('Dungeon crawl completed! Rewards granted!')
        } else if (data.levelCompleted) {
          toast.success(`Level ${level} completed!`)
        } else {
          toast.success(`Level ${level} check-in recorded!`)
        }
        await fetchCrawls()
      } else {
        if (data.instanceFailed) {
          toast.error(data.error || 'Dungeon crawl failed due to insufficient participation')
          await fetchCrawls()
        } else {
          toast.error(data.error || 'Failed to complete level')
        }
      }
    } catch (error) {
      if (!isMounted) return
      console.error('Error completing level:', error)
      toast.error('Failed to complete level')
    } finally {
      if (isMounted) {
      setCompletingLevel(null)
    }
    }
  }

  // Calculate window structure once - stores absolute times, not relative
  const calculateLevelWindow = useCallback((
    instance: DungeonCrawlInstance | null | undefined,
    crawl: DungeonCrawl | null,
    level: number
  ): { windowStartMs: number; windowEndMs: number; baseStartTime: number } | null => {
    if (!instance || !crawl) return null

    let baseStartTime: number
    if (level === 1) {
      if (instance.status === 'ready' || instance.status?.startsWith('level_')) {
        baseStartTime = instance.level1StartedAt 
          ? new Date(instance.level1StartedAt).getTime()
          : instance.startedAt 
            ? new Date(instance.startedAt).getTime()
            : Date.now()
      } else {
        return null
      }
    } else {
      baseStartTime = instance.level1StartedAt 
        ? new Date(instance.level1StartedAt).getTime()
        : new Date(instance.startedAt).getTime()
    }

    let windowStartMinutes: number
    let windowDurationMinutes: number

    if (level === 1) {
      windowStartMinutes = crawl.level1WindowStartMinutes
      windowDurationMinutes = crawl.level1WindowDurationMinutes
    } else if (level === 2) {
      windowStartMinutes = crawl.level2WindowStartMinutes
      windowDurationMinutes = crawl.level2WindowDurationMinutes
    } else {
      windowStartMinutes = crawl.level3WindowStartMinutes
      windowDurationMinutes = crawl.level3WindowDurationMinutes
    }

    // Calculate absolute times in milliseconds
    const windowStartMs = baseStartTime + (windowStartMinutes * 60 * 1000)
    const windowEndMs = baseStartTime + ((windowStartMinutes + windowDurationMinutes) * 60 * 1000)

    return {
      windowStartMs,
      windowEndMs,
      baseStartTime,
    }
  }, [])

  // Memoize level window data for selected instance - only recalculate when instance/crawl changes
  const levelWindows = useMemo(() => {
    if (!selectedInstance || !selectedCrawl) return { level1: null, level2: null, level3: null }
    
    // Calculate window data once - stores absolute times
    return {
      level1: calculateLevelWindow(selectedInstance, selectedCrawl, 1),
      level2: calculateLevelWindow(selectedInstance, selectedCrawl, 2),
      level3: calculateLevelWindow(selectedInstance, selectedCrawl, 3),
    }
  }, [selectedInstance, selectedCrawl, calculateLevelWindow])

  const myParticipant = useMemo(() => {
    if (!selectedInstance || !address) return null
    return selectedInstance.participants.find((p) => p.wallet.toLowerCase() === address.toLowerCase())
  }, [selectedInstance, address])

  const formatDateTime = useCallback((dateString: string | null | undefined) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }, [])

  const formatCountdown = useCallback((targetDate: string | null | undefined) => {
    if (!targetDate) return null
    const target = new Date(targetDate).getTime()
    const diff = target - nowRef.current
    if (diff <= 0) return 'Now'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }, [])

  return (
    <GlobalStartTimeLock>
      <div className="min-h-screen text-white relative">
        {/* Background Image */}
        <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: 'url(/70ca28f7-c3f7-496c-a0c6-42044399bd58.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed'
        }}
      />
      {/* Dark overlay for readability */}
      <div className="fixed inset-0 z-0 bg-black/60" />
      
      <div className="relative z-10">
        <Header
          isHolder={isHolder}
          isVerifying={isVerifying}
          connected={isWalletConnected}
          onHolderVerified={handleHolderVerified}
          onVerifyingStart={handleVerifyingStart}
          onConnectedChange={handleConnectedChange}
          showMusicControls={true}
        />

        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-7xl">
          {/* Epic Header with corner ornaments and spinning orbs */}
          <div className="relative mb-12">
            {/* Spinning Orbs - moved down */}
            <div className="spinning-orb absolute top-20 left-10 opacity-50" />
            <div className="spinning-orb absolute top-20 right-10 opacity-50" style={{ animationDelay: '-5s' }} />
            
            {/* Top corner ornaments with more red */}
            <div className="absolute -top-4 left-0 w-32 h-32 bg-gradient-radial from-red-500/15 to-transparent rounded-full blur-2xl" />
            <div className="absolute -top-4 right-0 w-32 h-32 bg-gradient-radial from-amber-500/15 to-transparent rounded-full blur-2xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-radial from-red-500/5 to-transparent rounded-full blur-3xl" />
            
            <div className="relative text-center">
              {/* Main title with epic styling */}
              <div className="inline-block relative mb-6">
                <h1 className="text-2xl sm:text-5xl md:text-7xl font-black mb-2 sm:mb-3 text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-400 to-red-500 dungeon-title tracking-wider">
                  DUNGEON CRAWLS
                </h1>
                {/* Underline decoration */}
                <div className="h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-500 opacity-40" />
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-30 blur-sm" />
              </div>
              
              <p className="text-xs sm:text-base md:text-lg text-amber-100/90 max-w-2xl mx-auto mb-4 sm:mb-6 md:mb-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                Enter the mystical dungeons with your ordinals. <br/>
                <span className="text-red-300/80">Complete all levels together to claim legendary rewards!</span>
              </p>

              {/* Tab Navigation with game-like design */}
              <div className="flex justify-center gap-2 sm:gap-4">
                <button
                  onClick={() => setShowHistory(false)}
                  className={`relative px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 font-bold text-xs sm:text-sm md:text-lg transition-all overflow-hidden group ${
                    !showHistory 
                      ? 'text-amber-100' 
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {/* Background with borders */}
                  <div className={`absolute inset-0 transition-all ${
                    !showHistory
                      ? 'bg-gradient-to-r from-amber-900/60 via-amber-800/60 to-amber-900/60 border-2 border-amber-500/60 shadow-[0_0_30px_rgba(251,191,36,0.4)]'
                      : 'bg-stone-900/40 border-2 border-stone-700/40'
                  }`} style={{ clipPath: 'polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)' }} />
                  
                  {/* Glow effect on hover */}
                  {!showHistory && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/20 to-transparent animate-shimmer" style={{ clipPath: 'polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)' }} />
                  )}
                  
                  <span className="relative z-10 flex items-center gap-1 sm:gap-2">
                    <Swords className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                    <span className="hidden sm:inline">ACTIVE CRAWLS</span>
                    <span className="sm:hidden">ACTIVE</span>
                  </span>
                </button>

                <button
                  onClick={() => setShowHistory(true)}
                  className={`relative px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 font-bold text-xs sm:text-sm md:text-lg transition-all overflow-hidden group ${
                    showHistory 
                      ? 'text-amber-100' 
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {/* Background with borders */}
                  <div className={`absolute inset-0 transition-all ${
                    showHistory
                      ? 'bg-gradient-to-r from-amber-900/60 via-amber-800/60 to-amber-900/60 border-2 border-amber-500/60 shadow-[0_0_30px_rgba(251,191,36,0.4)]'
                      : 'bg-stone-900/40 border-2 border-stone-700/40'
                  }`} style={{ clipPath: 'polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)' }} />
                  
                  {/* Glow effect on hover */}
                  {showHistory && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/20 to-transparent animate-shimmer" style={{ clipPath: 'polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)' }} />
                  )}
                  
                  <span className="relative z-10 flex items-center gap-1 sm:gap-2">
                    <ScrollText className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                    CHRONICLES
                  </span>
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : showHistory ? (
            history.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-stone-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">No history available</p>
              </div>
            ) : (
              <div className="space-y-6">
                {history.map((crawl) =>
                  crawl.instances?.map((instance) => (
                    <div key={instance.id} className="bg-stone-900/80 border-2 border-stone-700/80 rounded-lg p-3 sm:p-4 md:p-6 backdrop-blur-sm shadow-xl">
                      <div className="mb-3 sm:mb-4">
                        <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold mb-2 text-amber-200 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">{crawl.name}</h2>
                        
                        {/* Timestamp info box */}
                        <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-stone-800/60 rounded-lg border-2 border-stone-600/60 backdrop-blur-sm">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                            {instance.level1StartedAt && (
                              <div>
                                <span className="text-stone-300">Started:</span>
                                <div className="text-stone-100 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                  {formatDateTime(instance.level1StartedAt)}
                                </div>
                              </div>
                            )}
                            {instance.status === 'completed' && instance.completedAt && (
                              <div>
                                <span className="text-green-400">Completed:</span>
                                <div className="text-stone-100 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                  {formatDateTime(instance.completedAt)}
                                </div>
                              </div>
                            )}
                            {instance.status === 'failed' && instance.updatedAt && (
                              <div>
                                <span className="text-red-400">Failed:</span>
                                <div className="text-stone-100 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                  {formatDateTime(instance.updatedAt)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-3 sm:gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            <span>
                              {instance.participantCount ?? instance.participants.length} / {crawl.requiredParticipants}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            <span>
                              Reward: +{crawl.rewardValue}
                              {crawl.rewardType === 'block_chance' ? '% Block Chance' : ' Life Force Cap'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span className={instance.status === 'failed' ? 'text-red-500 font-bold' : instance.status === 'completed' ? 'text-green-500 font-bold' : ''}>
                              Status: {instance.status.toUpperCase()}
                            </span>
                          </div>
                          {instance.myRewardCount !== undefined && instance.myRewardCount > 0 && (
                            <div className="flex items-center gap-2">
                              <Gift className="w-4 h-4 text-yellow-400" />
                              <span className="text-yellow-400 font-bold">
                                You won {instance.myRewardCount} reward{instance.myRewardCount !== 1 ? 's' : ''}!
                              </span>
                        </div>
                          )}
                          {instance.myRewardCount === 0 && instance.status === 'completed' && address && (
                            <div className="flex items-center gap-2">
                              <Gift className="w-4 h-4 text-gray-500" />
                              <span className="text-stone-400 text-sm">
                                No rewards won
                              </span>
                      </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map((level) => {
                          const completedCount = instance.participants.filter((p) => {
                            if (level === 1) return p.level1Completed
                            if (level === 2) return p.level2Completed
                            return p.level3Completed
                          }).length
                          const participationPercent =
                            instance.participants.length > 0
                              ? (completedCount / instance.participants.length) * 100
                              : 0
                          return (
                            <div key={level} className="border-2 border-stone-600/60 rounded-lg p-4 bg-stone-900/40 backdrop-blur-sm">
                              <h3 className="font-bold mb-2">Level {level}</h3>
                              <div className="text-sm text-stone-300">
                                {completedCount} / {instance.participants.length} - ({Math.round(participationPercent)}%)
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          ) : crawls.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-stone-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">No active dungeon crawls available</p>
            </div>
          ) : (
            <div>
              {/* Tab Navigation */}
              <div className="flex flex-wrap gap-2 mb-6 border-b-2 border-stone-700/60 pb-2">
                {crawls.map((crawl) => {
                  const activeInstances = crawl.instances?.filter(i => i.status !== 'failed') || []
                  const instance = activeInstances[0]
                  const hasNoInstance = !instance
                  const isActive = selectedCrawl?.id === crawl.id
                  
                  // Calculate countdown for tab display
                  let tabCountdown: string | null = null
                  if (hasNoInstance && crawl.nextRestartAt) {
                    const restartTime = new Date(crawl.nextRestartAt).getTime()
                    const timeUntilRestart = restartTime - nowRef.current
                    if (timeUntilRestart > 0) {
                      const hours = Math.floor(timeUntilRestart / (1000 * 60 * 60))
                      const minutes = Math.floor((timeUntilRestart % (1000 * 60 * 60)) / (1000 * 60))
                      if (hours > 0) {
                        tabCountdown = `${hours}h ${minutes}m`
                      } else if (minutes > 0) {
                        tabCountdown = `${minutes}m`
                      } else {
                        tabCountdown = 'Soon'
                      }
                    } else {
                      tabCountdown = 'Overdue'
                    }
                  } else if (instance) {
                    // Show time remaining for current level
                    const level1WindowData = calculateLevelWindow(instance, crawl, 1)
                    const level2WindowData = instance.status !== 'ready' && instance.level1CompletedAt 
                      ? calculateLevelWindow(instance, crawl, 2) 
                      : null
                    const level3WindowData = instance.status !== 'ready' && instance.status !== 'level_1' && instance.level2CompletedAt
                      ? calculateLevelWindow(instance, crawl, 3)
                      : null
                    
                    // Determine which window is currently active
                    const now = nowRef.current
                    let activeWindow: { windowStartMs: number; windowEndMs: number } | null = null
                    
                    if (level3WindowData && now >= level3WindowData.windowStartMs && now <= level3WindowData.windowEndMs) {
                      activeWindow = level3WindowData
                    } else if (level2WindowData && now >= level2WindowData.windowStartMs && now <= level2WindowData.windowEndMs) {
                      activeWindow = level2WindowData
                    } else if (level1WindowData && now >= level1WindowData.windowStartMs && now <= level1WindowData.windowEndMs) {
                      activeWindow = level1WindowData
                    }
                    
                    if (activeWindow) {
                      const timeLeft = Math.max(0, activeWindow.windowEndMs - now)
                      if (timeLeft > 0) {
                        const minutes = Math.floor(timeLeft / (1000 * 60))
                        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)
                        if (minutes > 0) {
                          tabCountdown = `${minutes}m ${seconds}s`
                        } else {
                          tabCountdown = `${seconds}s`
                        }
                      } else {
                        tabCountdown = 'Closed'
                      }
                    } else if (instance.status === 'ready') {
                      tabCountdown = 'Waiting'
                    } else {
                      tabCountdown = 'In Progress'
                    }
                  } else {
                    tabCountdown = 'Waiting'
                  }
                  
                  return (
                    <button
                      key={crawl.id}
                      onClick={() => {
                        setSelectedCrawl(crawl)
                        if (instance) {
                          setSelectedInstance(instance)
                        } else {
                          setSelectedInstance(null)
                        }
                      }}
                      className={`px-4 py-2 rounded-t-lg font-semibold text-sm transition-all ${
                        isActive
                          ? 'bg-stone-800/90 border-t-2 border-l-2 border-r-2 border-red-500/70 text-red-200'
                          : 'bg-stone-900/50 border-t-2 border-l-2 border-r-2 border-stone-600/40 text-stone-400 hover:bg-stone-800/70 hover:text-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{crawl.name}</span>
                        {tabCountdown && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            isActive ? 'bg-red-900/50' : 'bg-stone-700/50'
                          }`}>
                            {tabCountdown}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
              
              {/* Selected Crawl Content */}
              {selectedCrawl && (() => {
                const crawl = selectedCrawl
                // Filter out any failed instances that might have slipped through
                const activeInstances = crawl.instances?.filter(i => i.status !== 'failed') || []
                const instance = activeInstances[0]
                const hasNoInstance = !instance
                const isFailed = false // Already filtered out above
                
                // Calculate window data for this instance
                const level1WindowData = instance && !isFailed ? calculateLevelWindow(instance, crawl, 1) : null
                
                // Check if Level 1 window is closed and minimum is met (for showing Level 2)
                const level1CompletedCount = instance?.participants?.filter(p => p.level1Completed).length || 0
                const level1ParticipationPercent = instance?.participants?.length > 0 
                  ? (level1CompletedCount / crawl.requiredParticipants) * 100 
                  : 0
                const level1WindowClosed = level1WindowData 
                  ? nowRef.current > level1WindowData.windowEndMs 
                  : false
                const level1MinimumMet = level1ParticipationPercent >= crawl.minParticipationPercent
                const shouldShowLevel2 = instance && !isFailed && (
                  (instance.status !== 'ready' && instance.level1CompletedAt) || // Normal case: status advanced
                  (level1WindowClosed && level1MinimumMet) // Window closed and minimum met
                )
                
                // Calculate Level 2 window data if we should show it
                const level2WindowData = shouldShowLevel2 
                  ? calculateLevelWindow(instance, crawl, 2) 
                  : null
                
                // Check if Level 2 window is closed and minimum is met (for showing Level 3)
                const level2CompletedCount = instance?.participants?.filter(p => p.level2Completed).length || 0
                const level2ParticipationPercent = instance?.participants?.length > 0 
                  ? (level2CompletedCount / crawl.requiredParticipants) * 100 
                  : 0
                const level2WindowClosed = level2WindowData 
                  ? nowRef.current > level2WindowData.windowEndMs 
                  : false
                const level2MinimumMet = level2ParticipationPercent >= crawl.minParticipationPercent
                const shouldShowLevel3 = instance && !isFailed && (
                  (instance.status !== 'ready' && instance.status !== 'level_1' && instance.level2CompletedAt) || // Normal case: status advanced
                  (level2WindowClosed && level2MinimumMet) // Window closed and minimum met
                )
                
                const level3WindowData = shouldShowLevel3
                  ? calculateLevelWindow(instance, crawl, 3)
                  : null
                
                // Compute effective status - frontend advances status when windows close and minimums are met
                let effectiveStatus = instance?.status || 'open'
                
                if (instance) {
                  // If level_1_started_at exists, Level 1 has started, so status should be at least 'level_1'
                  if (instance.level1StartedAt && effectiveStatus === 'ready') {
                    effectiveStatus = 'level_1'
                  }
                  
                  // Advance to level_1 when Level 1 window closes with minimum met (if still ready)
                  if (effectiveStatus === 'ready' && level1WindowClosed && level1MinimumMet) {
                    effectiveStatus = 'level_1'
                  }
                  
                  // Advance to level_2 when Level 2 window closes with minimum met
                  if (effectiveStatus === 'level_1' && level2WindowClosed && level2MinimumMet) {
                    effectiveStatus = 'level_2'
                  }
                  
                  // Advance to completed when Level 3 window closes with minimum met
                  if (effectiveStatus === 'level_2' && level3WindowData) {
                    const level3WindowClosed = nowRef.current > level3WindowData.windowEndMs
                    const level3CompletedCount = instance?.participants?.filter(p => p.level3Completed).length || 0
                    const level3ParticipationPercent = instance?.participants?.length > 0 
                      ? (level3CompletedCount / crawl.requiredParticipants) * 100 
                      : 0
                    const level3MinimumMet = level3ParticipationPercent >= crawl.minParticipationPercent
                    if (level3WindowClosed && level3MinimumMet) {
                      effectiveStatus = 'completed'
                    }
                  }
                  
                  // If level_2_started_at exists, Level 2 has started, so status should be at least 'level_2'
                  if (instance.level2StartedAt && (effectiveStatus === 'ready' || effectiveStatus === 'level_1')) {
                    effectiveStatus = 'level_2'
                  }
                  
                  // If level_3_started_at exists, Level 3 has started, so status should be at least 'level_3'
                  if (instance.level3StartedAt && (effectiveStatus === 'ready' || effectiveStatus === 'level_1' || effectiveStatus === 'level_2')) {
                    effectiveStatus = 'level_3'
                  }
                }

                let countdownText: string | null = null
                let isOverdue = false
                if (hasNoInstance && crawl.nextRestartAt) {
                  const restartTime = new Date(crawl.nextRestartAt).getTime()
                  const timeUntilRestart = restartTime - nowRef.current
                    if (timeUntilRestart > 0) {
                      const hours = Math.floor(timeUntilRestart / (1000 * 60 * 60))
                      const minutes = Math.floor((timeUntilRestart % (1000 * 60 * 60)) / (1000 * 60))
                      const seconds = Math.floor((timeUntilRestart % (1000 * 60)) / 1000)
                      if (hours > 0) {
                        countdownText = `Next crawl starts in ${hours}h ${minutes}m ${seconds}s`
                      } else if (minutes > 0) {
                        countdownText = `Next crawl starts in ${minutes}m ${seconds}s`
                      } else {
                        countdownText = `Next crawl starts in ${seconds}s`
                      }
                    } else {
                      isOverdue = true
                      const timeOverdue = Math.abs(timeUntilRestart)
                      const hours = Math.floor(timeOverdue / (1000 * 60 * 60))
                      const minutes = Math.floor((timeOverdue % (1000 * 60 * 60)) / (1000 * 60))
                      if (hours > 0) {
                        countdownText = `Restart overdue by ${hours}h ${minutes}m - should be available soon`
                      } else if (minutes > 0) {
                        countdownText = `Restart overdue by ${minutes}m - should be available soon`
                      } else {
                        countdownText = 'Restart overdue - should be available soon'
                      }
                    }
                } else if (hasNoInstance) {
                    countdownText = 'Waiting for restart...'
                  }

                return (
                  <div key={crawl.id} className="relative group">
                    {/* Corner decorations with red accents */}
                    <div className="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-red-500/60" />
                    <div className="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-amber-500/60" />
                    <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-amber-500/60" />
                    <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-red-500/60" />
                    
                    {/* Spinning Orbs on sides */}
                    <div className="spinning-orb absolute -left-12 top-1/4 w-24 h-24 opacity-20 group-hover:opacity-40 transition-opacity" />
                    <div className="spinning-orb absolute -right-12 top-3/4 w-24 h-24 opacity-20 group-hover:opacity-40 transition-opacity" style={{ animationDelay: '-10s' }} />
                    
                    <div className="dungeon-card rounded-lg p-3 sm:p-4 md:p-6 backdrop-blur-sm relative overflow-hidden">
                      {/* Side glow decorations */}
                      <div className="absolute top-1/2 -translate-y-1/2 -left-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all duration-500" />
                      <div className="absolute top-1/2 -translate-y-1/2 -right-20 w-40 h-40 bg-red-500/10 rounded-full blur-3xl group-hover:bg-red-500/20 transition-all duration-500" />
                      
                      <div className="mb-3 sm:mb-4 md:mb-6 relative z-10">
                        {/* Crawl name with decorative line */}
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3 md:mb-4">
                          <Shield className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                          <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-300 via-amber-200 to-red-300 tracking-wide">
                            {crawl.name.toUpperCase()}
                          </h2>
                          <div className="flex-1 h-px bg-gradient-to-r from-red-500/50 via-amber-500/50 to-transparent" />
                        </div>
                        {crawl.description && (
                          <p className="text-amber-100/70 text-xs sm:text-sm md:text-base lg:text-lg italic border-l-2 border-red-500/30 pl-2 sm:pl-3 md:pl-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                            {crawl.description}
                          </p>
                        )}
                      </div>
                      
                      {/* Game-like stats panel */}
                      <div className="mb-3 sm:mb-4 md:mb-6 relative">
                        {/* Decorative corner brackets with red */}
                        <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-red-400/50" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-400/50" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-400/50" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-red-400/50" />
                        
                        <div className="p-2 sm:p-3 md:p-4 lg:p-6 bg-black/60 rounded border border-red-900/40 backdrop-blur-sm relative overflow-hidden">
                          {/* Subtle scan line effect */}
                          <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 via-amber-500/5 to-transparent pointer-events-none animate-pulse" />
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4 text-xs sm:text-sm relative z-10">
                            <div className="flex items-start gap-2 sm:gap-3">
                              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 mt-0.5 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)] flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-amber-400/80 text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Established</div>
                                <div className="text-amber-100 font-mono font-bold text-[10px] sm:text-xs md:text-sm break-words">{formatDateTime(crawl.createdAt)}</div>
                              </div>
                            </div>
                          
                          {/* Last completed/failed timestamps - Always show */}
                          <div className="flex items-start gap-2 sm:gap-3">
                            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 mt-0.5 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)] flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-emerald-400/80 text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Last Victory</div>
                              <div className="text-emerald-100 font-mono font-bold text-[10px] sm:text-xs md:text-sm">
                                {crawl.lastCompletedAt ? (() => {
                                  const minutesAgo = Math.floor((nowRef.current - new Date(crawl.lastCompletedAt).getTime()) / (1000 * 60))
                                  const hoursAgo = Math.floor(minutesAgo / 60)
                                  const daysAgo = Math.floor(hoursAgo / 24)
                                  if (daysAgo > 0) return `${daysAgo}d ${hoursAgo % 24}h ago`
                                  if (hoursAgo > 0) return `${hoursAgo}h ${minutesAgo % 60}m ago`
                                  return `${minutesAgo}m ago`
                                })() : 'Never'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 sm:gap-3">
                            <Skull className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 mt-0.5 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)] flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-red-400/80 text-[10px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Last Defeat</div>
                              <div className="text-red-100 font-mono font-bold text-[10px] sm:text-xs md:text-sm">
                                {crawl.lastFailedAt ? (() => {
                                  const minutesAgo = Math.floor((nowRef.current - new Date(crawl.lastFailedAt).getTime()) / (1000 * 60))
                                  const hoursAgo = Math.floor(minutesAgo / 60)
                                  const daysAgo = Math.floor(hoursAgo / 24)
                                  if (daysAgo > 0) return `${daysAgo}d ${hoursAgo % 24}h ago`
                                  if (hoursAgo > 0) return `${hoursAgo}h ${minutesAgo % 60}m ago`
                                  return `${minutesAgo}m ago`
                                })() : 'Never'}
                              </div>
                            </div>
                          </div>
                          
                          {instance ? (
                            instance.status === 'failed' && crawl.nextRestartAt ? (
                              <div>
                                <span className="text-yellow-400">Starts At:</span>
                                <div className="text-stone-100 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{formatDateTime(crawl.nextRestartAt)}</div>
                                <div className="text-yellow-300 text-sm mt-1">
                                  Countdown: {formatCountdown(crawl.nextRestartAt)}
                                </div>
                              </div>
                            ) : instance.level1StartedAt ? (
                              <div>
                                <span className="text-green-400">Started:</span>
                                <div className="text-stone-100 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{formatDateTime(instance.level1StartedAt)}</div>
                              </div>
                            ) : instance.status === 'ready' ? (
                              <div>
                                <span className="text-yellow-400">Ready - Waiting for Start:</span>
                                <div className="text-stone-200 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Level 1 will begin when first participant completes</div>
                              </div>
                            ) : (
                              <div>
                                <span className="text-stone-300">Status:</span>
                                <div className="text-stone-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{instance.status === 'open' || instance.status === 'filling' ? 'Waiting for participants...' : 'Not started yet'}</div>
                              </div>
                            )
                          ) : crawl.nextRestartAt ? (
                            <div>
                              <span className="text-yellow-400">Starts At:</span>
                              <div className="text-white font-mono">{formatDateTime(crawl.nextRestartAt)}</div>
                              <div className="text-yellow-300 text-sm mt-1">
                                Countdown: {formatCountdown(crawl.nextRestartAt)}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-gray-400">Status:</span>
                              <div className="text-stone-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Waiting to start</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* PROMINENT REWARD BANNER */}
                      <div className="mb-2 sm:mb-3 md:mb-4 lg:mb-6 relative">
                        <div className="bg-gradient-to-r from-amber-900/80 via-yellow-900/80 to-amber-900/80 border border-amber-500/60 sm:border-2 rounded-lg p-2 sm:p-3 md:p-4 lg:p-5 shadow-[0_0_30px_rgba(251,191,36,0.3)] relative overflow-hidden">
                          {/* Animated background glow */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/10 to-transparent animate-shimmer" />
                          
                          <div className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2 md:gap-3 lg:gap-4">
                            <Shield className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 xl:w-10 xl:h-10 text-amber-300 drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]" />
                            <div className="text-center">
                              <div className="text-[9px] sm:text-[10px] md:text-xs uppercase tracking-wider text-amber-300/80 mb-0.5">REWARD</div>
                              <div className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl font-black text-amber-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                                +{crawl.rewardValue}
                                <span className="text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl text-amber-200/90">
                                  {crawl.rewardType === 'block_chance' ? '% Block Chance' : ' Life Force Cap'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Secondary info bar */}
                      <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4 text-xs sm:text-sm mb-3 sm:mb-4">
                        {instance && (
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            <span>
                              {instance.participantCount ?? instance.participants.length} / {crawl.requiredParticipants}
                            </span>
                          </div>
                        )}
                        {crawl.allowedTraits && crawl.allowedTraits !== 'all' && (
                          <div className="flex items-center gap-2">
                            <Sword className="w-4 h-4" />
                            <span className="text-purple-400">
                              {crawl.allowedTraits === 'angelic' ? 'Angelic Only' : 'Demonic Only'}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-red-400" />
                          <span className="text-red-300">
                            Restart after fail: {crawl.restartAfterFailureHours}h
                          </span>
                        </div>
                        {!crawl.neverRestartAfterCompletion && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-green-400" />
                            <span className="text-green-300">
                              Cooldown after win: {crawl.cooldownHours}h
                            </span>
                          </div>
                        )}
                        {crawl.neverRestartAfterCompletion && (
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-yellow-400" />
                            <span className="text-yellow-300">
                              One-time only (no restart)
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {hasNoInstance && countdownText ? (
                            <span className={isOverdue ? 'text-orange-400 font-bold' : 'text-yellow-400 font-bold'}>
                              {countdownText}
                            </span>
                          ) : instance ? (
                            <span className={effectiveStatus === 'failed' ? 'text-red-500 font-bold' : ''}>
                              Status: {effectiveStatus === 'failed' ? 'FAILED' : effectiveStatus.toUpperCase()}
                            </span>
                          ) : (
                            <span className="text-stone-300">Waiting for restart...</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {hasNoInstance ? (
                      <div className={`${isOverdue ? 'bg-orange-900/50 border-orange-600' : 'bg-yellow-900/50 border-yellow-600'} border sm:border-2 rounded-lg p-2 sm:p-3 md:p-4 mb-3 sm:mb-4 md:mb-5 lg:mb-6 backdrop-blur-sm shadow-lg`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className={`${isOverdue ? 'text-orange-400' : 'text-yellow-400'} font-bold text-xs sm:text-sm md:text-base`}>No active dungeon crawl</p>
                            <p className="text-stone-300 text-[10px] sm:text-xs md:text-sm mt-1 sm:mt-1.5 md:mt-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                              {countdownText || 'Waiting for restart... The next crawl will be available soon.'}
                            </p>
                          </div>
                          <Button
                            type="button"
                            onClick={() => {
                              if (fetchCrawlsRef.current) {
                                fetchCrawlsRef.current()
                              }
                            }}
                            disabled={loading}
                            className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9 p-0 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/60 text-amber-100 disabled:opacity-50"
                            title="Refresh"
                          >
                            {loading ? (
                              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                            ) : (
                              <RotateCw className="h-4 w-4 sm:h-5 sm:w-5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : isFailed ? (
                      <div className="bg-red-900/50 border-2 border-red-600 rounded-lg p-4 mb-6 backdrop-blur-sm shadow-lg">
                        <p className="text-red-400 font-bold">This dungeon crawl has failed due to insufficient participation.</p>
                        <p className="text-stone-300 text-sm mt-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">It will be restarted according to the restart schedule.</p>
                      </div>
                    ) : instance ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-5 md:mb-6">
                          {[1, 2, 3].map((level) => {
                            if (!instance) return null
                            
                            // Check if Level 1 window is closed and minimum is met (for showing Level 2)
                            const level1CompletedCount = instance.participants.filter(p => p.level1Completed).length
                            const level1ParticipationPercent = instance.participants.length > 0 
                              ? (level1CompletedCount / crawl.requiredParticipants) * 100 
                              : 0
                            const level1WindowClosed = level1WindowData 
                              ? nowRef.current > level1WindowData.windowEndMs 
                              : false
                            const level1MinimumMet = level1ParticipationPercent >= crawl.minParticipationPercent
                            
                            // Check if Level 2 window is closed and minimum is met (for showing Level 3)
                            const level2CompletedCount = instance.participants.filter(p => p.level2Completed).length
                            const level2ParticipationPercent = instance.participants.length > 0 
                              ? (level2CompletedCount / crawl.requiredParticipants) * 100 
                              : 0
                            const level2WindowClosed = level2WindowData 
                              ? nowRef.current > level2WindowData.windowEndMs 
                              : false
                            const level2MinimumMet = level2ParticipationPercent >= crawl.minParticipationPercent
                            
                            // Show Level 2 if: effective status allows it OR (window closed AND minimum met)
                            if (level === 2 && effectiveStatus === 'ready' && !(level1WindowClosed && level1MinimumMet)) {
                              return null
                            }
                            // Show Level 3 if: effective status allows it OR (window closed AND minimum met)
                            if (level === 3 && (effectiveStatus === 'ready' || effectiveStatus === 'level_1') && !(level2WindowClosed && level2MinimumMet)) {
                              return null
                            }
                            
                            const windowData = level === 1 ? level1WindowData : level === 2 ? level2WindowData : level3WindowData

                        // Create instance with effective status for this level
                        const instanceWithEffectiveStatus = {
                          ...instance,
                          status: effectiveStatus
                        }

                        return (
                              <LevelCard
                            key={level}
                                level={level}
                                instance={instanceWithEffectiveStatus}
                                crawl={crawl}
                                windowData={windowData}
                                myParticipant={myParticipant ?? null}
                                onComplete={handleCompleteLevel}
                                completingLevel={completingLevel}
                                currentTime={nowRef.current} // Pass current time, updates every second via forceUpdate
                              />
                            )
                          })}
                        </div>

                        {/* Select Ordinals to Join - Show above Battle Formation, hide if full */}
                        {instance && (() => {
                          // Don't show join section for failed instances
                          if (!instance || effectiveStatus === 'failed') return false
                          // Hide if crawl is full
                          const currentParticipantCount = instance.participantCount ?? instance.participants.length
                          if (currentParticipantCount >= crawl.requiredParticipants) return false
                          // Show for open/filling
                          if (effectiveStatus === 'open' || effectiveStatus === 'filling') return true
                          // For 'ready' status, only show if window is still open (hasn't expired)
                          if (effectiveStatus === 'ready') {
                            if (!level1WindowData) return false
                            const now = Date.now()
                            // windowEndMs is already the absolute end time
                            return now < level1WindowData.windowEndMs
                          }
                          return false
                        })() && (
                          <div className="border-t-2 border-stone-700/60 pt-6 mb-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
                              <h3 className="font-bold text-base sm:text-lg">Select Ordinals to Join</h3>
                              <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => {
                                const currentParticipantCount = instance.participantCount ?? instance.participants.length
                                const spotsLeft = Math.max(0, crawl.requiredParticipants - currentParticipantCount)
                                
                                const available = ordinals.filter(
                                  (o) => {
                                    if (crawl.allowedTraits === 'angelic' && o.trait !== 'Angelic') return false
                                    if (crawl.allowedTraits === 'demonic' && o.trait !== 'Demonic') return false
                                    return !instance.participants.some((p) => p.inscriptionId === o.inscriptionId)
                                  }
                                )
                                
                                if (crawl.allowMultipleFromStock) {
                                  // Only select up to the number of spots left
                                  const toSelect = available.slice(0, spotsLeft)
                                  setSelectedOrdinalsForInstance(instance.id, new Set(toSelect.map((o) => o.inscriptionId)))
                                } else {
                                  setSelectedOrdinalsForInstance(instance.id, new Set(available.slice(0, 1).map((o) => o.inscriptionId)))
                                }
                              }}
                                  className="border-2 border-stone-600 hover:border-stone-500 bg-stone-800/70 hover:bg-stone-700/80 text-white text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg backdrop-blur-sm transition-all"
                            >
                              Select All Available
                            </Button>
                            <Button
                              onClick={() => {
                                const currentParticipantCount = instance.participantCount ?? instance.participants.length
                                const spotsLeft = Math.max(0, crawl.requiredParticipants - currentParticipantCount)
                                
                                const angelic = ordinals.filter(
                                  (o) => {
                                        if (crawl.allowedTraits === 'demonic') return false
                                    return o.trait === 'Angelic' && !instance.participants.some((p) => p.inscriptionId === o.inscriptionId)
                                  }
                                )
                                
                                if (crawl.allowMultipleFromStock) {
                                  // Only select up to the number of spots left
                                  const toSelect = angelic.slice(0, spotsLeft)
                                  setSelectedOrdinalsForInstance(instance.id, new Set(toSelect.map((o) => o.inscriptionId)))
                                } else {
                                  setSelectedOrdinalsForInstance(instance.id, new Set(angelic.slice(0, 1).map((o) => o.inscriptionId)))
                                }
                              }}
                                  className="border-2 border-blue-500 hover:border-blue-400 bg-blue-900/50 hover:bg-blue-800/60 text-white text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg backdrop-blur-sm transition-all shadow-md hover:shadow-blue-500/20"
                            >
                              Select Angelic
                            </Button>
                            <Button
                              onClick={() => {
                                const currentParticipantCount = instance.participantCount ?? instance.participants.length
                                const spotsLeft = Math.max(0, crawl.requiredParticipants - currentParticipantCount)
                                
                                const demonic = ordinals.filter(
                                  (o) => {
                                        if (crawl.allowedTraits === 'angelic') return false
                                    return o.trait === 'Demonic' && !instance.participants.some((p) => p.inscriptionId === o.inscriptionId)
                                  }
                                )
                                
                                if (crawl.allowMultipleFromStock) {
                                  // Only select up to the number of spots left
                                  const toSelect = demonic.slice(0, spotsLeft)
                                  setSelectedOrdinalsForInstance(instance.id, new Set(toSelect.map((o) => o.inscriptionId)))
                                } else {
                                  setSelectedOrdinalsForInstance(instance.id, new Set(demonic.slice(0, 1).map((o) => o.inscriptionId)))
                                }
                              }}
                                  className="border-2 border-red-500 hover:border-red-400 bg-red-900/50 hover:bg-red-800/60 text-white text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg backdrop-blur-sm transition-all shadow-md hover:shadow-red-500/20"
                            >
                              Select Demonic
                            </Button>
                            {getSelectedOrdinals(instance.id).size > 0 && (
                              <Button
                                onClick={() => setSelectedOrdinalsForInstance(instance.id, new Set())}
                                    className="border-2 border-stone-600 hover:border-stone-500 bg-stone-800/70 hover:bg-stone-700/80 text-white text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg backdrop-blur-sm transition-all"
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 mb-4 max-h-96 overflow-y-auto">
                          {ordinals
                            .filter((o) => {
                              if (crawl.allowedTraits === 'angelic' && o.trait !== 'Angelic') return false
                              if (crawl.allowedTraits === 'demonic' && o.trait !== 'Demonic') return false
                              return !instance.participants.some((p) => p.inscriptionId === o.inscriptionId)
                            })
                            .map((ordinal) => {
                            const instanceSelectedOrdinals = getSelectedOrdinals(instance.id)
                            const isSelected = instanceSelectedOrdinals.has(ordinal.inscriptionId)
                            const isInCrawl = instance.participants.some(
                              (p) => p.inscriptionId === ordinal.inscriptionId
                            )

                            return (
                              <div
                                key={ordinal.inscriptionId}
                                className={`relative border rounded-lg overflow-hidden cursor-pointer transition-all ${
                                  isSelected
                                    ? 'border-green-500 ring-2 ring-green-500'
                                    : isInCrawl
                                          ? 'border-stone-500 opacity-50'
                                          : 'border-stone-600 hover:border-stone-500'
                                }`}
                                onClick={() => {
                                  if (isInCrawl) return
                                  const newSet = new Set(instanceSelectedOrdinals)
                                  if (isSelected) {
                                    newSet.delete(ordinal.inscriptionId)
                                  } else {
                                    if (!crawl.allowMultipleFromStock && instanceSelectedOrdinals.size > 0) {
                                      toast.error('Only one ordinal allowed per wallet')
                                      return
                                    }
                                    newSet.add(ordinal.inscriptionId)
                                  }
                                  setSelectedOrdinalsForInstance(instance.id, newSet)
                                }}
                              >
                                <div className="aspect-square relative">
                                  <Image
                                    src={ordinal.imageUrl}
                                    alt={ordinal.inscriptionId}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                  />
                                </div>
                                    <div className="p-2 bg-stone-900/90 backdrop-blur-sm">
                                      <div className="text-sm truncate text-stone-200">{ordinal.trait}</div>
                                </div>
                                {isSelected && (
                                      <div className="absolute top-2 right-2 bg-amber-500 rounded-full p-1 shadow-lg">
                                    <CheckCircle2 className="w-4 h-4 text-white" />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        <Button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleJoin(instance.id)
                          }}
                          disabled={joining || getSelectedOrdinals(instance.id).size === 0 || !connected || effectiveStatus === 'ready'}
                              className="w-full border-2 border-amber-600 hover:border-amber-500 bg-amber-900/50 hover:bg-amber-800/60 text-white font-bold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-amber-500/30 backdrop-blur-sm"
                        >
                          {joining ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Joining...
                            </>
                          ) : effectiveStatus === 'ready' ? (
                            'Crawl is Full - Waiting for Start'
                          ) : (
                            `Join with ${getSelectedOrdinals(instance.id).size} Ordinal(s)`
                          )}
                        </Button>
                      </div>
                        )}

                        {/* Participants Visualization - Battle Formation */}
                        {instance && instance.participants.length > 0 && (
                          <div className="border-t-2 border-stone-700/60 pt-4 mb-6">
                            <button
                              onClick={() => setBattleFormationExpanded(!battleFormationExpanded)}
                              className="w-full font-bold mb-3 flex items-center justify-between gap-2 text-amber-200 drop-shadow-[0_2px_8px_rgba(251,191,36,0.5)] hover:text-amber-100 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-amber-400" />
                                <span className="text-sm sm:text-base">BATTLE FORMATION ({instance.participants.length} / {crawl.requiredParticipants})</span>
                              </div>
                              {battleFormationExpanded ? (
                                <ChevronUp className="w-5 h-5 text-amber-400" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-amber-400" />
                              )}
                            </button>
                            {/* Group participants by wallet */}
                            {battleFormationExpanded && (
                              <div className="flex flex-wrap gap-4">
                              {(() => {
                                // Group participants by wallet
                                const participantsByWallet = new Map<string, typeof instance.participants>()
                                instance.participants.forEach(p => {
                                  const wallet = p.wallet.toLowerCase()
                                  if (!participantsByWallet.has(wallet)) {
                                    participantsByWallet.set(wallet, [])
                                  }
                                  participantsByWallet.get(wallet)!.push(p)
                                })
                                
                                return Array.from(participantsByWallet.entries()).map(([wallet, armyParticipants], groupIndex) => {
                                  const firstParticipant = armyParticipants[0]
                                  const truncateWallet = (wallet: string) => {
                                    if (wallet.length <= 12) return wallet
                                    return `${wallet.slice(0, 6)}…${wallet.slice(-6)}`
                                  }
                                  const displayName = firstParticipant.username?.trim() || truncateWallet(firstParticipant.wallet)
                                  const displayInitials = firstParticipant.username
                                    ? firstParticipant.username.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()
                                    : truncateWallet(firstParticipant.wallet).slice(0, 2)
                                  
                                  // Check army progress
                                  const armyProgress = armyParticipants.reduce((acc, p) => ({
                                    level1: acc.level1 + (p.level1Completed ? 1 : 0),
                                    level2: acc.level2 + (p.level2Completed ? 1 : 0),
                                    level3: acc.level3 + (p.level3Completed ? 1 : 0),
                                  }), { level1: 0, level2: 0, level3: 0 })
                                  
                                  const allComplete = armyProgress.level1 === armyParticipants.length && 
                                                     armyProgress.level2 === armyParticipants.length && 
                                                     armyProgress.level3 === armyParticipants.length
                                  const hasProgress = armyProgress.level1 > 0 || armyProgress.level2 > 0 || armyProgress.level3 > 0
                                  
                                  return (
                                    <div
                                      key={wallet}
                                      className={`group relative rounded-xl border-2 backdrop-blur-sm transition-all duration-300 ${
                                        allComplete
                                          ? 'border-emerald-400/80 bg-emerald-900/20 shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/50'
                                          : hasProgress
                                          ? 'border-amber-400/70 bg-amber-900/15 shadow-md shadow-amber-500/20 hover:shadow-lg hover:shadow-amber-500/40'
                                          : 'border-stone-600/60 bg-stone-900/50 shadow-sm hover:shadow-md hover:border-stone-500'
                                      }`}
                                    >
                                      {/* Glow effect */}
                                      {hasProgress && (
                                        <div className={`absolute -inset-0.5 rounded-xl blur-sm opacity-50 ${
                                          allComplete ? 'bg-emerald-500/40' : 'bg-amber-500/30'
                                        }`} style={{ zIndex: -1 }} />
                                      )}
                                      
                                      <div className="p-3">
                                        {/* Owner header */}
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-stone-700/50">
                                          {firstParticipant.avatarUrl ? (
                                            <Image
                                              src={firstParticipant.avatarUrl}
                                              alt={displayName}
                                              width={24}
                                              height={24}
                                              className={`h-6 w-6 rounded-full border-2 transition-all ${
                                                allComplete
                                                  ? 'border-emerald-400 shadow-md shadow-emerald-500/50'
                                                  : hasProgress
                                                  ? 'border-amber-400 shadow-sm shadow-amber-500/40'
                                                  : 'border-stone-600'
                                              }`}
                                            />
                              ) : (
                                            <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-stone-800/90 text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${
                                              allComplete
                                                ? 'border-emerald-400 text-emerald-200'
                                                : hasProgress
                                                ? 'border-amber-400 text-amber-200'
                                                : 'border-stone-600 text-stone-200'
                                            }`}>
                                              {displayInitials}
                                            </span>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-bold truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
                                              allComplete
                                                ? 'text-emerald-200'
                                                : hasProgress
                                                ? 'text-amber-200'
                                                : 'text-stone-200'
                                            }`}>
                                              {displayName}
                            </div>
                                            <div className="text-[10px] text-stone-400">
                                              {armyParticipants.length} unit{armyParticipants.length !== 1 ? 's' : ''}
                            </div>
                                          </div>
                                          {/* Army progress badges */}
                                          <div className="flex items-center gap-1">
                                            {armyProgress.level1 > 0 && (
                                              <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                armyProgress.level1 === armyParticipants.length
                                                  ? 'bg-emerald-500/30 text-emerald-200'
                                                  : 'bg-amber-500/30 text-amber-200'
                                              }`}>
                                                L1: {armyProgress.level1}/{armyParticipants.length}
                                              </div>
                                            )}
                                            {armyProgress.level2 > 0 && (
                                              <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                armyProgress.level2 === armyParticipants.length
                                                  ? 'bg-emerald-500/30 text-emerald-200'
                                                  : 'bg-amber-500/30 text-amber-200'
                                              }`}>
                                                L2: {armyProgress.level2}/{armyParticipants.length}
                              </div>
                            )}
                                            {armyProgress.level3 > 0 && (
                                              <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                armyProgress.level3 === armyParticipants.length
                                                  ? 'bg-emerald-500/30 text-emerald-200'
                                                  : 'bg-amber-500/30 text-amber-200'
                                              }`}>
                                                L3: {armyProgress.level3}/{armyParticipants.length}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        
                                        {/* Army units in a horizontal row */}
                                        <div className="overflow-x-auto -mx-3 px-3">
                                          <div className="flex gap-2 min-w-max">
                                            {armyParticipants.map((participant, index) => {
                                            const allLevelsCompleted = participant.level1Completed && participant.level2Completed && participant.level3Completed
                                            const level1Done = participant.level1Completed
                                            const level2Done = participant.level2Completed
                                            const level3Done = participant.level3Completed
                                            const unitProgress = level1Done || level2Done || level3Done
                                            
                                            return (
                                              <div
                                                key={participant.id}
                                                className="group relative"
                                              >
                                                {/* Unit card */}
                                                <div
                                                  className={`relative rounded-lg border-2 backdrop-blur-sm transition-all duration-300 ${
                                                    allLevelsCompleted
                                                      ? 'border-emerald-400/80 bg-emerald-900/30 shadow-md shadow-emerald-500/30'
                                                      : unitProgress
                                                      ? 'border-amber-400/70 bg-amber-900/25 shadow-sm shadow-amber-500/20'
                                                      : 'border-stone-600/60 bg-stone-900/60'
                                                  }`}
                                                  style={{ width: '64px', height: '80px' }}
                                                >
                                                  <div className="h-full flex flex-col items-center justify-between p-2">
                                                    {/* Ordinal Image */}
                                                    {participant.image ? (
                                                      <div className={`relative h-11 w-11 overflow-hidden rounded-lg border transition-all duration-300 ${
                                                        allLevelsCompleted
                                                          ? 'border-emerald-400 shadow-md shadow-emerald-500/50'
                                                          : unitProgress
                                                          ? 'border-amber-400 shadow-sm shadow-amber-500/40'
                                                          : 'border-stone-600'
                                                      }`}>
                                                        <Image
                                                          src={participant.image}
                                                          alt={participant.inscriptionId}
                                                          fill
                                                          sizes="44px"
                                                          className="object-cover"
                                                        />
                                                      </div>
                                                    ) : (
                                                      <div className={`h-11 w-11 rounded-lg border bg-stone-800/90 flex items-center justify-center ${
                                                        unitProgress ? 'border-amber-400/60' : 'border-stone-600'
                                                      }`}>
                                                        <span className="text-xs text-stone-300">?</span>
                                                      </div>
                                                    )}
                                                    
                                                    {/* Level completion dots */}
                                                    <div className="flex gap-1 mt-1">
                                                      <div className={`h-2 w-2 rounded-full ${
                                                        level1Done
                                                          ? 'bg-emerald-400 shadow-sm shadow-emerald-500/80'
                                                          : 'bg-stone-700/60'
                                                      }`} />
                                                      <div className={`h-2 w-2 rounded-full ${
                                                        level2Done
                                                          ? 'bg-emerald-400 shadow-sm shadow-emerald-500/80'
                                                          : 'bg-stone-700/60'
                                                      }`} />
                                                      <div className={`h-2 w-2 rounded-full ${
                                                        level3Done
                                                          ? 'bg-emerald-400 shadow-sm shadow-emerald-500/80'
                                                          : 'bg-stone-700/60'
                                                      }`} />
                                                    </div>
                                                  </div>
                                                </div>
                          </div>
                        )
                      })}
                                            </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })
                              })()}
                              </div>
                            )}
                          </div>
                        )}

                      </>
                    ) : null}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </main>
      </div>
    </div>
    </GlobalStartTimeLock>
  )
}
