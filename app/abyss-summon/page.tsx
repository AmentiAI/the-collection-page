'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlertTriangle, Flame, Loader2, Sparkles, Trash2, Trophy, Volume2, VolumeX, Pause, Play, CheckCircle2 } from 'lucide-react'

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


const IS_POWDER_MODE = false
const SUMMON_REQUIRED_PARTICIPANTS = IS_POWDER_MODE ? 10 : 4
const SUMMON_API_BASE = IS_POWDER_MODE ? '/api/ascension/circles' : '/api/abyss/summons'
const SUMMON_LEADERBOARD_ENABLED = !IS_POWDER_MODE
const POWDER_CIRCLE_REWARD = 20
const ACTIVE_SUMMON_STATUSES = new Set(['open', 'filling', 'ready'])
const SUMMON_DURATION_MS = 30 * 60 * 1000
const SUMMON_COMPLETION_WINDOW_MS = 2 * 60 * 1000
const SUMMON_BURN_POINTS = 6
const SUMMON_HOST_POINTS = 2
const SUMMON_PARTICIPATION_POINTS = 1
const SUMMONING_DISABLED = IS_POWDER_MODE ? false : true
const SUMMONING_DISABLED_MESSAGE = IS_POWDER_MODE
  ? 'Ascension circles are currently paused.'
  : 'The summoning has been completed. Thank you for your efforts!'

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

export default function AbyssSummonPage() {
  const wallet = useWallet()
  const toast = useToast()

  const ordinalAddress = wallet.currentAddress?.trim() ?? ''
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoplayAttemptedRef = useRef(false)

  const [now, setNow] = useState(Date.now())
  const [summons, setSummons] = useState<SummonRecord[]>([])
  const [createdSummons, setCreatedSummons] = useState<SummonRecord[]>([])
  const [joinedSummons, setJoinedSummons] = useState<SummonRecord[]>([])
  const [summonsLoading, setSummonsLoading] = useState(false)
  const [bonusAllowance, setBonusAllowance] = useState(0)
  const [activeTab, setActiveTab] = useState<'active' | 'created' | 'joined'>('active')

  const [damnedOptions, setDamnedOptions] = useState<DamnedOption[]>([])
  const [damnedLoading, setDamnedLoading] = useState(false)
  const [damnedError, setDamnedError] = useState<string | null>(null)
  const [selectedInscriptionId, setSelectedInscriptionId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [joiningSummonId, setJoiningSummonId] = useState<string | null>(null)
  const [completingSummonId, setCompletingSummonId] = useState<string | null>(null)
  const [dismissingSummonId, setDismissingSummonId] = useState<string | null>(null)
  const [inscriptionImageCache, setInscriptionImageCache] = useState<Record<string, string>>({})
  const [summonLeaderboard, setSummonLeaderboard] = useState<SummonLeaderboardEntry[]>([])
  const [summonLeaderboardLoading, setSummonLeaderboardLoading] = useState(false)
  const [summonLeaderboardOpen, setSummonLeaderboardOpen] = useState(false)
  const [selectedSummonerWallet, setSelectedSummonerWallet] = useState<string | null>(null)
  const [musicReady, setMusicReady] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [isMusicMuted, setIsMusicMuted] = useState(false)
  const [musicVolume, setMusicVolume] = useState(15)
  const musicControlsDisabled = !musicReady && !musicPlaying

  const selectedOption = useMemo(
    () => damnedOptions.find((option) => option.inscriptionId === selectedInscriptionId) ?? null,
    [damnedOptions, selectedInscriptionId],
  )
  const selectedSummonerEntry = useMemo(
    () => summonLeaderboard.find((entry) => entry.wallet === selectedSummonerWallet) ?? null,
    [summonLeaderboard, selectedSummonerWallet],
  )

  const truncateWallet = useCallback((value: string) => {
    const normalized = value.trim()
    if (normalized.length <= 8) return normalized
    return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`
  }, [])

  const getDisplayName = useCallback(
    (entry: SummonLeaderboardEntry) => entry.username?.trim() || truncateWallet(entry.wallet),
    [truncateWallet],
  )

  const renderSummonerIdentity = useCallback(
    (entry: SummonLeaderboardEntry, emphasizeSelf = false) => {
      const displayName = getDisplayName(entry)
      const initials =
        displayName.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() ||
        truncateWallet(entry.wallet).slice(0, 2)
      return (
        <span className={`flex items-center gap-2 ${emphasizeSelf ? 'text-amber-200' : 'text-red-200/90'}`}>
          <span className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-red-700/50 bg-black/70 text-[9px] font-bold uppercase tracking-[0.2em] text-red-300">
            {entry.avatarUrl ? (
              <Image
                src={entry.avatarUrl}
                alt={displayName}
                width={24}
                height={24}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
          <span>{emphasizeSelf ? `YOU · ${displayName}` : displayName}</span>
        </span>
      )
    },
    [getDisplayName, truncateWallet],
  )

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
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => setMusicPlaying(true)
    const handlePause = () => setMusicPlaying(false)
    const handleCanPlay = () => {
      setMusicReady(true)
      if (!autoplayAttemptedRef.current) {
        autoplayAttemptedRef.current = true
        audio.play().catch(() => {
          // Autoplay blocked; controls remain available
        })
      }
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('canplay', handleCanPlay, { once: true })
    audio.load()

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = isMusicMuted ? 0 : musicVolume / 100
  }, [musicVolume, isMusicMuted])

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
          headers: { 'Cache-Control': 'no-store' },
        })
        if (!response.ok) {
          throw new Error(`Summon fetch failed (${response.status})`)
        }
        const data = await response.json()
        const openSummons = Array.isArray(data?.summons) ? (data.summons as SummonRecord[]) : []
        const created = Array.isArray(data?.createdSummons) ? (data.createdSummons as SummonRecord[]) : []
        const joined = Array.isArray(data?.joinedSummons) ? (data.joinedSummons as SummonRecord[]) : []

        setSummons(openSummons)
        setCreatedSummons(created)
        setJoinedSummons(joined)
        const rewardBalance = IS_POWDER_MODE
          ? Number(data?.powderBalance ?? 0)
          : Number(data?.bonusAllowance ?? 0)
        setBonusAllowance(Number.isFinite(rewardBalance) ? rewardBalance : 0)
      } catch (error) {
        console.error('Failed to load summons', error)
        toast.error('Failed to load summons. Please try again.')
      } finally {
        setSummonsLoading(false)
      }
    },
    [toast],
  )

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
      setSummonLeaderboardOpen(false)
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
      setSelectedSummonerWallet((previous) => {
        if (previous && entries.some((entry) => entry.wallet === previous)) {
          return previous
        }
        const normalizedAddress = ordinalAddress.trim().toLowerCase()
        if (normalizedAddress) {
          const match = entries.find((entry) => entry.wallet === normalizedAddress)
          if (match) {
            return match.wallet
          }
        }
        return entries[0]?.wallet ?? null
      })
    } catch (error) {
      console.error('Failed to load summon leaderboard:', error)
      setSummonLeaderboard([])
    } finally {
      setSummonLeaderboardLoading(false)
    }
  }, [ordinalAddress])

  useEffect(() => {
    if (ordinalAddress) {
      void refreshSummons(ordinalAddress)
      void loadDamnedOptions(ordinalAddress)
    } else {
      setSummons([])
      setCreatedSummons([])
      setJoinedSummons([])
      setBonusAllowance(0)
      setDamnedOptions([])
      setSelectedInscriptionId(null)
      setSelectedSummonerWallet(null)
    }
    if (SUMMON_LEADERBOARD_ENABLED) {
      void loadSummonLeaderboard()
    }
  }, [ordinalAddress, refreshSummons, loadDamnedOptions, loadSummonLeaderboard])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (ordinalAddress) {
        void refreshSummons(ordinalAddress)
      }
    }, 20_000)
    return () => window.clearInterval(intervalId)
  }, [ordinalAddress, refreshSummons])

  useEffect(() => {
    if (!ordinalAddress) {
      return
    }
    const intervalId = window.setInterval(() => {
      void loadDamnedOptions(ordinalAddress)
    }, 30_000)
    return () => window.clearInterval(intervalId)
  }, [ordinalAddress, loadDamnedOptions])

  useEffect(() => {
    if (!SUMMON_LEADERBOARD_ENABLED) {
      return undefined
    }
    void loadSummonLeaderboard()
    const intervalId = window.setInterval(() => {
      void loadSummonLeaderboard()
    }, 30_000)
    return () => window.clearInterval(intervalId)
  }, [loadSummonLeaderboard])

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
        body: JSON.stringify({
          creatorWallet: ordinalAddress,
          inscriptionId: selectedOption.inscriptionId,
          inscriptionImage: selectedOption.image ?? null,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message = payload?.error ?? `Summon creation failed (${response.status})`
        throw new Error(message)
      }
      toast.success(
        IS_POWDER_MODE
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
  }, [ordinalAddress, selectedOption, refreshSummons, loadSummonLeaderboard, toast])

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
    [ordinalAddress, selectedOption, refreshSummons, loadSummonLeaderboard, toast],
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
          toast.success(payload?.message ?? 'Ascension powder channel complete.')
        } else {
          if (typeof payload?.bonusAllowance === 'number') {
            setBonusAllowance(Number(payload.bonusAllowance))
          }
          toast.success('Summoning circle completed. Bonus burn granted.')
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
    [ordinalAddress, refreshSummons, loadSummonLeaderboard, toast],
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
    [ordinalAddress, refreshSummons, loadSummonLeaderboard, toast],
  )

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <audio
        ref={audioRef}
        src="/music/summon2.mp3"
        preload="auto"
        loop
        onError={(event) => {
          console.error('Summon audio failed to load', event.currentTarget.error)
        }}
      />

      <div className="fixed bottom-6 left-6 z-[10001] flex items-center gap-3 rounded-2xl border border-red-600/40 bg-black/70 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.4)] backdrop-blur">
        <button
          type="button"
          onClick={handleToggleMusic}
          className="rounded-full border border-red-600/40 bg-red-800/50 p-2 text-red-100 transition hover:bg-red-600/60"
          aria-label={musicPlaying ? 'Pause summoning soundtrack' : 'Play summoning soundtrack'}
        >
          {musicPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={handleToggleMute}
          className="rounded-full border border-red-600/40 bg-red-800/50 p-2 text-red-100 transition hover:bg-red-600/60"
          aria-label={isMusicMuted ? 'Unmute soundtrack' : 'Mute soundtrack'}
        >
          {isMusicMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={musicVolume}
          onChange={(event) => handleVolumeChange(Number(event.target.value))}
          className="h-1 w-32 accent-red-600"
          disabled={musicControlsDisabled}
        />
        <span className="w-16 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-red-200/80">
          {musicControlsDisabled ? 'LOADING' : isMusicMuted ? 'MUTED' : `${musicVolume}%`}
        </span>
      </div>

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

      <Header connected={Boolean(ordinalAddress)} showMusicControls={false} />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 md:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-red-600/40 bg-black/75 p-8 shadow-[0_0_40px_rgba(220,38,38,0.45)] backdrop-blur">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-600/40 bg-[radial-gradient(circle,_rgba(220,38,38,0.3)_0%,_rgba(10,0,0,0)_65%)] blur-xl" />
            <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-red-600/20" />
            <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rotate-12 border border-amber-500/20" />
          </div>
          <div className="relative flex flex-col gap-5 text-center">
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="h-8 w-8 text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
              <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-red-100 md:text-4xl">
                {IS_POWDER_MODE ? 'Ascension Circles' : 'Summoning Circles'}
              </h1>
              <Sparkles className="h-8 w-8 text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
            </div>
            <p className="mx-auto max-w-3xl text-sm uppercase tracking-[0.35em] text-red-200/85">
              {IS_POWDER_MODE
                ? `Gather ten damned within thirty minutes. Seal the ritual together to transmute ${POWDER_CIRCLE_REWARD.toLocaleString()} ascension powder per acolyte.`
                : 'Gather four damned within thirty minutes. Complete the ritual to unlock a bonus burn that slips past the abyssal cap.'}
            </p>
            <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 rounded-2xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-red-100 shadow-[0_0_25px_rgba(220,38,38,0.35)]">
              <AlertTriangle className="h-4 w-4 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.55)]" />
              <span>
                {IS_POWDER_MODE
                  ? 'All ten must remain until the final two minutes and confirm completion to claim powder.'
                  : 'More burns are required to keep the summoning circles open.'}
              </span>
            </div>
            {SUMMONING_DISABLED && (
              <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.35)]">
                <AlertTriangle className="h-4 w-4 text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.55)]" />
                <span>{SUMMONING_DISABLED_MESSAGE}</span>
              </div>
            )}
            <div className="grid gap-4 text-xs uppercase tracking-[0.3em] text-red-200/80 md:grid-cols-3">
              <div className="rounded-2xl border border-red-600/40 bg-black/60 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.35)]">
                <span className="text-[11px] text-amber-300">
                  {IS_POWDER_MODE ? 'Ascension Powder Banked' : 'Bonus Burns Awaiting'}
                </span>
                <div className="mt-1 text-2xl font-black text-amber-100 drop-shadow-[0_0_12px_rgba(251,191,36,0.4)]">
                  {bonusAllowance}
                </div>
              </div>
              <div className="rounded-2xl border border-red-600/40 bg-black/60 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.35)]">
                <span className="text-[11px] text-red-400">Active Circles</span>
                <div className="mt-1 text-2xl font-black text-red-200 drop-shadow-[0_0_12px_rgba(220,38,38,0.45)]">
                  {activeSummons.length}
                </div>
              </div>
              <div className="rounded-2xl border border-red-600/40 bg-black/60 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.35)]">
                <span className="text-[11px] text-red-400">Circles Touched</span>
                <div className="mt-1 text-2xl font-black text-red-200 drop-shadow-[0_0_12px_rgba(220,38,38,0.45)]">
                  {createdSummons.length + joinedSummons.length}
                </div>
              </div>
            </div>
            {bonusAllowance > 0 && (
              !IS_POWDER_MODE && (
                <div className="mt-4 flex justify-center">
                  <Link
                    href="/abyss"
                    className="inline-flex items-center gap-2 rounded-full border border-amber-400 bg-amber-500/20 px-6 py-2 text-[11px] font-mono uppercase tracking-[0.4em] text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.35)] transition hover:bg-amber-500/30"
                  >
                    Spend Bonus Burn
                  </Link>
                </div>
              )
            )}
            {SUMMON_LEADERBOARD_ENABLED && (
              <div className="flex justify-center pt-4">
                <Button
                  type="button"
                  onClick={() => setSummonLeaderboardOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-red-500 bg-red-700/70 px-6 py-2 text-[11px] font-mono uppercase tracking-[0.4em] text-red-100 shadow-[0_0_22px_rgba(220,38,38,0.35)] transition hover:bg-red-600"
                >
                  <Trophy className="h-4 w-4" />
                  Summoners Leaderboard
                </Button>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-2xl border border-red-600/40 bg-black/70 p-5 shadow-[0_0_20px_rgba(220,38,38,0.3)] backdrop-blur">
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
                <div className="mt-3 space-y-2">
                  {damnedOptions.map((option: DamnedOption) => {
                    const isActive = selectedInscriptionId === option.inscriptionId
                    const buttonClass = [
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
                      isActive
                        ? 'border-red-500 bg-red-900/30 shadow-[0_0_20px_rgba(220,38,38,0.35)]'
                        : 'border-red-800/40 bg-black/50 hover:border-red-500/60',
                    ].join(' ')
                    return (
                      <button
                        key={option.inscriptionId}
                        type="button"
                        onClick={() => setSelectedInscriptionId(option.inscriptionId)}
                        className={buttonClass}
                      >
                        <div className="relative h-10 w-10 overflow-hidden rounded border border-red-700/40 bg-black/40">
                          {option.image ? (
                            <Image
                              src={option.image}
                              alt={option.name ?? option.inscriptionId}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[10px] font-mono uppercase tracking-[0.3em] text-red-300">
                              NO IMG
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col">
                          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-red-200">
                            {option.name ?? option.inscriptionId.slice(0, 12)}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.3em] text-red-300/70">
                            {option.inscriptionId.slice(0, 8)}…{option.inscriptionId.slice(-8)}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-red-600/40 bg-black/70 p-5 shadow-[0_0_20px_rgba(220,38,38,0.3)] backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-red-200">Bonus Burns</h2>
              <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-red-300/70">
                Completing a summoning circle rewards a single bonus burn that bypasses the abyssal cap. Bonuses stack and are consumed the next time you sacrifice an ordinal while the abyss is full.
              </p>
            </section>
          </aside>

          <div className="space-y-6">
            <section className="rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.35)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-[0.35em] text-red-100">
                    <Flame className="h-5 w-5 text-red-400 drop-shadow-[0_0_12px_rgba(220,38,38,0.6)]" />
                    Start a Summon
                  </h2>
                  <p className="mt-2 max-w-xl text-[11px] uppercase tracking-[0.3em] text-red-300/70">
                    Select an ordinal from your inventory and gather three allies. The circle locks when four damned commit their relics.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleCreateSummon}
                  disabled={!selectedOption || creating}
                  className="border border-red-500 bg-red-700/80 px-5 py-3 text-[11px] font-mono uppercase tracking-[0.35em] text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)] transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
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

            <section className="rounded-2xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.35)] backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: 'active', label: 'Active Circles' },
                  { key: 'created', label: 'Circles You Founded' },
                  { key: 'joined', label: "Circles You've Joined" },
                ].map((tab) => {
                  const isActive = activeTab === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key as typeof activeTab)}
                      className={`rounded-full border px-4 py-2 text-[11px] font-mono uppercase tracking-[0.35em] transition ${
                        isActive
                          ? 'border-red-500 bg-red-700/80 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.45)]'
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
                      now={now}
                      emptyMessage="You have not joined a summoning circle yet."
                    />
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      {SUMMON_LEADERBOARD_ENABLED && summonLeaderboardOpen && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/90 px-4 py-8">
          <div className="w-full max-w-5xl space-y-6 rounded-3xl border border-red-600/50 bg-black/92 p-6 shadow-[0_0_45px_rgba(220,38,38,0.55)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1 text-left">
                <h3 className="flex items-center gap-2 font-mono text-base uppercase tracking-[0.35em] text-red-200">
                  <Trophy className="h-5 w-5 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]" />
                  Summoners Leaderboard
                </h3>
                <p className="max-w-xl font-mono text-xs uppercase tracking-[0.3em] text-red-400/80">
                  Scores: {SUMMON_BURN_POINTS} points per abyss burn, {SUMMON_HOST_POINTS} points per completed circle you hosted, {SUMMON_PARTICIPATION_POINTS} point per completed circle you joined.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {summonLeaderboardLoading && (
                  <span className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-300">
                    <Loader2 className="h-4 w-4 animate-spin" /> Refreshing
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-700/60 bg-transparent px-3 py-1 text-[11px] font-mono uppercase tracking-[0.3em] text-red-300 hover:bg-red-800/20"
                  onClick={() => setSummonLeaderboardOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-red-700/40 bg-black/40 md:max-h-[60vh] sm:max-h-[40vh]">
                {summonLeaderboardLoading ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-red-300" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-red-300">
                      Calculating summoning ranks…
                    </span>
                  </div>
                ) : summonLeaderboard.length === 0 ? (
                  <div className="px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-red-400/70">
                    No completed circles detected yet. Finish a ritual to appear here.
                  </div>
                ) : (
                  <table className="w-full table-fixed border-collapse text-[11px] font-mono uppercase tracking-[0.25em] text-red-200">
                    <thead className="sticky top-0 border-b border-red-700/40 bg-black/60 text-red-400">
                      <tr>
                        <th className="w-10 px-4 py-2 text-left font-normal">#</th>
                        <th className="px-4 py-2 text-left font-normal">Summoner</th>
                        <th className="w-16 px-4 py-2 text-right font-normal">Score</th>
                        <th className="w-14 px-4 py-2 text-right font-normal">🔥</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summonLeaderboard.map((entry, index) => {
                        const isSelected = selectedSummonerWallet === entry.wallet
                        const isSelf =
                          ordinalAddress.trim().length > 0 &&
                          entry.wallet === ordinalAddress.trim().toLowerCase()
                        const rowClasses = isSelected
                          ? 'bg-red-900/40 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.35)]'
                          : 'hover:bg-red-900/20'
                        return (
                          <tr
                            key={`${entry.wallet}-${index}`}
                            className={`${rowClasses} border-b border-red-700/20 transition`}
                            onClick={() => setSelectedSummonerWallet(entry.wallet)}
                          >
                            <td className="px-4 py-2 text-left text-red-500">{String(index + 1).padStart(2, '0')}</td>
                            <td className="px-4 py-2 text-left">
                              {renderSummonerIdentity(entry, isSelf)}
                            </td>
                            <td className="px-4 py-2 text-right text-amber-200 tabular-nums">{entry.score}</td>
                            <td className="px-4 py-2 text-right text-red-400 tabular-nums">{entry.burns}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="space-y-4 rounded-2xl border border-red-600/40 bg-black/60 p-4 shadow-[0_0_25px_rgba(220,38,38,0.35)]">
                {selectedSummonerEntry ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-red-600/50 bg-black/80 text-sm font-bold uppercase tracking-[0.2em] text-red-300">
                        {selectedSummonerEntry.avatarUrl ? (
                          <Image
                            src={selectedSummonerEntry.avatarUrl}
                            alt={getDisplayName(selectedSummonerEntry)}
                            width={48}
                            height={48}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          truncateWallet(selectedSummonerEntry.wallet).slice(0, 2)
                        )}
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-mono text-sm uppercase tracking-[0.3em] text-red-200">
                          {getDisplayName(selectedSummonerEntry)}
                        </h4>
                        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-400/80">
                          {truncateWallet(selectedSummonerEntry.wallet)}
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-400/80">
                          Total Score: {selectedSummonerEntry.score}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 text-[11px] uppercase tracking-[0.25em] text-red-200/80">
                      <div className="flex items-center justify-between rounded-lg border border-red-700/40 bg-black/40 px-3 py-2">
                        <span>Burns · {selectedSummonerEntry.burns}</span>
                        <span className="text-amber-200">
                          +{selectedSummonerEntry.burns * SUMMON_BURN_POINTS} pts
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-red-700/40 bg-black/40 px-3 py-2">
                        <span>Hosted · {selectedSummonerEntry.hosted}</span>
                        <span className="text-amber-200">
                          +{selectedSummonerEntry.hosted * SUMMON_HOST_POINTS} pts
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-red-700/40 bg-black/40 px-3 py-2">
                        <span>Allies Joined · {selectedSummonerEntry.participated}</span>
                        <span className="text-amber-200">
                          +{selectedSummonerEntry.participated * SUMMON_PARTICIPATION_POINTS} pts
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1 rounded-lg border border-red-700/40 bg-black/40 px-3 py-3 text-[10px] uppercase tracking-[0.3em] text-red-300/80">
                      <div className="flex items-center justify-between">
                        <span>Last Completed Circle</span>
                        <span>{formatTimestamp(selectedSummonerEntry.lastParticipatedAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Last Hosted</span>
                        <span>{formatTimestamp(selectedSummonerEntry.lastHostedAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Last Burn Recorded</span>
                        <span>{formatTimestamp(selectedSummonerEntry.lastBurnAt)}</span>
                      </div>
                      <div className="flex items-center justify-between text-red-400/70">
                        <span>Confirmed Burns</span>
                        <span>{selectedSummonerEntry.confirmedBurns}</span>
                      </div>
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-red-400/70">
                      Score is cumulative; keep hosting and sealing circles to climb the rankings.
                    </p>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.3em] text-red-300/70">
                    <Trophy className="h-8 w-8 text-red-500 drop-shadow-[0_0_18px_rgba(220,38,38,0.4)]" />
                    Select a summoner to view their contributions.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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
}) {
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
        const fallbackSlots = isPowderMode ? SUMMON_REQUIRED_PARTICIPANTS : 4
        const totalSlots = Math.max(summon.requiredParticipants, fallbackSlots)
        const isCreator =
          ordinalAddress.length > 0 && summon.creatorWallet?.toLowerCase() === ordinalAddress.toLowerCase()
        const isParticipant = summon.participants.some(
          (participant) => participant.wallet?.toLowerCase() === ordinalAddress.toLowerCase(),
        )
        const currentParticipant = summon.participants.find(
          (participant) => participant.wallet?.toLowerCase() === ordinalAddress.toLowerCase(),
        )
        const participantCompleted = Boolean(currentParticipant?.completed)
        const ready = summon.status === 'ready'
        const createdAtMs = Number.isFinite(Date.parse(summon.createdAt ?? ''))
          ? Date.parse(summon.createdAt ?? '')
          : Date.now()
        const rawExpiryMs = summon.expiresAt && Number.isFinite(Date.parse(summon.expiresAt))
          ? Date.parse(summon.expiresAt)
          : Number.NaN
        const fallbackExpiryMs = createdAtMs + SUMMON_DURATION_MS
        const targetExpiryMs = Number.isFinite(rawExpiryMs)
          ? Math.min(rawExpiryMs, fallbackExpiryMs)
          : fallbackExpiryMs
        const timeRemainingMs = targetExpiryMs - now
        const isExpired = timeRemainingMs <= 0 && ACTIVE_SUMMON_STATUSES.has(summon.status)
        const statusLabel = (isExpired ? 'expired' : summon.status).replace(/_/g, ' ')
        const completionWindowOpen = timeRemainingMs <= SUMMON_COMPLETION_WINDOW_MS
        const unlockCountdown = Math.max(0, timeRemainingMs - SUMMON_COMPLETION_WINDOW_MS)
        const glowIntensity = isExpired
          ? 0
          : Math.min(1, Math.max(0, 1 - timeRemainingMs / SUMMON_DURATION_MS))
        const glowRadius = 18 + glowIntensity * 32
        const glowAlpha = 0.22 + glowIntensity * 0.5
        const borderAlpha = 0.18 + glowIntensity * 0.55
        const backgroundGlowAlpha = 0.08 + glowIntensity * 0.35
        const containerClass = ['group relative overflow-hidden rounded-xl border px-4 py-4 transition'].join(' ')

        const summaryText = `${summon.participants.length}/${totalSlots}`
        const cannotJoin =
          ordinalAddress.length === 0 ||
          !ACTIVE_SUMMON_STATUSES.has(summon.status) ||
          isParticipant ||
          joiningSummonId === summon.id ||
          isExpired ||
          summon.participants.length >= totalSlots

        const completionAllowed =
          !isExpired && completionWindowOpen && ((ready && isCreator && !isPowderMode) || (isPowderMode && isParticipant && !participantCompleted))

        return (
          <div
            key={summon.id}
            className={containerClass}
            style={{
              borderColor: `rgba(248,113,113,${borderAlpha})`,
              boxShadow: `0 0 ${glowRadius}px rgba(220,38,38,${glowAlpha})`,
              backgroundImage: `linear-gradient(135deg, rgba(127,29,29,${backgroundGlowAlpha}) 0%, rgba(12,12,12,0.82) 55%, rgba(17,17,17,0.9) 100%)`,
            }}
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="mx-auto flex w-full max-w-[220px] flex-col items-center gap-3 md:mx-0">
                <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-red-200/80">
                  <span className="rounded-full border border-red-600/50 bg-red-900/30 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    {statusLabel}
                  </span>
                  <span>{summaryText}</span>
                  <span className={isExpired ? 'text-red-400' : 'text-amber-200'}>
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
                  {truncateWallet(summon.creatorWallet)}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {summon.participants.map((participant) => {
                    const pillClass = [
                      'rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em]',
                      participant.role === 'creator'
                        ? 'border-red-500/60 text-red-200'
                        : participant.completed
                        ? 'border-emerald-500/50 text-emerald-200'
                        : 'border-red-400/40 text-red-200/80',
                    ].join(' ')
                    return (
                      <span key={participant.id} className={pillClass}>
                        {participant.role === 'creator' ? 'Host' : 'Ally'} · {truncateWallet(participant.wallet)}
                        {participant.completed && <CheckCircle2 className="ml-1 inline h-3 w-3" />}
                      </span>
                    )
                  })}
                  {summon.participants.length < totalSlots && (
                    <span className="rounded-full border border-dashed border-red-500/40 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200/70">
                      Empty Seat
                    </span>
                  )}
                </div>
                {!isExpired ? (
                  <div className="text-[10px] uppercase tracking-[0.3em] text-red-300/60">
                    Ends {new Date(targetExpiryMs).toLocaleTimeString()}
                  </div>
                ) : (
                  <div className="text-[10px] uppercase tracking-[0.3em] text-red-400">
                    Circle expired — rally a new covenant.
                  </div>
                )}
              </div>
              <div className="flex min-w-[190px] flex-col items-stretch gap-2">
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
                    {isCreator && (
                      <Button
                        type="button"
                        onClick={() => onDismiss(summon)}
                        disabled={dismissingSummonId === summon.id}
                        className="flex items-center justify-center gap-2 border border-red-600 bg-red-800/70 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.35em] text-red-100 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {dismissingSummonId === summon.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" /> Dissolving…
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-3 w-3" /> Dissolve Circle
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ) : !isPowderMode ? (
                  <div className="rounded border border-red-600/40 bg-black/50 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Awaiting more allies…
                  </div>
                ) : null}
                {isPowderMode && !isParticipant && !isExpired && ACTIVE_SUMMON_STATUSES.has(summon.status) && (
                  <div className="rounded border border-red-500/30 bg-black/50 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-red-200/80">
                    Ten seats must be filled before the ritual locks.
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
    <div className="relative mx-auto h-44 w-44">
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
          {isCreator ? 'Host' : 'Rite'}
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

