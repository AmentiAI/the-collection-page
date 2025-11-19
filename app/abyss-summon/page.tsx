'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlertTriangle, Flame, Loader2, Sparkles, Trophy, Volume2, VolumeX, Pause, Play, CheckCircle2, Info, ChevronDown } from 'lucide-react'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/Toast'
import { useWallet } from '@/lib/wallet/compatibility'

type SummonParticipant = {
  id: string
  wallet: string
  inscriptionId: string
  role: string
  image?: string | null
  joinedAt?: string | null
  completed?: boolean
  completedAt?: string | null
  username?: string | null
  avatarUrl?: string | null
}

type SummonRecord = {
  id: string
  creatorWallet: string
  creatorInscriptionId: string
  status: string
  requiredParticipants: number
  lockedAt?: string | null
  completedAt?: string | null
  expiresAt?: string | null
  bonusGranted: boolean
  createdAt: string
  updatedAt: string
  participants: SummonParticipant[]
}

type DamnedOption = {
  inscriptionId: string
  name?: string | null
  image?: string | null
}

type SummonLeaderboardEntry = {
  wallet: string
  username: string | null
  avatarUrl: string | null
  burns: number
  confirmedBurns: number
  hosted: number
  participated: number
  score: number
  lastBurnAt: string | null
  lastHostedAt: string | null
  lastParticipatedAt: string | null
}


// Static defaults; live mode is chosen via tabs in the component
const POWDER_CIRCLE_REWARD = 2
const ACTIVE_SUMMON_STATUSES = new Set(['open', 'filling', 'ready'])
const SUMMON_COMPLETION_WINDOW_MS = 2 * 60 * 1000
const SUMMON_BURN_POINTS = 6
const SUMMON_HOST_POINTS = 2
const SUMMON_PARTICIPATION_POINTS = 1
// The rest of the mode-dependent values are computed inside the component

function formatCountdown(ms: number) {
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

function formatTimestamp(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

// EST/EDT timezone handling
function isAbyssSummonClosed(): { isClosed: boolean; timeUntilOpen: number; timeUntilClose: number } {
  const now = new Date()
  
  // Debug: log that function is being called
  if (typeof window !== 'undefined') {
    console.log('[Abyss Summon] isAbyssSummonClosed called at:', now.toISOString())
  }
  
  // Get current time in EST/EDT using Intl.DateTimeFormat
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  })
  
  const estHour = parseInt(estFormatter.formatToParts(now).find(p => p.type === 'hour')?.value || '0')
  
  // Closed from 10:00 PM to 9:00 AM EST
  const isClosed = estHour >= 22 || estHour < 9
  
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
    // Calculate time until 9:00 AM EST (when it opens)
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond
    const targetTotalSeconds = 9 * 3600 // 9 AM
    
    let secondsUntil9 = targetTotalSeconds - currentTotalSeconds
    if (secondsUntil9 <= 0) {
      // Add 24 hours if we need to go to next day
      secondsUntil9 += 24 * 3600
    }
    
    const timeUntilOpen = secondsUntil9 * 1000
    return { isClosed: true, timeUntilOpen: Math.max(0, timeUntilOpen), timeUntilClose: 0 }
  } else {
    // Calculate time until 10:00 PM EST (when it closes)
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond
    const targetTotalSeconds = 22 * 3600 // 10 PM = 79200 seconds
    
    let secondsUntil10 = targetTotalSeconds - currentTotalSeconds
    
    // If we're at or past 10 PM (hour >= 22), we need tomorrow's 10 PM
    if (currentHour >= 22) {
      secondsUntil10 += 24 * 3600
    }
    // If we're before 10 PM, secondsUntil10 should already be positive
    // But if somehow it's negative or zero, add 24 hours as safety
    if (secondsUntil10 <= 0) {
      secondsUntil10 += 24 * 3600
    }
    
    const timeUntilClose = secondsUntil10 * 1000
    
    // Debug logging (remove after testing)
    if (typeof window !== 'undefined') {
      console.log('[Abyss Summon] Time calculation:', {
        estHour: currentHour,
        estMinute: currentMinute,
        currentTotalSeconds,
        targetTotalSeconds,
        secondsUntil10,
        timeUntilClose,
        timeUntilCloseMinutes: Math.floor(secondsUntil10 / 60),
      })
    }
    
    return { isClosed: false, timeUntilOpen: 0, timeUntilClose: Math.max(0, timeUntilClose) }
  }
}

export default function AbyssSummonPage() {
  const wallet = useWallet()
  const toast = useToast()

  const ordinalAddress = wallet.currentAddress?.trim() ?? ''
  const [isHolder, setIsHolder] = useState<boolean | null>(null)
  const [checkingHolder, setCheckingHolder] = useState(false)
  const [mode, setMode] = useState<'abyss' | 'powder' | 'damned_pool' | 'dead_demons'>('damned_pool')
  // Derive mode-dependent values locally so tabs switch instantly without reloads
  const IS_POWDER_MODE = mode === 'powder'
  const IS_DAMNED_POOL_MODE = mode === 'damned_pool'
  const IS_DEAD_DEMONS_MODE = mode === 'dead_demons'
  const SUMMON_REQUIRED_PARTICIPANTS = IS_DAMNED_POOL_MODE ? 40 : IS_POWDER_MODE ? 10 : IS_DEAD_DEMONS_MODE ? 10 : 8
  const SUMMON_API_BASE = IS_DAMNED_POOL_MODE
    ? '/api/damned-pool/circles'
    : IS_POWDER_MODE
    ? '/api/ascension/circles'
    : IS_DEAD_DEMONS_MODE
    ? '/api/dead-demons/circles'
    : '/api/abyss/summons'
  const SUMMON_LEADERBOARD_ENABLED = !IS_POWDER_MODE && !IS_DAMNED_POOL_MODE && !IS_DEAD_DEMONS_MODE
  const SUMMON_DURATION_MS = IS_DAMNED_POOL_MODE ? 30 * 60 * 1000 : IS_POWDER_MODE ? 10 * 60 * 1000 : IS_DEAD_DEMONS_MODE ? 10 * 60 * 1000 : 10 * 60 * 1000
  const SUMMONING_DISABLED = false // All modes enabled
  const SUMMONING_DISABLED_MESSAGE = IS_POWDER_MODE
    ? 'Ascension circles are currently paused.'
    : IS_DAMNED_POOL_MODE
    ? 'Damned pool circles are currently paused.'
    : 'The summoning has been completed. Thank you for your efforts!'
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoplayAttemptedRef = useRef(false)
  const finaleBeepedRef = useRef<Set<string>>(new Set())
  const lastLoadedSongRef = useRef<string | null>(null)
  const shouldContinuePlaylistRef = useRef(false)
  const lastLoadedAddressRef = useRef<string | null>(null)

  const [now, setNow] = useState(Date.now())
  const [summons, setSummons] = useState<SummonRecord[]>([])
  const [createdSummons, setCreatedSummons] = useState<SummonRecord[]>([])
  const [joinedSummons, setJoinedSummons] = useState<SummonRecord[]>([])
  const [summonsLoading, setSummonsLoading] = useState(false)
  const [bonusAllowance, setBonusAllowance] = useState(0)
  const [activeTab, setActiveTab] = useState<'active' | 'created' | 'joined' | 'afk'>('active')

  const [damnedOptions, setDamnedOptions] = useState<DamnedOption[]>([])
  const [damnedLoading, setDamnedLoading] = useState(false)
  const [damnedError, setDamnedError] = useState<string | null>(null)
  const [selectedInscriptionId, setSelectedInscriptionId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [poolMode, setPoolMode] = useState<'open_all' | 'bonus_credits'>('bonus_credits')
  const [joiningSummonId, setJoiningSummonId] = useState<string | null>(null)
  const [completingSummonId, setCompletingSummonId] = useState<string | null>(null)
  const [dismissingSummonId, setDismissingSummonId] = useState<string | null>(null)
  const [inscriptionImageCache, setInscriptionImageCache] = useState<Record<string, string>>({})
  const [summonLeaderboard, setSummonLeaderboard] = useState<SummonLeaderboardEntry[]>([])
  const [summonLeaderboardLoading, setSummonLeaderboardLoading] = useState(false)
  const [abyssClosed, setAbyssClosed] = useState({ isClosed: false, timeUntilOpen: 0, timeUntilClose: 0 })
  const [isDeadDemonsEligible, setIsDeadDemonsEligible] = useState<boolean | null>(null)
  const [tipsOpen, setTipsOpen] = useState(false)
  const [burnCount, setBurnCount] = useState<number | null>(null)
  const [inscriptionsInCircles, setInscriptionsInCircles] = useState<Set<string>>(new Set())
  const [afkCircleTotal, setAfkCircleTotal] = useState(0)
  const [afkCircleUserParticipants, setAfkCircleUserParticipants] = useState<Array<{
    id: string
    wallet: string
    inscriptionId: string
    inscriptionImage: string | null
    joinedAt: string
    lastRewardAt: string | null
  }>>([])
  const [afkCircleLoading, setAfkCircleLoading] = useState(false)
  const [afkCircleJoining, setAfkCircleJoining] = useState<string | null>(null)
  const [afkCircleLeaving, setAfkCircleLeaving] = useState<string | null>(null)
  const [musicReady, setMusicReady] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [isMusicMuted, setIsMusicMuted] = useState(false)
  const [musicVolume, setMusicVolume] = useState(15)
  const musicControlsDisabled = !musicReady && !musicPlaying
  
  // Playlist of 4 songs to cycle through
  const playlist = useMemo(() => [
    '/music/abysssummon2.mp3',
    '/music/summon2.mp3',
    '/music/summon.mp3',
    '/music/The Damned 3.mp3',
  ], [])
  const [currentSongIndex, setCurrentSongIndex] = useState(0)

  // Use "rock" instead of "ascension powder" if burn count is 0
  const useRockTerminology = burnCount === 0
  const powderTerm = useRockTerminology ? 'rock' : 'ascension powder'
  const powderTermCapitalized = useRockTerminology ? 'Rock' : 'Ascension Powder'

  const selectedOption = useMemo(
    () => damnedOptions.find((option) => option.inscriptionId === selectedInscriptionId) ?? null,
    [damnedOptions, selectedInscriptionId],
  )
  const circlesTouchedCount = useMemo(() => {
    const ids = new Set<string>()
    for (const s of createdSummons) ids.add(s.id)
    for (const s of joinedSummons) ids.add(s.id)
    return ids.size
  }, [createdSummons, joinedSummons])
  const confirmedPortalCount = useMemo(() => {
    if (!IS_DAMNED_POOL_MODE) return 0
    // Count unique completed portals across created and joined to avoid double counting
    const completedIds = new Set<string>()
    for (const s of createdSummons) {
      if (s.status === 'completed') completedIds.add(s.id)
    }
    for (const s of joinedSummons) {
      if (s.status === 'completed') completedIds.add(s.id)
    }
    return completedIds.size
  }, [IS_DAMNED_POOL_MODE, createdSummons, joinedSummons])
  const truncateWallet = useCallback((value: string) => {
    const normalized = value.trim()
    if (normalized.length <= 8) return normalized
    return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`
  }, [])


  useEffect(() => {
    if (damnedOptions.length === 0) {
      return
    }
    setInscriptionImageCache((prev) => {
      let changed = false
      const next = { ...prev }
      for (const option of damnedOptions) {
        if (option.inscriptionId && option.image && !next[option.inscriptionId]) {
          next[option.inscriptionId] = option.image
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [damnedOptions])

  useEffect(() => {
    const updates: Record<string, string> = {}
    for (const list of [summons, createdSummons, joinedSummons]) {
      for (const summon of list) {
        for (const participant of summon.participants) {
          if (participant.inscriptionId && participant.image && !inscriptionImageCache[participant.inscriptionId]) {
            updates[participant.inscriptionId] = participant.image
          }
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      setInscriptionImageCache((prev) => ({ ...prev, ...updates }))
    }
  }, [summons, createdSummons, joinedSummons, inscriptionImageCache])

  useEffect(() => {
    if (damnedOptions.length === 0) {
      setSelectedInscriptionId(null)
      return
    }
    setInscriptionImageCache((prev) => {
      let changed = false
      const next = { ...prev }
      for (const option of damnedOptions) {
        if (option.inscriptionId && option.image && !next[option.inscriptionId]) {
          next[option.inscriptionId] = option.image
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [damnedOptions])

  const previousSelectionRef = useRef<string | null>(null)

  useEffect(() => {
    previousSelectionRef.current = selectedInscriptionId
  }, [selectedInscriptionId])

  // Check holder status
  useEffect(() => {
    if (!ordinalAddress) {
      setIsHolder(null)
      return
    }

    let cancelled = false
    setCheckingHolder(true)
    
    Promise.all([
      fetch(`/api/magic-eden?ownerAddress=${encodeURIComponent(ordinalAddress)}&collectionSymbol=the-damned&fetchAll=true`).then(async (res) => {
        if (!res.ok) return { tokens: [] }
        return res.json()
      }).catch(() => ({ tokens: [] })),
      fetch(`/api/holders/check-access?walletAddress=${encodeURIComponent(ordinalAddress)}`).then(async (res) => {
        if (!res.ok) return { success: false, hasBurns: false }
        return res.json()
      }).catch(() => ({ success: false, hasBurns: false }))
    ]).then(([ordinalsData, burnsData]) => {
      if (cancelled) return
      const tokens = Array.isArray(ordinalsData.tokens) ? ordinalsData.tokens : (Array.isArray(ordinalsData) ? ordinalsData : [])
      const hasUnlisted = tokens.some((token: { listed?: boolean }) => token.listed === false)
      const hasAnyListed = tokens.some((token: { listed?: boolean }) => token.listed === true)
      const hasUnlistedOrdinals = hasUnlisted && !hasAnyListed
      const hasBurns = burnsData.success && burnsData.hasBurns
      setIsHolder(hasUnlistedOrdinals || hasBurns)
    }).catch(() => {
      if (!cancelled) setIsHolder(false)
    }).finally(() => {
      if (!cancelled) setCheckingHolder(false)
    })

    return () => {
      cancelled = true
    }
  }, [ordinalAddress])

  useEffect(() => {
    if (damnedOptions.length === 0) {
      setSelectedInscriptionId(null)
      return
    }
    const previousSelection = previousSelectionRef.current
    if (previousSelection) {
      const stillExists = damnedOptions.some((option) => option.inscriptionId === previousSelection)
      if (stillExists) {
        setSelectedInscriptionId(previousSelection)
        return
      }
    }
    setSelectedInscriptionId((prev) => {
      const exists = prev && damnedOptions.some((option) => option.inscriptionId === prev)
      if (exists) {
        return prev
      }
      return damnedOptions[0]?.inscriptionId ?? null
    })
  }, [damnedOptions])
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
      // Check if abyss-summon is closed (10 PM to 9 AM EST)
      setAbyssClosed(isAbyssSummonClosed())
    }, 1000)
    // Initial check
    setAbyssClosed(isAbyssSummonClosed())
    return () => window.clearInterval(intervalId)
  }, [])

  // Play beep when finale unlocks for any circle the user is in
  useEffect(() => {
    if (!ordinalAddress) return

    const playBeep = () => {
      try {
        // Create a simple beep using Web Audio API
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.value = 800 // Beep frequency
        oscillator.type = 'sine'

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.2)
      } catch (err) {
        // Fallback: use a simple beep if Web Audio API fails
        console.warn('Could not play beep sound:', err)
      }
    }

    // Check all circles the user is in
    const allCircles = [...summons, ...createdSummons, ...joinedSummons]
    const currentTime = now

    for (const summon of allCircles) {
      const isParticipant = summon.participants.some(
        (p) => p.wallet?.toLowerCase() === ordinalAddress.toLowerCase(),
      )

      if (!isParticipant) continue

      // Calculate if completion window is open
      const createdAtMs = Number.isFinite(Date.parse(summon.createdAt ?? ''))
        ? Date.parse(summon.createdAt ?? '')
        : Date.now()
      const localSummonDurationMs = IS_DAMNED_POOL_MODE
        ? (summon.requiredParticipants >= 40 ? 20 * 60 * 1000 : 10 * 60 * 1000)
        : SUMMON_DURATION_MS
      const rawExpiryMs = summon.expiresAt && Number.isFinite(Date.parse(summon.expiresAt))
        ? Date.parse(summon.expiresAt)
        : Number.NaN
      const fallbackExpiryMs = createdAtMs + localSummonDurationMs
      const targetExpiryMs = Number.isFinite(rawExpiryMs)
        ? Math.min(rawExpiryMs, fallbackExpiryMs)
        : fallbackExpiryMs
      const timeRemainingMs = targetExpiryMs - currentTime
      const completionWindowMs = IS_DAMNED_POOL_MODE ? 3 * 60 * 1000 : SUMMON_COMPLETION_WINDOW_MS
      const completionWindowOpen = timeRemainingMs > 0 && timeRemainingMs <= completionWindowMs

      // Play beep if window just opened and we haven't beeped for this circle yet
      if (completionWindowOpen && !finaleBeepedRef.current.has(summon.id)) {
        finaleBeepedRef.current.add(summon.id)
        playBeep()
      }

      // Remove from beeped set if window closes (in case circle gets extended or reset)
      if (!completionWindowOpen && finaleBeepedRef.current.has(summon.id)) {
        finaleBeepedRef.current.delete(summon.id)
      }
    }
  }, [now, summons, createdSummons, joinedSummons, ordinalAddress, IS_DAMNED_POOL_MODE, SUMMON_DURATION_MS])

  // Set up audio element once on mount
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => {
      setMusicPlaying(true)
      shouldContinuePlaylistRef.current = true
    }
    const handlePause = () => {
      setMusicPlaying(false)
      // Only stop playlist continuation if user manually paused
      // (not if it paused due to song ending)
      if (audioRef.current && audioRef.current.ended === false) {
        shouldContinuePlaylistRef.current = false
      }
    }
    const handleCanPlay = () => {
      setMusicReady(true)
      if (!autoplayAttemptedRef.current) {
        autoplayAttemptedRef.current = true
        // Try to play, but don't worry if blocked (user can start via controls)
        audio.play().catch(() => {
          // Autoplay blocked; this is normal - user interaction will allow playback
        })
      }
    }
    
    const handleUserInteraction = () => {
      // Once user has interacted, try to play if audio is ready
      // Check current state directly from audio element
      const currentAudio = audioRef.current
      if (currentAudio && currentAudio.readyState >= 2 && currentAudio.paused) {
        // Only play if volume is greater than 0 (not muted)
        if (currentAudio.volume > 0) {
          currentAudio.play().catch(() => {})
      }
    }
    }
    
    // Listen for any user interaction to enable playback
    document.addEventListener('click', handleUserInteraction, { once: true })
    document.addEventListener('touchstart', handleUserInteraction, { once: true })

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('canplay', handleCanPlay, { once: true })

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
    }
  }, [])

  // Handle playlist song changes and initial load
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const newSrc = playlist[currentSongIndex]
    
    // Only change src if it's actually different from what we last loaded
    if (lastLoadedSongRef.current !== newSrc) {
      lastLoadedSongRef.current = newSrc
      audio.src = newSrc
      audio.load()
      
      // Auto-play if we should continue the playlist (user started it and it hasn't been manually paused)
      if (shouldContinuePlaylistRef.current && !isMusicMuted && audio.volume > 0) {
        const playOnLoad = () => {
          const currentAudio = audioRef.current
          if (currentAudio && currentAudio.paused && shouldContinuePlaylistRef.current) {
            currentAudio.play().catch(() => {})
          }
        }
        audio.addEventListener('loadeddata', playOnLoad, { once: true })
        audio.addEventListener('canplay', playOnLoad, { once: true })
      }
    }
  }, [currentSongIndex, playlist, isMusicMuted, musicPlaying])

  // Set up ended handler separately to avoid re-attaching on every change
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => {
      // When song ends, move to next song in playlist
      // Keep playlist continuation flag true so next song auto-plays
      shouldContinuePlaylistRef.current = true
      const nextIndex = (currentSongIndex + 1) % playlist.length
      setCurrentSongIndex(nextIndex)
    }

    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('ended', handleEnded)
    }
  }, [currentSongIndex, playlist])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = isMusicMuted ? 0 : musicVolume / 100
    
    // If unmuted and audio is paused, try to play (user may have interacted)
    if (!isMusicMuted && audio.paused && musicReady) {
      audio.play().catch(() => {
        // Autoplay may still be blocked, that's okay
      })
    }
  }, [musicVolume, isMusicMuted, musicReady])

  useEffect(() => () => {
    audioRef.current?.pause()
  }, [])

  const activeSummons = useMemo(
    () => summons.filter((summon) => ACTIVE_SUMMON_STATUSES.has(summon.status)),
    [summons],
  )
  const createdActiveSummons = useMemo(
    () => createdSummons.filter((summon) => ACTIVE_SUMMON_STATUSES.has(summon.status)),
    [createdSummons],
  )
  const hasOwnActive = createdActiveSummons.length > 0
  const filteredActiveSummons = useMemo(() => {
    if (!ordinalAddress) return activeSummons
    const lowered = ordinalAddress.toLowerCase()
    return activeSummons.filter((summon) => summon.creatorWallet.toLowerCase() !== lowered)
  }, [activeSummons, ordinalAddress])

  const refreshSummons = useCallback(
    async (address: string) => {
      setSummonsLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('limit', '50')
        if (address) {
          params.set('wallet', address)
        }
        const query = params.toString()
        const endpoint = `${SUMMON_API_BASE}${query ? `?${query}` : ''}`
        const response = await fetch(endpoint, {
          cache: 'no-store',
        })
        if (!response.ok) {
          throw new Error(`Summon fetch failed (${response.status})`)
        }
        const data = await response.json()
        const openSummons = Array.isArray(data?.summons) ? (data.summons as SummonRecord[]) : []
        const openCircles = Array.isArray(data?.circles) ? (data.circles as SummonRecord[]) : []
        const created = Array.isArray(data?.createdSummons) ? (data.createdSummons as SummonRecord[]) : []
        const createdCircles = Array.isArray(data?.createdCircles) ? (data.createdCircles as SummonRecord[]) : []
        const joined = Array.isArray(data?.joinedSummons) ? (data.joinedSummons as SummonRecord[]) : []
        const joinedCircles = Array.isArray(data?.joinedCircles) ? (data.joinedCircles as SummonRecord[]) : []

        setSummons(openSummons.length > 0 ? openSummons : openCircles)
        setCreatedSummons(created.length > 0 ? created : createdCircles)
        setJoinedSummons(joined.length > 0 ? joined : joinedCircles)
        const rewardBalance = IS_POWDER_MODE || IS_DEAD_DEMONS_MODE
          ? Number(data?.powderBalance ?? 0)
          : Number(data?.bonusAllowance ?? 0)
        setBonusAllowance(Number.isFinite(rewardBalance) ? rewardBalance : 0)
        
        // Set eligibility for Dead Demons mode
        if (IS_DEAD_DEMONS_MODE && typeof data?.isEligible === 'boolean') {
          setIsDeadDemonsEligible(data.isEligible)
        }

        // Track which inscriptions are already in active circles
        const allActiveSummons = [
          ...(openSummons.length > 0 ? openSummons : openCircles),
          ...(created.length > 0 ? created : createdCircles),
          ...(joined.length > 0 ? joined : joinedCircles),
        ].filter((s) => ACTIVE_SUMMON_STATUSES.has(s.status))
        const inUseInscriptions = new Set<string>()
        for (const summon of allActiveSummons) {
          for (const participant of summon.participants) {
            if (participant.inscriptionId) {
              inUseInscriptions.add(participant.inscriptionId)
            }
          }
        }
        // Merge with existing AFK circle inscriptions (don't overwrite, merge)
        setInscriptionsInCircles((prev) => {
          const merged = new Set(prev)
          Array.from(inUseInscriptions).forEach((id) => merged.add(id))
          return merged
        })
      } catch (error) {
        console.error('Failed to load summons', error)
        toast.error('Failed to load summons. Please try again.')
      } finally {
        setSummonsLoading(false)
      }
    },
    [toast, SUMMON_API_BASE, IS_POWDER_MODE, IS_DEAD_DEMONS_MODE],
  )

  const fetchAfkCircle = useCallback(
    async (address: string) => {
      if (!address) {
        setAfkCircleTotal(0)
        setAfkCircleUserParticipants([])
        return
      }
      setAfkCircleLoading(true)
      try {
        const response = await fetch(`/api/afk-circle?wallet=${encodeURIComponent(address)}`, {
          cache: 'no-store',
        })
        if (response.ok) {
          const data = await response.json()
          setAfkCircleTotal(Number(data?.totalCount ?? 0))
          setAfkCircleUserParticipants(Array.isArray(data?.userParticipants) ? data.userParticipants : [])
          
          // Add AFK circle inscriptions to in-use set
          const afkInscriptions = new Set<string>()
          for (const participant of data?.userParticipants ?? []) {
            if (participant.inscriptionId) {
              afkInscriptions.add(participant.inscriptionId)
            }
          }
          setInscriptionsInCircles((prev) => {
            const combined = new Set(prev)
            Array.from(afkInscriptions).forEach((id) => {
              combined.add(id)
            })
            return combined
          })
        }
      } catch (error) {
        console.error('Failed to fetch AFK circle', error)
      } finally {
        setAfkCircleLoading(false)
      }
    },
    [],
  )

  const handleJoinAfkCircle = useCallback(
    async (inscriptionId: string) => {
      if (!ordinalAddress || !inscriptionId) return
      setAfkCircleJoining(inscriptionId)
      try {
        const option = damnedOptions.find((opt) => opt.inscriptionId === inscriptionId)
        const response = await fetch('/api/afk-circle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: ordinalAddress,
            inscriptionId,
            inscriptionImage: option?.image ?? null,
          }),
        })
        const data = await response.json()
        if (data.success) {
          toast.success('Ordinal added to AFK circle!')
          await fetchAfkCircle(ordinalAddress)
          await refreshSummons(ordinalAddress)
        } else {
          toast.error(data.error || 'Failed to join AFK circle.')
        }
      } catch (error) {
        console.error('Failed to join AFK circle', error)
        toast.error('Failed to join AFK circle.')
      } finally {
        setAfkCircleJoining(null)
      }
    },
    [ordinalAddress, damnedOptions, toast, fetchAfkCircle, refreshSummons],
  )

  const handleLeaveAfkCircle = useCallback(
    async (inscriptionId: string) => {
      if (!ordinalAddress || !inscriptionId) return
      setAfkCircleLeaving(inscriptionId)
      try {
        const response = await fetch(
          `/api/afk-circle?wallet=${encodeURIComponent(ordinalAddress)}&inscriptionId=${encodeURIComponent(inscriptionId)}`,
          {
            method: 'DELETE',
          },
        )
        const data = await response.json()
        if (data.success) {
          toast.success('Ordinal removed from AFK circle.')
          await fetchAfkCircle(ordinalAddress)
          await refreshSummons(ordinalAddress)
        } else {
          toast.error(data.error || 'Failed to leave AFK circle.')
        }
      } catch (error) {
        console.error('Failed to leave AFK circle', error)
        toast.error('Failed to leave AFK circle.')
      } finally {
        setAfkCircleLeaving(null)
      }
    },
    [ordinalAddress, toast, fetchAfkCircle, refreshSummons],
  )

  const fetchBurnCount = useCallback(async (address: string) => {
    if (!address) {
      setBurnCount(null)
      return
    }
    try {
      const response = await fetch(`/api/holders/check-access?walletAddress=${encodeURIComponent(address)}`, {
        cache: 'no-store',
      })
      if (response.ok) {
        const data = await response.json()
        const count = Number(data?.burnCount ?? 0)
        setBurnCount(Number.isFinite(count) ? count : 0)
      } else {
        setBurnCount(null)
      }
    } catch (error) {
      console.error('Failed to fetch burn count', error)
      setBurnCount(null)
    }
  }, [])

  const loadDamnedOptions = useCallback(
    async (address: string) => {
      if (!address) {
        setDamnedOptions([])
        setSelectedInscriptionId(null)
        return
      }
      setDamnedLoading(true)
      setDamnedError(null)
      try {
        const response = await fetch(
          `/api/magic-eden?ownerAddress=${encodeURIComponent(address)}&collectionSymbol=the-damned&fetchAll=true`,
          { headers: { Accept: 'application/json' }, cache: 'no-store' },
        )
        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || `Magic Eden request failed (${response.status})`)
        }
        const payload = await response.json().catch(() => ({ tokens: [] }))
        const rawTokens =
          Array.isArray(payload?.tokens) ? payload.tokens : Array.isArray(payload) ? payload : []

        const mapped: DamnedOption[] = rawTokens
          .map((token: Record<string, any>) => {
            const inscriptionId = (token?.id || token?.inscriptionId || '').toString().trim()
            if (!inscriptionId) {
              return null
            }
            const name =
              token?.meta?.name ??
              token?.name ??
              (typeof token?.tokenId === 'string' ? `Token ${token.tokenId}` : null)
            const image =
              typeof token?.contentURI === 'string'
                ? token.contentURI
                : typeof token?.image === 'string'
                ? token.image
                : null
            return {
              inscriptionId,
              name,
              image,
            } satisfies DamnedOption
          })
          .filter((option: DamnedOption | null): option is DamnedOption => option !== null)

        setDamnedOptions(mapped)
        setInscriptionImageCache((prev) => {
          const updated = { ...prev }
          for (const option of mapped) {
            if (option.image) {
              updated[option.inscriptionId] = option.image
            }
          }
          return updated
        })
        setSelectedInscriptionId((previous) => {
          if (previous && mapped.some((option) => option.inscriptionId === previous)) {
            return previous
          }
          return mapped.length > 0 ? mapped[0].inscriptionId : null
        })
      } catch (error) {
        console.error('Failed to load damned ordinals:', error)
        setDamnedError(error instanceof Error ? error.message : 'Failed to load ordinals.')
      } finally {
        setDamnedLoading(false)
      }
    },
    [],
  )

  const loadSummonLeaderboard = useCallback(async () => {
    if (!SUMMON_LEADERBOARD_ENABLED) {
      setSummonLeaderboard([])
      return
    }
    setSummonLeaderboardLoading(true)
    try {
      const response = await fetch('/api/abyss/summons/leaderboard', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Summon leaderboard request failed (${response.status})`)
      }
      const payload = await response.json().catch(() => null)
      const entries: SummonLeaderboardEntry[] = Array.isArray(payload?.entries)
        ? (payload.entries as Array<Record<string, unknown>>).map((item) => ({
            wallet: (item?.wallet ?? '').toString().toLowerCase(),
            username: typeof item?.username === 'string' ? item.username : null,
            avatarUrl:
              typeof item?.avatarUrl === 'string'
                ? item.avatarUrl
                : typeof item?.avatar_url === 'string'
                ? item.avatar_url
                : null,
            burns: Number(item?.burns ?? 0),
            confirmedBurns: Number(item?.confirmedBurns ?? item?.confirmed_burns ?? 0),
            hosted: Number(item?.hosted ?? 0),
            participated: Number(item?.participated ?? 0),
            score: Number(item?.score ?? 0),
            lastBurnAt:
              typeof item?.lastBurnAt === 'string'
                ? item.lastBurnAt
                : typeof item?.last_burn_at === 'string'
                ? item.last_burn_at
                : null,
            lastHostedAt:
              typeof item?.lastHostedAt === 'string'
                ? item.lastHostedAt
                : typeof item?.last_hosted_at === 'string'
                ? item.last_hosted_at
                : null,
            lastParticipatedAt:
              typeof item?.lastParticipatedAt === 'string'
                ? item.lastParticipatedAt
                : typeof item?.last_participated_at === 'string'
                ? item.last_participated_at
                : null,
          }))
        : []
      entries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (b.burns !== a.burns) return b.burns - a.burns
        if (b.hosted !== a.hosted) return b.hosted - a.hosted
        if (b.participated !== a.participated) return b.participated - a.participated
        return a.wallet.localeCompare(b.wallet)
      })
      setSummonLeaderboard(entries)
    } catch (error) {
      console.error('Failed to load summon leaderboard:', error)
      setSummonLeaderboard([])
    } finally {
      setSummonLeaderboardLoading(false)
    }
  }, [SUMMON_LEADERBOARD_ENABLED])

  // Load damned options only when address changes (not on every refresh)
  useEffect(() => {
    // Only load if address changed (not on every render)
    if (ordinalAddress && ordinalAddress !== lastLoadedAddressRef.current) {
      lastLoadedAddressRef.current = ordinalAddress
      void loadDamnedOptions(ordinalAddress)
    } else if (!ordinalAddress) {
      lastLoadedAddressRef.current = null
      setDamnedOptions([])
      setSelectedInscriptionId(null)
    }
  }, [ordinalAddress, loadDamnedOptions])

  useEffect(() => {
    if (ordinalAddress) {
      void refreshSummons(ordinalAddress)
      void fetchBurnCount(ordinalAddress)
      void fetchAfkCircle(ordinalAddress)
    } else {
      setSummons([])
      setCreatedSummons([])
      setJoinedSummons([])
      setBonusAllowance(0)
      setBurnCount(null)
      setAfkCircleTotal(0)
      setAfkCircleUserParticipants([])
    }
    if (SUMMON_LEADERBOARD_ENABLED) {
      void loadSummonLeaderboard()
    }
  }, [ordinalAddress, refreshSummons, loadSummonLeaderboard, fetchBurnCount, fetchAfkCircle, SUMMON_LEADERBOARD_ENABLED])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (ordinalAddress) {
        void refreshSummons(ordinalAddress)
        void fetchAfkCircle(ordinalAddress)
      }
    }, 15_000)
    return () => window.clearInterval(intervalId)
  }, [ordinalAddress, refreshSummons, fetchAfkCircle])

  // Removed interval - only load damned options on initial load or address change
  // No need to refresh ordinals list every 23 seconds

  useEffect(() => {
    if (!SUMMON_LEADERBOARD_ENABLED) {
      return undefined
    }
    void loadSummonLeaderboard()
    const intervalId = window.setInterval(() => {
      void loadSummonLeaderboard()
    }, 23_000)
    return () => window.clearInterval(intervalId)
  }, [loadSummonLeaderboard, SUMMON_LEADERBOARD_ENABLED])

  const handleToggleMusic = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (musicPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => {
        setMusicReady(true)
      })
    }
  }, [musicPlaying])

  const handleToggleMute = useCallback(() => {
    setIsMusicMuted((prev) => {
      const next = !prev
      if (!next && musicVolume === 0) {
        setMusicVolume(30)
      }
      if (!next && audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {})
      }
      return next
    })
  }, [musicVolume])

  const handleMusicMutedChange = useCallback((muted: boolean) => {
    setIsMusicMuted(muted)
    const audio = audioRef.current
    if (!audio) return
    
    if (!muted) {
      // Unmuting: ensure volume is set and play if paused
      if (musicVolume === 0) {
        setMusicVolume(30)
      }
      if (audio.paused) {
        audio.play().catch(() => {
          // Autoplay may be blocked, but user interaction should allow it
        })
      }
    }
    // When muting, the volume effect will handle setting volume to 0
  }, [musicVolume])

  const handleVolumeChange = useCallback((value: number) => {
    setMusicVolume(value)
    if (value > 0) {
      setIsMusicMuted(false)
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {})
      }
    } else {
      setIsMusicMuted(true)
    }
  }, [])

  const handleCreateSummon = useCallback(async () => {
    if (SUMMONING_DISABLED) {
      toast.error(SUMMONING_DISABLED_MESSAGE)
      return
    }
    if (!ordinalAddress) {
      toast.error('Connect your wallet to start a summoning circle.')
      return
    }
    if (!selectedOption) {
      toast.error('Select an ordinal from your inventory to continue.')
      return
    }
    if (selectedOption?.image) {
      setInscriptionImageCache((prev) => ({
        ...prev,
        [selectedOption.inscriptionId]: selectedOption.image as string,
      }))
    }
    setCreating(true)
    try {
      const response = await fetch(SUMMON_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          creatorWallet: ordinalAddress,
          inscriptionId: selectedOption.inscriptionId,
          inscriptionImage: selectedOption.image ?? null,
          circleMode: IS_DAMNED_POOL_MODE ? poolMode : undefined,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message = payload?.error ?? `Summon creation failed (${response.status})`
        throw new Error(message)
      }
      toast.success(
        IS_DAMNED_POOL_MODE
          ? 'Damned pool created. Await 49 allies.'
          : IS_POWDER_MODE
          ? 'Ascension circle created. Await nine allies.'
          : 'Summoning circle created. Await three allies.',
      )
      setDamnedOptions((prev) => prev.filter((option) => option.inscriptionId !== selectedOption.inscriptionId))
      setSelectedInscriptionId(null)
      if (ordinalAddress) {
        await refreshSummons(ordinalAddress)
        if (SUMMON_LEADERBOARD_ENABLED) {
          await loadSummonLeaderboard()
        }
      }
    } catch (error) {
      console.error('Create summon failed:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create summoning circle.')
    } finally {
      setCreating(false)
    }
  }, [ordinalAddress, selectedOption, refreshSummons, loadSummonLeaderboard, toast, SUMMON_API_BASE, IS_POWDER_MODE, IS_DAMNED_POOL_MODE, SUMMON_LEADERBOARD_ENABLED, poolMode, SUMMONING_DISABLED, SUMMONING_DISABLED_MESSAGE])

  const handleJoinSummon = useCallback(
    async (summon: SummonRecord) => {
      if (SUMMONING_DISABLED) {
        toast.error(SUMMONING_DISABLED_MESSAGE)
        return
      }
      if (!ordinalAddress) {
        toast.error('Connect your wallet to join a summoning circle.')
        return
      }
      if (!selectedOption) {
        toast.error('Select an ordinal from your inventory before joining.')
        return
      }
      if (summon.participants.some((participant) => participant.wallet?.toLowerCase() === ordinalAddress.toLowerCase())) {
        toast.error('You already joined this summoning circle.')
        return
      }
      if (!ACTIVE_SUMMON_STATUSES.has(summon.status)) {
        toast.error('This summoning circle is no longer accepting participants.')
        return
      }

      if (selectedOption?.image) {
        setInscriptionImageCache((prev) => ({
          ...prev,
          [selectedOption.inscriptionId]: selectedOption.image as string,
        }))
      }
      setJoiningSummonId(summon.id)
      try {
        const response = await fetch(`${SUMMON_API_BASE}/${summon.id}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            wallet: ordinalAddress,
            inscriptionId: selectedOption.inscriptionId,
          inscriptionImage: selectedOption.image ?? null,
          }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const message = payload?.error ?? `Failed to join summon (${response.status})`
          throw new Error(message)
        }
        toast.success(
          IS_POWDER_MODE ? 'You joined the ascension circle.' : 'You joined the summoning circle.',
        )
        setDamnedOptions((prev) => prev.filter((option) => option.inscriptionId !== selectedOption.inscriptionId))
        setSelectedInscriptionId(null)
        if (ordinalAddress) {
          await refreshSummons(ordinalAddress)
          if (SUMMON_LEADERBOARD_ENABLED) {
            await loadSummonLeaderboard()
          }
        }
      } catch (error) {
        console.error('Join summon failed:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to join summoning circle.')
      } finally {
        setJoiningSummonId(null)
      }
    },
    [ordinalAddress, selectedOption, refreshSummons, loadSummonLeaderboard, toast, SUMMON_API_BASE, IS_POWDER_MODE, SUMMON_LEADERBOARD_ENABLED, SUMMONING_DISABLED, SUMMONING_DISABLED_MESSAGE],
  )

  const handleCompleteSummon = useCallback(
    async (summon: SummonRecord) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to complete the summoning.')
        return
      }
      setCompletingSummonId(summon.id)
      try {
        const response = await fetch(`${SUMMON_API_BASE}/${summon.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ wallet: ordinalAddress }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const message = payload?.error ?? `Completion failed (${response.status})`
          throw new Error(message)
        }
        const payload = await response.json().catch(() => null)
        if (IS_POWDER_MODE) {
          if (typeof payload?.profilePowder === 'number') {
            setBonusAllowance(Number(payload.profilePowder))
          }
          toast.success(payload?.message ?? `${powderTermCapitalized} channel complete.`)
        } else {
          if (typeof payload?.bonusAllowance === 'number') {
            setBonusAllowance(Number(payload.bonusAllowance))
          }
          toast.success('Summoning circle completed.')
        }
        if (ordinalAddress) {
          await refreshSummons(ordinalAddress)
          if (SUMMON_LEADERBOARD_ENABLED) {
            await loadSummonLeaderboard()
          }
        }
      } catch (error) {
        console.error('Complete summon failed:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to complete summoning circle.')
      } finally {
        setCompletingSummonId(null)
      }
    },
    [ordinalAddress, refreshSummons, loadSummonLeaderboard, toast, SUMMON_API_BASE, IS_POWDER_MODE, SUMMON_LEADERBOARD_ENABLED, powderTermCapitalized],
  )

  const handleDismissSummon = useCallback(
    async (summon: SummonRecord) => {
      if (!ordinalAddress) {
        toast.error('Connect your wallet to dismiss the circle.')
        return
      }
      setDismissingSummonId(summon.id)
      try {
        const response = await fetch(`${SUMMON_API_BASE}/${summon.id}/dismiss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ wallet: ordinalAddress }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const message = payload?.error ?? `Dismissal failed (${response.status})`
          throw new Error(message)
        }
        toast.success('Circle dissolved. Summon anew.')
        if (ordinalAddress) {
          await refreshSummons(ordinalAddress)
          if (SUMMON_LEADERBOARD_ENABLED) {
            await loadSummonLeaderboard()
          }
        }
      } catch (error) {
        console.error('Dismiss summon failed:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to dismiss circle.')
      } finally {
        setDismissingSummonId(null)
      }
    },
    [ordinalAddress, refreshSummons, loadSummonLeaderboard, toast, SUMMON_API_BASE, SUMMON_LEADERBOARD_ENABLED],
  )

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <audio
        ref={audioRef}
        src={playlist[currentSongIndex]}
        preload="auto"
        onError={(event) => {
          console.error('Summon audio failed to load', event.currentTarget.error)
        }}
      />

      {/* Music controls rendered in Header; floating controls removed for consistency */}

      <div className="pointer-events-none absolute inset-0 -z-10">
        <Image
          src="/abyssbg.png"
          alt="Abyss background"
          fill
          priority={false}
          className="object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90" />
      </div>

      <Header 
        connected={Boolean(ordinalAddress)} 
        showMusicControls={true}
        musicVolume={musicVolume}
        onMusicVolumeChange={handleVolumeChange}
        isMusicMuted={isMusicMuted}
        onMusicMutedChange={handleMusicMutedChange}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 md:px-8 overflow-x-hidden">
        {/* Closed State - Show if abyss-summon is closed (10 PM to 9 AM EST) */}
        {abyssClosed.isClosed && (
          <div className="relative z-20 mx-auto w-full max-w-2xl rounded-3xl border-2 border-red-600/80 bg-black/95 p-8 shadow-[0_0_80px_rgba(220,38,38,0.8)]">
            <div className="flex flex-col items-center justify-center gap-6 text-center">
              <AlertTriangle className="h-16 w-16 text-red-500 animate-pulse" />
              <h2 className="text-2xl font-black uppercase tracking-[0.4em] text-red-200 md:text-3xl">
                Summoning Closed
              </h2>
              <p className="text-sm font-mono uppercase tracking-[0.3em] text-red-300/80">
                The abyss-summon area is closed from 10:00 PM to 9:00 AM EST each day.
              </p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-xs font-mono uppercase tracking-[0.3em] text-red-400/70">
                  Opens in:
                </p>
                <div className="text-4xl font-mono font-bold text-red-200 tabular-nums">
                  {formatCountdown(abyssClosed.timeUntilOpen)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show locked page if not a holder */}
        {checkingHolder ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-red-400" />
          </div>
        ) : isHolder === false ? (
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 rounded-3xl border border-red-500/40 bg-red-950/20 p-10 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-900/30 px-4 py-1 text-[11px] font-mono uppercase tracking-[0.4em] text-red-200">
              <AlertTriangle className="h-3.5 w-3.5 text-emerald-400" />
              Holder Access Only
            </div>
            <h1 className="text-2xl font-black uppercase tracking-[0.45em] text-red-100">Summoning Circles Locked</h1>
            <p className="max-w-2xl text-sm uppercase tracking-[0.3em] text-red-200/80">
              You must have at least one unlisted Damned ordinal in your wallet to access summoning circles. Only holders with unlisted NFTs can participate in summoning rituals.
            </p>
          </div>
        ) : (
          <>
        {/* Main Content - Only show if not closed */}
        {!abyssClosed.isClosed && (
          <>
        {/* Header outside of the card */}
        <div className="relative flex items-center justify-center gap-3">
          <Sparkles className="h-8 w-8 text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
          <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-red-100 md:text-4xl">
            Summoning Circles
          </h1>
          <Sparkles className="h-8 w-8 text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
        </div>
        
        {/* Countdown until shutdown - right below header */}
        {abyssClosed.timeUntilClose > 0 && (
          <div className="relative z-20 mx-auto w-full max-w-xl rounded-2xl border border-amber-600/60 bg-black/80 p-4 shadow-[0_0_40px_rgba(251,191,36,0.4)]">
            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-xs font-mono uppercase tracking-[0.3em] text-amber-400/80">
                Summoning closes in:
              </p>
              <div className="text-2xl font-mono font-bold text-amber-200 tabular-nums">
                {formatCountdown(abyssClosed.timeUntilClose)}
              </div>
            </div>
          </div>
        )}
        {/* Tabs outside the card, resting on the top-left edge */}
        <div className="relative z-20 -mb-4 ml-0 md:ml-4 flex flex-wrap items-center justify-between gap-2 pr-4 max-w-full overflow-x-hidden px-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('abyss')}
              className={[
                'rounded-full border px-3 py-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] sm:tracking-[0.35em] transition whitespace-normal break-words',
                !IS_POWDER_MODE && !IS_DAMNED_POOL_MODE && !IS_DEAD_DEMONS_MODE
                  ? 'border-red-500 bg-red-700/80 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.45)]'
                  : 'border-red-700/50 bg-black/70 text-red-200/80 hover:border-red-500/70',
              ].join(' ')}
            >
              Abyss
            </button>
            <button
              type="button"
              onClick={() => setMode('powder')}
              className={[
                'rounded-full border px-3 py-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] sm:tracking-[0.35em] transition whitespace-normal break-words',
                IS_POWDER_MODE
                  ? 'border-amber-400 bg-amber-600/80 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.45)]'
                  : 'border-amber-600/50 bg-black/70 text-amber-200/80 hover:border-amber-400/70',
              ].join(' ')}
            >
              Ascension
            </button>
            <button
              type="button"
              onClick={() => setMode('damned_pool')}
              className={[
                'rounded-full border px-3 py-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.15em] sm:tracking-[0.35em] transition whitespace-normal break-words max-w-full',
                IS_DAMNED_POOL_MODE
                  ? 'border-indigo-400 bg-indigo-700/80 text-indigo-100 shadow-[0_0_18px_rgba(99,102,241,0.45)]'
                  : 'border-indigo-600/50 bg-black/70 text-indigo-200/80 hover:border-indigo-400/70',
              ].join(' ')}
            >
              Portal
            </button>
            <button
              type="button"
              onClick={() => setMode('dead_demons')}
              className={[
                'rounded-full border px-3 py-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.15em] sm:tracking-[0.35em] transition whitespace-normal break-words max-w-full',
                IS_DEAD_DEMONS_MODE
                  ? 'border-purple-400 bg-purple-700/80 text-purple-100 shadow-[0_0_18px_rgba(168,85,247,0.45)]'
                  : 'border-purple-600/50 bg-black/70 text-purple-200/80 hover:border-purple-400/70',
              ].join(' ')}
            >
              Dead Demons
            </button>
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-2 gap-y-2 sm:w-auto sm:justify-start">
            <span className="text-[11px] font-mono uppercase tracking-[0.35em] text-red-200/80">Leaderboards:</span>
            <Link
              href="/abyss-summon/leaderboard"
              className="inline-flex items-center gap-2 rounded-full border border-red-500 bg-red-700/70 px-4 py-1.5 text-[11px] font-mono uppercase tracking-[0.35em] text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)] transition hover:bg-red-600"
            >
              Summoning
            </Link>
            <Link
              href="/ascension/leaderboard"
              className="inline-flex items-center gap-2 rounded-full border border-amber-400 bg-amber-600/70 px-4 py-1.5 text-[11px] font-mono uppercase tracking-[0.35em] text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.35)] transition hover:bg-amber-500"
            >
              Ascension
            </Link>
          </div>
        </div>
        
        {/* Tips Button and Dropdown */}
        <div className="relative mx-auto w-full max-w-4xl mb-6">
          <button
            type="button"
            onClick={() => setTipsOpen(!tipsOpen)}
            className={[
              'flex w-full items-center justify-between rounded-xl border px-4 py-3 transition',
              IS_POWDER_MODE
                ? 'border-amber-500/40 bg-amber-900/20 text-amber-200 hover:bg-amber-900/30'
                : IS_DAMNED_POOL_MODE
                ? 'border-indigo-500/40 bg-indigo-900/20 text-indigo-200 hover:bg-indigo-900/30'
                : IS_DEAD_DEMONS_MODE
                ? 'border-purple-500/40 bg-purple-900/20 text-purple-200 hover:bg-purple-900/30'
                : 'border-red-600/40 bg-black/70 text-red-200 hover:bg-black/80',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              <span className="text-sm font-mono uppercase tracking-[0.3em]">Tips</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${tipsOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {tipsOpen && (
            <div className={[
              'mt-2 rounded-xl border p-4 text-sm',
              IS_POWDER_MODE
                ? 'border-amber-500/40 bg-amber-900/20 text-amber-200'
                : IS_DAMNED_POOL_MODE
                ? 'border-indigo-500/40 bg-indigo-900/20 text-indigo-200'
                : IS_DEAD_DEMONS_MODE
                ? 'border-purple-500/40 bg-purple-900/20 text-purple-200'
                : 'border-red-600/40 bg-black/70 text-red-200',
            ].join(' ')}>
              {!IS_POWDER_MODE && !IS_DAMNED_POOL_MODE && !IS_DEAD_DEMONS_MODE ? (
                <div className="space-y-2">
                  <p className="font-semibold uppercase tracking-[0.2em]">Abyss Summoning</p>
                  <ul className="ml-4 list-disc space-y-1 text-xs uppercase tracking-[0.15em] opacity-90">
                    <li>Only requires host to confirm in the last 2 minutes</li>
                    <li>Awards summoning points</li>
                  </ul>
                </div>
              ) : IS_POWDER_MODE ? (
                <div className="space-y-2">
                  <p className="font-semibold uppercase tracking-[0.2em]">Ascension Circles</p>
                  <ul className="ml-4 list-disc space-y-1 text-xs uppercase tracking-[0.15em] opacity-90">
                    <li>Requires 9 out of 10 participants to complete in the last 2 minutes</li>
                    <li>Gives ascension_powder (4 for host, 3 for participants)</li>
                  </ul>
                </div>
              ) : IS_DAMNED_POOL_MODE ? (
                <div className="space-y-2">
                  <p className="font-semibold uppercase tracking-[0.2em]">Portal Summoning</p>
                  <ul className="ml-4 list-disc space-y-1 text-xs uppercase tracking-[0.15em] opacity-90">
                    <li><strong>20 seats:</strong> Opens the burning abyss to people with burn tokens</li>
                    <li><strong>40 seats:</strong> Opens it to anyone to burn</li>
                    <li>Also gives ascension_powder (14 for host, 10 for participants)</li>
                  </ul>
                </div>
              ) : IS_DEAD_DEMONS_MODE ? (
                <div className="space-y-2">
                  <p className="font-semibold uppercase tracking-[0.2em]">Dead Demons Circles</p>
                  <ul className="ml-4 list-disc space-y-1 text-xs uppercase tracking-[0.15em] opacity-90">
                    <li>Requires ascended inscriptions (inscription_id starting with &quot;ascended_&quot;)</li>
                    <li>All 10 participants must complete in the last 1 minute</li>
                    <li>Gives ascension_powder (10 for host, 8 for participants)</li>
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
        
        <section
          className={[
            'relative overflow-hidden rounded-3xl border p-8 backdrop-blur',
            IS_POWDER_MODE
              ? 'border-amber-500/40 bg-amber-900/20 shadow-[0_0_40px_rgba(251,191,36,0.35)]'
              : IS_DAMNED_POOL_MODE
              ? 'border-indigo-500/40 bg-indigo-900/20 shadow-[0_0_40px_rgba(99,102,241,0.35)]'
              : IS_DEAD_DEMONS_MODE
              ? 'border-purple-500/40 bg-purple-900/20 shadow-[0_0_40px_rgba(168,85,247,0.35)]'
              : 'border-red-600/40 bg-black/75 shadow-[0_0_40px_rgba(220,38,38,0.45)]',
          ].join(' ')}
        >
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-600/40 bg-[radial-gradient(circle,_rgba(220,38,38,0.3)_0%,_rgba(10,0,0,0)_65%)] blur-xl" />
            <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-red-600/20" />
            <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rotate-12 border border-amber-500/20" />
          </div>
          <div className="relative flex flex-col gap-5 text-center">
         
             
            <div className="grid gap-4 text-xs uppercase tracking-[0.3em] text-red-200/80 md:grid-cols-3">
              <div
                className={[
                  'rounded-2xl border px-4 py-3',
                  IS_POWDER_MODE
                    ? 'border-amber-500/40 bg-amber-900/20 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                    : IS_DAMNED_POOL_MODE
                    ? 'border-indigo-500/40 bg-indigo-900/20 shadow-[0_0_20px_rgba(99,102,241,0.35)]'
                    : 'border-red-600/40 bg-black/60 shadow-[0_0_20px_rgba(220,38,38,0.35)]',
                ].join(' ')}
              >
                <span className="text-[11px] text-amber-300">
                  {IS_DAMNED_POOL_MODE
                    ? 'Confirmed Portals'
                    : IS_POWDER_MODE
                    ? `${powderTermCapitalized} Banked`
                    : 'Bonus Burns Awaiting'}
                </span>
                <div className="mt-1 text-2xl font-black text-amber-100 drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]">
                  {IS_DAMNED_POOL_MODE ? confirmedPortalCount : bonusAllowance}
                </div>
              </div>
              <div
                className={[
                  'rounded-2xl border px-4 py-3',
                  IS_POWDER_MODE
                    ? 'border-amber-500/40 bg-amber-900/20 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                    : IS_DAMNED_POOL_MODE
                    ? 'border-indigo-500/40 bg-indigo-900/20 shadow-[0_0_20px_rgba(99,102,241,0.35)]'
                    : 'border-red-600/40 bg-black/60 shadow-[0_0_20px_rgba(220,38,38,0.35)]',
                ].join(' ')}
              >
                <span className="text-[11px] text-red-400">Active Circles</span>
                <div className="mt-1 text-2xl font-black text-red-200 drop-shadow-[0_0_12px_rgba(220,38,38,0.45)]">
                  {activeSummons.length}
                </div>
              </div>
              <div
                className={[
                  'rounded-2xl border px-4 py-3',
                  IS_POWDER_MODE
                    ? 'border-amber-500/40 bg-amber-900/20 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                    : IS_DAMNED_POOL_MODE
                    ? 'border-indigo-500/40 bg-indigo-900/20 shadow-[0_0_20px_rgba(99,102,241,0.35)]'
                    : 'border-red-600/40 bg-black/60 shadow-[0_0_20px_rgba(220,38,38,0.35)]',
                ].join(' ')}
              >
                <span className="text-[11px] text-red-400">Circles Touched</span>
                <div className="mt-1 text-2xl font-black text-red-200 drop-shadow-[0_0_12px_rgba(220,38,38,0.45)]">
                  {circlesTouchedCount}
                </div>
              </div>
            </div>
            
           
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
          <aside className="sticky top-20 space-y-6 max-w-full overflow-x-hidden">
            <section
              className={[
                'rounded-2xl border p-5 backdrop-blur max-w-full overflow-x-hidden',
                IS_POWDER_MODE
                  ? 'border-amber-500/40 bg-amber-900/20 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                  : IS_DAMNED_POOL_MODE
                  ? 'border-indigo-500/40 bg-indigo-900/20 shadow-[0_0_20px_rgba(99,102,241,0.3)]'
                  : 'border-red-600/40 bg-black/70 shadow-[0_0_20px_rgba(220,38,38,0.3)]',
              ].join(' ')}
            >
              <h2 className="flex items-center justify-between text-sm font-semibold uppercase tracking-[0.35em] text-red-200">
                <span>Your Summoning Stockpile</span>
                {damnedLoading && <Loader2 className="h-4 w-4 animate-spin text-red-300" />}
              </h2>
              {damnedError ? (
                <p className="mt-3 text-[11px] text-red-400/80">{damnedError}</p>
              ) : damnedOptions.length === 0 ? (
                <p className="mt-3 text-[11px] text-red-400/70">
                  No damned ordinals detected in this wallet. Acquire one to participate.
                </p>
              ) : (
                <div className="mt-3 space-y-2 max-w-full">
                  {damnedOptions.map((option: DamnedOption) => {
                    const isActive = selectedInscriptionId === option.inscriptionId
                    const isInCircle = inscriptionsInCircles.has(option.inscriptionId)
                    const buttonClass = [
                      'flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition',
                      isActive
                        ? 'border-red-500 bg-red-900/30 shadow-[0_0_20px_rgba(220,38,38,0.35)]'
                        : isInCircle
                        ? 'border-amber-500/60 bg-amber-900/20 opacity-60'
                        : 'border-red-800/40 bg-black/50 hover:border-red-500/60',
                    ].join(' ')
                    return (
                      <button
                        key={option.inscriptionId}
                        type="button"
                        onClick={() => !isInCircle && setSelectedInscriptionId(option.inscriptionId)}
                        disabled={isInCircle}
                        className={buttonClass}
                      >
                        <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-red-700/40 bg-black/40">
                          {option.image ? (
                            <Image
                              src={option.image}
                              alt={option.name ?? option.inscriptionId}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[8px] font-mono uppercase tracking-[0.3em] text-red-300">
                              NO IMG
                            </span>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.25em] text-red-200">
                              {option.name ?? option.inscriptionId.slice(0, 12)}
                            </span>
                            {isInCircle && (
                              <span className="flex-shrink-0 rounded-full border border-amber-500/60 bg-amber-900/30 px-1 py-0.5 text-[8px] font-mono uppercase tracking-[0.15em] text-amber-200">
                                IN CIRCLE
                              </span>
                            )}
                          </div>
                          <span className="truncate text-[9px] uppercase tracking-[0.25em] text-red-300/70">
                            {option.inscriptionId.slice(0, 8)}…{option.inscriptionId.slice(-8)}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

         
          </aside>

          <div className="space-y-6">
            <section
              className={[
                'rounded-2xl border p-6 backdrop-blur',
                IS_POWDER_MODE
                  ? 'border-amber-500/40 bg-amber-900/20 shadow-[0_0_25px_rgba(251,191,36,0.35)]'
                  : IS_DAMNED_POOL_MODE
                  ? 'border-indigo-500/40 bg-indigo-900/20 shadow-[0_0_25px_rgba(99,102,241,0.35)]'
                  : 'border-red-600/40 bg-black/70 shadow-[0_0_25px_rgba(220,38,38,0.35)]',
              ].join(' ')}
            >
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4 max-w-full">
                <div className="flex-1 min-w-0">
                  <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-[0.35em] text-red-100">
                    <Flame className="h-5 w-5 text-red-400 drop-shadow-[0_0_12px_rgba(220,38,38,0.6)]" />
                    Become Host (Optional)
                  </h2>
                  <p className="mt-2 max-w-xl text-[11px] uppercase tracking-[0.3em] text-red-300/70">
                    {IS_DAMNED_POOL_MODE
                      ? 'The pool locks when fifty damned commit.'
                      : IS_POWDER_MODE || IS_DEAD_DEMONS_MODE
                      ? 'The circle locks when ten damned commit.'
                      : 'The circle locks when eight damned commit.'}
                  </p>
                  {IS_DEAD_DEMONS_MODE && (
                    <div className="mt-3 rounded-lg border border-purple-500/40 bg-purple-900/20 p-3">
                      {isDeadDemonsEligible === null ? (
                        <p className="text-[11px] uppercase tracking-[0.3em] text-purple-200/80">
                          Checking eligibility...
                        </p>
                      ) : isDeadDemonsEligible ? (
                        <p className="text-[11px] uppercase tracking-[0.3em] text-purple-200">
                          ✓ You are eligible to host/join Dead Demons circles (you have ascended inscriptions).
                        </p>
                      ) : (
                        <p className="text-[11px] uppercase tracking-[0.3em] text-purple-300/80">
                          You must have at least one ascended inscription (inscription_id starting with &quot;ascended_&quot;) in your abyss_burns to participate in Dead Demons circles.
                        </p>
                      )}
                    </div>
                  )}
                  {IS_DAMNED_POOL_MODE && (
                    <div className="mt-3 flex flex-col gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-200">
                   
                      <div className="inline-flex max-w-xs items-center">
                        <select
                          id="pool-mode"
                          value={poolMode}
                          onChange={(e) => setPoolMode((e.target.value as 'open_all' | 'bonus_credits') ?? 'open_all')}
                          className="w-full rounded border border-red-600/50 bg-black/60 px-3 py-2 text-[11px] uppercase tracking-[0.3em] text-red-100 outline-none focus:border-amber-400"
                        >
                          <option value="bonus_credits">
                            Bonus Burns Only (20 seats)
                          </option>
                          <option value="open_all">
                            Open To All (40 seats)
                          </option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={handleCreateSummon}
                  disabled={!selectedOption || creating || (IS_DEAD_DEMONS_MODE && isDeadDemonsEligible === false)}
                  className="w-full sm:w-auto border border-red-500 bg-red-700/80 px-5 py-3 text-[11px] font-mono uppercase tracking-[0.35em] text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)] transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Summoning…
                    </>
                  ) : (
                    'Initiate Circle'
                  )}
                </Button>
              </div>
              {!ordinalAddress && (
                <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-red-400/70">
                  Connect your ordinal wallet to begin a summoning circle.
                </p>
              )}
            </section>

            <section
              className={[
                'rounded-2xl border p-6 backdrop-blur',
                IS_POWDER_MODE
                  ? 'border-amber-500/40 bg-amber-900/20 shadow-[0_0_25px_rgba(251,191,36,0.35)]'
                  : IS_DAMNED_POOL_MODE
                  ? 'border-indigo-500/40 bg-indigo-900/20 shadow-[0_0_25px_rgba(99,102,241,0.35)]'
                  : 'border-red-600/40 bg-black/70 shadow-[0_0_25px_rgba(220,38,38,0.35)]',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: 'active', label: 'Active Circles' },
                  { key: 'created', label: 'Circles Founded' },
                  { key: 'joined', label: 'Circles Joined' },
                  { key: 'afk', label: 'AFK Circle' },
                ].map((tab) => {
                  const isActive = activeTab === tab.key
                  const isAfkTab = tab.key === 'afk'
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key as typeof activeTab)}
                      className={`rounded-full border px-4 py-2 text-[11px] font-mono uppercase tracking-[0.35em] transition ${
                        isActive
                          ? isAfkTab
                            ? 'border-cyan-500 bg-cyan-700/80 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.45)]'
                            : 'border-red-500 bg-red-700/80 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.45)]'
                          : isAfkTab
                          ? 'border-cyan-700/50 bg-black/40 text-cyan-200/80 hover:border-cyan-500/70'
                          : 'border-red-700/50 bg-black/40 text-red-200/80 hover:border-red-500/70'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
              <div className="mt-6 space-y-4">
                {activeTab === 'active' && (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-red-200">Active Circles</h3>
                    {hasOwnActive ? (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-4 text-[11px] uppercase tracking-[0.3em] text-amber-200">
                        You are already leading a summoning circle. Manage or complete it under &ldquo;Circles You Founded&rdquo; before joining another.
                      </div>
                    ) : (
                      <SummonList
                        summons={filteredActiveSummons}
                        ordinalAddress={ordinalAddress}
                        joiningSummonId={joiningSummonId}
                        completingSummonId={completingSummonId}
                        dismissingSummonId={dismissingSummonId}
                        onJoin={handleJoinSummon}
                        onComplete={handleCompleteSummon}
                        onDismiss={handleDismissSummon}
                        truncateWallet={truncateWallet}
                        assetMap={inscriptionImageCache}
                        isPowderMode={IS_POWDER_MODE}
                        requiredParticipantsForMode={SUMMON_REQUIRED_PARTICIPANTS}
                        summonDurationMs={SUMMON_DURATION_MS}
                        isPortalMode={IS_DAMNED_POOL_MODE}
                        loading={summonsLoading}
                        now={now}
                        emptyMessage="No active circles. Initiate one or await whispers from the damned."
                      />
                    )}
                  </>
                )}
                {activeTab === 'created' && (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-red-200">Circles You Founded</h3>
                    <SummonList
                      summons={createdSummons}
                      ordinalAddress={ordinalAddress}
                      joiningSummonId={joiningSummonId}
                      completingSummonId={completingSummonId}
                      dismissingSummonId={dismissingSummonId}
                      onJoin={handleJoinSummon}
                      onComplete={handleCompleteSummon}
                      onDismiss={handleDismissSummon}
                      truncateWallet={truncateWallet}
                      assetMap={inscriptionImageCache}
                      isPowderMode={IS_POWDER_MODE}
                      requiredParticipantsForMode={SUMMON_REQUIRED_PARTICIPANTS}
                      summonDurationMs={SUMMON_DURATION_MS}
                      isPortalMode={IS_DAMNED_POOL_MODE}
                      highlightCreator
                      now={now}
                      emptyMessage="You haven&rsquo;t founded a summoning circle yet."
                    />
                  </>
                )}
                {activeTab === 'joined' && (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-red-200">Circles You&apos;ve Joined</h3>
                    <SummonList
                      summons={joinedSummons}
                      ordinalAddress={ordinalAddress}
                      joiningSummonId={joiningSummonId}
                      completingSummonId={completingSummonId}
                      dismissingSummonId={dismissingSummonId}
                      onJoin={handleJoinSummon}
                      onComplete={handleCompleteSummon}
                      onDismiss={handleDismissSummon}
                      truncateWallet={truncateWallet}
                      assetMap={inscriptionImageCache}
                      isPowderMode={IS_POWDER_MODE}
                      requiredParticipantsForMode={SUMMON_REQUIRED_PARTICIPANTS}
                      summonDurationMs={SUMMON_DURATION_MS}
                      isPortalMode={IS_DAMNED_POOL_MODE}
                      now={now}
                      emptyMessage="You have not joined a summoning circle yet."
                    />
                  </>
                )}
                {activeTab === 'afk' && (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-cyan-200">AFK Circle</h3>
                    <div className="rounded-2xl border border-cyan-500/40 bg-cyan-900/20 p-6 shadow-[0_0_25px_rgba(34,211,238,0.35)] backdrop-blur">
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-[0.35em] text-cyan-100">
                              <Sparkles className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
                              AFK Circle
                            </h2>
                            <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">
                              Deposit ordinals to earn +2 ascension powder per ordinal every hour. No time limit, no completion required. Max 100 participants.
                            </p>
                          </div>
                          {afkCircleLoading && <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />}
                        </div>

                        <div className="rounded-lg border border-cyan-500/40 bg-cyan-900/20 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-[0.3em] text-cyan-200">Total Participants</span>
                            <span className="text-lg font-black text-cyan-100">{afkCircleTotal} / 100</span>
                          </div>
                          {ordinalAddress && (
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[11px] uppercase tracking-[0.3em] text-cyan-200">Your Ordinals</span>
                              <span className="text-lg font-black text-cyan-100">{afkCircleUserParticipants.length}</span>
                            </div>
                          )}
                        </div>

                        {ordinalAddress && (
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">
                              Your AFK Circle Ordinals
                            </h3>
                            {afkCircleUserParticipants.length === 0 ? (
                              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">
                                No ordinals in AFK circle. Add ordinals from your stockpile below.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {afkCircleUserParticipants.map((participant) => {
                                  const isLeaving = afkCircleLeaving === participant.inscriptionId
                                  return (
                                    <div
                                      key={participant.id}
                                      className="flex items-center gap-3 rounded-lg border border-cyan-500/40 bg-cyan-900/20 px-3 py-2"
                                    >
                                      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-cyan-700/40 bg-black/40">
                                        {participant.inscriptionImage ? (
                                          <Image
                                            src={participant.inscriptionImage}
                                            alt={participant.inscriptionId}
                                            fill
                                            className="object-cover"
                                          />
                                        ) : (
                                          <span className="flex h-full w-full items-center justify-center text-[8px] font-mono uppercase tracking-[0.3em] text-cyan-300">
                                            NO IMG
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="truncate text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-200">
                                          {participant.inscriptionId.slice(0, 12)}…{participant.inscriptionId.slice(-8)}
                                        </p>
                                        <p className="text-[9px] uppercase tracking-[0.25em] text-cyan-300/70">
                                          Earns +2/hour
                                        </p>
                                      </div>
                                      <Button
                                        type="button"
                                        onClick={() => handleLeaveAfkCircle(participant.inscriptionId)}
                                        disabled={isLeaving}
                                        className="flex-shrink-0 border border-cyan-500/60 bg-cyan-700/80 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.3em] text-cyan-100 hover:bg-cyan-600 disabled:opacity-50"
                                      >
                                        {isLeaving ? (
                                          <>
                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Removing…
                                          </>
                                        ) : (
                                          'Remove'
                                        )}
                                      </Button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            <div className="mt-4 space-y-2">
                              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">
                                Add Ordinals to AFK Circle
                              </h3>
                              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">
                                Select ordinals from your stockpile that are not in other circles:
                              </p>
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {damnedOptions
                                  .filter((option) => {
                                    const inAfk = afkCircleUserParticipants.some((p) => p.inscriptionId === option.inscriptionId)
                                    const inOtherCircle = inscriptionsInCircles.has(option.inscriptionId) && !inAfk
                                    return !inAfk && !inOtherCircle
                                  })
                                  .map((option) => {
                                    const isJoining = afkCircleJoining === option.inscriptionId
                                    return (
                                      <button
                                        key={option.inscriptionId}
                                        type="button"
                                        onClick={() => handleJoinAfkCircle(option.inscriptionId)}
                                        disabled={isJoining || afkCircleTotal >= 100}
                                        className="flex w-full items-center gap-3 rounded-lg border border-cyan-500/40 bg-cyan-900/20 px-3 py-2 text-left transition hover:border-cyan-400/60 hover:bg-cyan-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-cyan-700/40 bg-black/40">
                                          {option.image ? (
                                            <Image
                                              src={option.image}
                                              alt={option.name ?? option.inscriptionId}
                                              fill
                                              className="object-cover"
                                            />
                                          ) : (
                                            <span className="flex h-full w-full items-center justify-center text-[8px] font-mono uppercase tracking-[0.3em] text-cyan-300">
                                              NO IMG
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-200">
                                            {option.name ?? option.inscriptionId.slice(0, 12)}
                                          </p>
                                          <p className="truncate text-[9px] uppercase tracking-[0.25em] text-cyan-300/70">
                                            {option.inscriptionId.slice(0, 8)}…{option.inscriptionId.slice(-8)}
                                          </p>
                                        </div>
                                        {isJoining ? (
                                          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                                        ) : (
                                          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-300">
                                            + Add
                                          </span>
                                        )}
                                      </button>
                                    )
                                  })}
                                {damnedOptions.filter((option) => {
                                  const inAfk = afkCircleUserParticipants.some((p) => p.inscriptionId === option.inscriptionId)
                                  const inOtherCircle = inscriptionsInCircles.has(option.inscriptionId) && !inAfk
                                  return !inAfk && !inOtherCircle
                                }).length === 0 && (
                                  <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">
                                    No available ordinals to add. All ordinals are either in the AFK circle or other active circles.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {!ordinalAddress && (
                          <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">
                            Connect your wallet to manage your AFK circle ordinals.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
          </>
        )}
          </>
        )}
      </main>

    </div>
  )
}

function SummonList({
  summons,
  ordinalAddress,
  joiningSummonId,
  completingSummonId,
  dismissingSummonId,
  onJoin,
  onComplete,
  onDismiss,
  truncateWallet,
  assetMap,
  highlightCreator = false,
  loading = false,
  now,
  emptyMessage,
  isPowderMode,
  requiredParticipantsForMode,
  summonDurationMs,
  isPortalMode,
}: {
  summons: SummonRecord[]
  ordinalAddress: string
  joiningSummonId: string | null
  completingSummonId: string | null
  dismissingSummonId: string | null
  onJoin: (summon: SummonRecord) => void
  onComplete: (summon: SummonRecord) => void
  onDismiss: (summon: SummonRecord) => void
  truncateWallet: (value: string) => string
  assetMap: Record<string, string>
  highlightCreator?: boolean
  loading?: boolean
  now: number
  emptyMessage?: string
  isPowderMode: boolean
  requiredParticipantsForMode: number
  summonDurationMs?: number
  isPortalMode?: boolean
}) {
  const abbreviateName = (value: string): string => {
    const trimmed = value.trim()
    return trimmed.length > 12 ? `${trimmed.slice(0, 12)}` : trimmed
  }
  if (loading && summons.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-red-300">
        <Loader2 className="h-4 w-4 animate-spin" /> Summoning circles stirring…
      </div>
    )
  }

  if (summons.length === 0) {
    return emptyMessage ? (
      <p className="text-[11px] uppercase tracking-[0.3em] text-red-300/70">{emptyMessage}</p>
    ) : null
  }

  return (
    <div className="space-y-4">
      {summons.map((summon) => {
        const fallbackSlots = isPowderMode ? requiredParticipantsForMode : 8
        const totalSlots = Math.max(summon.requiredParticipants, fallbackSlots)
        const defaultDurationMs =
          typeof summonDurationMs === 'number'
            ? summonDurationMs
            : requiredParticipantsForMode === 10
            ? 10 * 60 * 1000
            : 10 * 60 * 1000
        const localSummonDurationMs = isPortalMode
          ? totalSlots >= 40
            ? 20 * 60 * 1000
            : 10 * 60 * 1000
          : defaultDurationMs
        const isCreator =
          ordinalAddress.length > 0 && summon.creatorWallet?.toLowerCase() === ordinalAddress.toLowerCase()
        const isParticipant = summon.participants.some(
          (participant) => participant.wallet?.toLowerCase() === ordinalAddress.toLowerCase(),
        )
        const currentParticipant = summon.participants.find(
          (participant) => participant.wallet?.toLowerCase() === ordinalAddress.toLowerCase(),
        )
        const participantCompleted = Boolean(currentParticipant?.completed)
        const ready = summon.status === 'ready' || summon.status === 'locked'
        const createdAtMs = Number.isFinite(Date.parse(summon.createdAt ?? ''))
          ? Date.parse(summon.createdAt ?? '')
          : Date.now()
        const rawExpiryMs = summon.expiresAt && Number.isFinite(Date.parse(summon.expiresAt))
          ? Date.parse(summon.expiresAt)
          : Number.NaN
        const fallbackExpiryMs = createdAtMs + localSummonDurationMs
        const targetExpiryMs = Number.isFinite(rawExpiryMs)
          ? Math.min(rawExpiryMs, fallbackExpiryMs)
          : fallbackExpiryMs
        const timeRemainingMs = targetExpiryMs - now
        const isExpired = (timeRemainingMs <= 0 && ACTIVE_SUMMON_STATUSES.has(summon.status)) || summon.status === 'expired'
        const statusLabel = (isExpired ? 'expired' : summon.status).replace(/_/g, ' ')
        const completionWindowMs = isPortalMode ? 3 * 60 * 1000 : SUMMON_COMPLETION_WINDOW_MS
        const completionWindowOpen = timeRemainingMs > 0 && timeRemainingMs <= completionWindowMs
        const unlockCountdown = Math.max(0, timeRemainingMs - completionWindowMs)
        // Reduce per-frame style churn on mobile by updating glow once per second
        const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false
        const secondsRemaining = Math.max(0, Math.ceil(timeRemainingMs / 1000))
        const glowIntensity = isMobile
          ? 0
          : isExpired
          ? 0
          : Math.min(1, Math.max(0, 1 - (secondsRemaining * 1000) / localSummonDurationMs))
        const glowRadius = 18 + glowIntensity * 32
        const glowAlpha = 0.22 + glowIntensity * 0.5
        const borderAlpha = 0.18 + glowIntensity * 0.55
        const backgroundGlowAlpha = 0.08 + glowIntensity * 0.35
        const containerClass = ['group relative overflow-hidden rounded-xl border px-4 py-4 transition transform-gpu max-w-full'].join(' ')
        const usePortalLayout = Boolean(isPortalMode)

        const summaryText = `${summon.participants.length}/${totalSlots}`
        const cannotJoin =
          ordinalAddress.length === 0 ||
          !ACTIVE_SUMMON_STATUSES.has(summon.status) ||
          isParticipant ||
          joiningSummonId === summon.id ||
          isExpired ||
          summon.participants.length >= totalSlots

        const isTwentyManPortal = Boolean(isPortalMode) && totalSlots < 40
        const completionAllowed =
          !isExpired &&
          summon.status !== 'expired' &&
          completionWindowOpen &&
          (
            // Powder: participant confirms during window
            (isPowderMode && isParticipant && !participantCompleted) ||
            // Non-powder: host completes when ready
            (!isPowderMode && ready && isCreator) ||
            // Special case: 20-seat portal allows any participant to complete during window
            (isTwentyManPortal && isParticipant && !participantCompleted)
          )

        return (
          <div
            key={summon.id}
            className={containerClass}
            style={{
              borderColor: `rgba(248,113,113,${borderAlpha})`,
              boxShadow: isMobile ? 'none' : `0 0 ${glowRadius}px rgba(220,38,38,${glowAlpha})`,
              backgroundImage: `linear-gradient(135deg, rgba(127,29,29,${backgroundGlowAlpha}) 0%, rgba(12,12,12,0.82) 55%, rgba(17,17,17,0.9) 100%)`,
              willChange: 'transform, box-shadow, border-color',
            }}
          >
              <div className="grid gap-6 md:grid-cols-[360px_1fr_auto] md:items-start">
              <div className="mx-auto mt-[5px] flex w-full max-w-full md:max-w-[380px] lg:max-w-[460px] flex-col items-center gap-3 md:mx-0">
                  <div className="flex min-h-[22px] flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-red-200/80">
                    <span className="rounded-full border border-red-600/50 bg-red-900/30 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                      {statusLabel}
                    </span>
                    <span>{summaryText}</span>
                    <span className={(isExpired ? 'text-red-400' : 'text-amber-200') + ' inline-block w-[54px] text-center'}>
                      {formatCountdown(Math.max(0, timeRemainingMs))}
                    </span>
                  </div>
                  <SummoningCircleGraphic
                    participants={summon.participants}
                    totalSlots={totalSlots}
                    truncateWallet={truncateWallet}
                    currentWallet={ordinalAddress}
                    isCreator={isCreator}
                    assetMap={assetMap}
                    glowIntensity={glowIntensity}
                  />
                  <span className="text-[10px] uppercase tracking-[0.3em] text-red-300/70">
                    {(() => {
                      const creatorParticipant = summon.participants.find((p) => p.role === 'creator')
                      if (creatorParticipant?.username) {
                        return abbreviateName(creatorParticipant.username)
                      }
                      return truncateWallet(summon.creatorWallet)
                    })()}
                  </span>
                </div>
              <div className="flex flex-1 min-w-0 flex-col gap-3 overflow-x-hidden">
                {!isExpired ? null : (
                  <div className="text-[10px] uppercase tracking-[0.3em] text-red-400">
                    Circle exp.
                </div>
                )}
              </div>
              <div className="flex w-full sm:min-w-[190px] flex-col items-stretch gap-2 min-w-0">
                {!isExpired && (
                  <div className="rounded border border-red-600/30 bg-black/50 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-red-300/80">
                    Ends {new Date(targetExpiryMs).toLocaleTimeString()}
                  </div>
                )}
                {isCreator && highlightCreator && (
                  <span className="text-[10px] uppercase tracking-[0.3em] text-amber-200">Your circle</span>
                )}
                {completionAllowed ? (
                  <Button
                    type="button"
                    onClick={() => onComplete(summon)}
                    disabled={completingSummonId === summon.id}
                    className="border border-amber-400 bg-amber-500/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:bg-amber-500/40"
                  >
                    {completingSummonId === summon.id ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        {isPowderMode ? 'Channeling…' : 'Completing…'}
                      </>
                    ) : isPowderMode ? (
                      'Mark Complete'
                    ) : (
                      'Complete Circle'
                    )}
                  </Button>
                ) : isPowderMode && isParticipant && participantCompleted ? (
                  <div className="rounded border border-emerald-500/40 bg-emerald-900/20 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-200">
                    Ascension confirmed
                  </div>
                ) : isPowderMode && isParticipant && !participantCompleted && !completionWindowOpen && !isExpired ? (
                  <div className="rounded border border-amber-400/40 bg-black/50 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-amber-200">
                    Finale unlocks in {formatCountdown(unlockCountdown)}
                  </div>
                ) : isExpired ? (
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      disabled
                      className="border border-red-800/60 bg-black/60 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-300"
                    >
                      Circle Expired
                    </Button>
                  </div>
                ) : !isPowderMode ? (
                  ready && !completionWindowOpen && !isExpired ? (
                    <div className="rounded border border-amber-400/40 bg-black/50 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-amber-200">
                      Finale unlocks in {formatCountdown(unlockCountdown)}
                    </div>
                  ) : summon.participants.length < totalSlots && ACTIVE_SUMMON_STATUSES.has(summon.status) ? (
                    <div className="rounded border border-red-600/40 bg-black/50 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                      Awaiting more allies…
                    </div>
                  ) : null
                ) : null}
                {isPowderMode && !isParticipant && !isExpired && ACTIVE_SUMMON_STATUSES.has(summon.status) && (
                  <div className="rounded border border-red-500/30 bg-black/50 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200/80">
                    {usePortalLayout
                      ? totalSlots >= 40
                        ? 'Forty seats must be filled before the ritual locks.'
                        : 'Twenty seats must be filled before the ritual locks.'
                      : 'Ten seats must be filled before the ritual locks.'}
                  </div>
                )}
                {!isExpired && !isParticipant && ACTIVE_SUMMON_STATUSES.has(summon.status) && (
                  <Button
                    type="button"
                    onClick={() => onJoin(summon)}
                    disabled={cannotJoin}
                    className="border border-red-500 bg-red-700/70 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)] hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {joiningSummonId === summon.id ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Joining…
                      </>
                    ) : isParticipant ? (
                      'Already Joined'
                    ) : isExpired ? (
                      'Expired'
                    ) : (
                      'Join Circle'
                    )}
                  </Button>
                )}
              </div>
              {/* Universal full-width participant row for all modes */}
                <div className="md:col-span-3">
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {summon.participants.map((participant) => {
                      const pillClass = [
                        'rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] flex items-center gap-1.5',
                        participant.completed
                          ? 'border-emerald-500/50 text-emerald-200'
                          : participant.role === 'creator'
                          ? 'border-red-500/60 text-red-200'
                          : 'border-red-400/40 text-red-200/80',
                      ].join(' ')
                      const fullDisplayName = participant.username?.trim() || truncateWallet(participant.wallet)
                      const displayName = abbreviateName(fullDisplayName)
                      const displayInitials = participant.username
                        ? participant.username.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || truncateWallet(participant.wallet).slice(0, 2)
                        : truncateWallet(participant.wallet).slice(0, 2)
                      return (
                      <span key={participant.id} className={`${pillClass} w-full min-w-0`}>
                          {participant.avatarUrl ? (
                            <Image
                              src={participant.avatarUrl}
                              alt={displayName}
                              width={16}
                              height={16}
                              className="h-4 w-4 rounded-full border border-red-700/50"
                            />
                          ) : (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-red-700/50 bg-black/70 text-[8px] font-bold uppercase tracking-[0.2em] text-red-300">
                              {displayInitials}
                            </span>
                          )}
                          <span className="hidden sm:inline">{displayName}</span>
                          <span className="sm:hidden">{displayInitials}</span>
                          {participant.completed && <CheckCircle2 className="ml-1 h-3 w-3" />}
                        </span>
                      )
                    })}
                  </div>
                </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SummoningCircleGraphic({
  participants,
  totalSlots,
  truncateWallet,
  currentWallet,
  isCreator,
  assetMap,
  glowIntensity,
}: {
  participants: SummonParticipant[]
  totalSlots: number
  truncateWallet: (value: string) => string
  currentWallet: string
  isCreator: boolean
  assetMap: Record<string, string>
  glowIntensity: number
}) {
  const slots = Array.from({ length: totalSlots }, (_, index) => participants[index] ?? null)
  const outerGlow = 22 + glowIntensity * 36
  const ringGlow = 14 + glowIntensity * 28
  const runeGlow = 12 + glowIntensity * 22
  const auraAlpha = 0.18 + glowIntensity * 0.45
  const innerAuraAlpha = 0.12 + glowIntensity * 0.4

  return (
    <div className="relative mx-auto h-44 w-44 sm:h-48 sm:w-72 md:h-52 md:w-96 lg:h-56 lg:w-[28rem]">
      <div
        className="absolute inset-0 rounded-full border"
        style={{
          borderColor: `rgba(248,113,113,${0.25 + glowIntensity * 0.6})`,
          boxShadow: `0 0 ${outerGlow}px rgba(220,38,38,${0.26 + glowIntensity * 0.45})`,
          background: `radial-gradient(circle, rgba(127,29,29,${0.35 + glowIntensity * 0.35}) 0%, rgba(0,0,0,0.05) 55%, transparent 80%)`,
        }}
      />
      <div
        className="absolute inset-5 rounded-full border blur-sm"
        style={{
          borderColor: `rgba(251,191,36,${0.18 + glowIntensity * 0.45})`,
          boxShadow: `0 0 ${ringGlow}px rgba(251,191,36,${0.15 + glowIntensity * 0.4})`,
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border text-center text-[12px] uppercase tracking-[0.3em] text-red-200"
        style={{
          borderColor: `rgba(248,113,113,${0.3 + glowIntensity * 0.5})`,
          background: `rgba(127,29,29,${0.35 + glowIntensity * 0.35})`,
          boxShadow: `0 0 ${runeGlow}px rgba(220,38,38,${0.3 + glowIntensity * 0.5})`,
        }}
      >
        <span className="flex h-full w-full items-center justify-center">
          {isCreator ? 'Damned' : 'Damned'}
        </span>
      </div>
      {slots.map((participant, index) => {
        const angle = (index / totalSlots) * Math.PI * 2 - Math.PI / 2
        const radius = 38
        const left = 50 + radius * Math.cos(angle)
        const top = 50 + radius * Math.sin(angle)
        const rune = ['✶', '✷', '✸', '✹', '✺', '✻'][index % 6]

        const isSelf =
          participant?.wallet && currentWallet && participant.wallet.toLowerCase() === currentWallet.toLowerCase()

        const slotClass = [
          'absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-red-700/40 bg-black/80 backdrop-blur',
          participant
            ? isSelf
              ? 'border-amber-400/50 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.35)]'
              : participant.role === 'creator'
              ? 'border-red-500/60'
              : 'border-red-400/40'
            : 'border-red-700/30',
        ].join(' ')

        const iconGlow = participant
          ? participant.role === 'creator'
            ? 18 + glowIntensity * 18
            : 12 + glowIntensity * 16
          : 10 + glowIntensity * 12
        const iconAlpha = participant
          ? participant.role === 'creator'
            ? 0.35 + glowIntensity * 0.4
            : 0.28 + glowIntensity * 0.35
          : 0.25 + glowIntensity * 0.3
        const runeStyle = {
          textShadow: `0 0 ${iconGlow}px rgba(220,38,38,${iconAlpha})`,
        }

        return (
          <div
            key={`${participant?.wallet ?? 'empty'}-${index}`}
            className={slotClass}
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            {participant ? (
              <SeatAvatar participant={participant} assetMap={assetMap} />
            ) : (
              <span className="text-[10px] text-red-200/70" style={runeStyle}>
                {participant ? '✦' : rune}
              </span>
            )}
          </div>
        )
      })}
      <div className="pointer-events-none absolute inset-0 rounded-full border border-amber-500/20" />
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(249,115,22,${innerAuraAlpha}) 0%, rgba(0,0,0,0) 70%)`,
          boxShadow: `0 0 ${outerGlow * 0.6}px rgba(220,38,38,${auraAlpha})`,
        }}
      />
    </div>
  )
}

function SeatAvatar({ participant, assetMap }: { participant: SummonParticipant; assetMap: Record<string, string> }) {
  const { wallet, inscriptionId } = participant
  const normalized = typeof wallet === 'string' ? wallet.trim() : ''
  const placeholderText = normalized.length > 10 ? `${normalized.slice(0, 4)}…${normalized.slice(-4)}` : normalized

  if (inscriptionId) {
    const preferredImage = participant.image ?? assetMap[inscriptionId]
    const imagePath =
      preferredImage ?? `/api/ordinals/content/${encodeURIComponent(inscriptionId)}`
    return (
      <div className="relative h-9 w-9 overflow-hidden rounded-full border border-red-700/50 bg-black/70">
        <Image src={imagePath} alt={inscriptionId} fill sizes="36px" className="object-cover" />
      </div>
    )
  }

  return <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-red-200">{placeholderText}</span>
}

