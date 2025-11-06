'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react'
import dynamicImport from 'next/dynamic'
import BloodCanvas from '@/components/BloodCanvas'
import Header from '@/components/Header'
import BackgroundMusic from '@/components/BackgroundMusic'
import Leaderboard from '@/components/dashboard/Leaderboard'
import PointsHistory from '@/components/dashboard/PointsHistory'
import Morality from '@/components/dashboard/Morality'
import DualityStatus from '@/components/dashboard/DualityStatus'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'

// Only load LaserEyes provider after page is mounted
const LaserEyesWrapper = dynamicImport(
  () => import('@/components/LaserEyesWrapper'),
  { 
    ssr: false,
    loading: () => null
  }
)

interface MagicEdenToken {
  id?: string
  inscriptionId?: string
  collectionSymbol?: string
  tokenId?: string
  name?: string
  image?: string
  thumbnail?: string
  contentURI?: string
  meta?: {
    name?: string
    traits?: Array<{
      trait_type: string
      value: string | number
    }>
    [key: string]: any
  }
  priceInfo?: {
    price?: number
    [key: string]: any
  }
  traits?: Record<string, any>
  price?: number
  [key: string]: any
}

interface StepCardProps {
  step: number
  title: string
  description?: string
  children: ReactNode
  variant?: 'default' | 'compact' | 'blocking' | 'minimal'
}

const StepCard = ({ step, title, description, children, variant = 'default' }: StepCardProps) => {
  const containerClasses = {
    default: 'bg-black/40 rounded-xl border border-red-600/40 p-5 md:p-6 shadow-lg space-y-3',
    compact: 'bg-black/30 rounded-lg border border-red-600/20 p-4 md:p-4 shadow-sm space-y-2',
    blocking: 'bg-red-950/70 rounded-2xl border-2 border-red-500/70 p-6 md:p-8 shadow-2xl space-y-4 ring-1 ring-red-500/40 backdrop-blur',
    minimal: 'bg-black/20 rounded-lg border border-red-600/15 p-3 md:p-4 shadow-sm space-y-2'
  } as const

  const stepBadgeClasses = {
    default: 'w-12 h-12 text-lg md:text-xl',
    compact: 'w-9 h-9 text-sm',
    blocking: 'w-14 h-14 text-xl md:text-2xl',
    minimal: 'w-8 h-8 text-sm'
  } as const

  const titleClasses = {
    default: 'text-xl md:text-2xl font-black uppercase tracking-widest text-red-200',
    compact: 'text-lg font-extrabold uppercase tracking-widest text-red-200',
    blocking: 'text-2xl md:text-3xl font-black uppercase tracking-[0.4em] text-red-100',
    minimal: 'text-base md:text-lg font-bold uppercase tracking-[0.35em] text-red-200'
  } as const

  const descriptionClasses = {
    default: 'text-xs md:text-sm text-gray-400 font-mono uppercase tracking-wide',
    compact: 'text-[10px] md:text-xs text-gray-400 font-mono uppercase tracking-[0.35em]',
    blocking: 'text-xs md:text-sm text-red-300 font-mono uppercase tracking-[0.5em]',
    minimal: 'text-[10px] md:text-xs text-gray-500 font-mono uppercase tracking-[0.3em]'
  } as const

  const contentClasses = {
    default: 'text-sm md:text-base text-gray-200 font-mono leading-relaxed',
    compact: 'text-xs md:text-sm text-gray-300 font-mono leading-relaxed',
    blocking: 'text-sm md:text-lg text-red-100 font-mono leading-relaxed',
    minimal: 'text-xs md:text-sm text-gray-300 font-mono leading-relaxed'
  } as const

  return (
    <div className={`${containerClasses[variant]} transition-all duration-300`}>
      <div className="flex items-start gap-4">
        <div className={`rounded-full bg-red-700/60 border border-red-500 flex items-center justify-center font-mono font-bold text-white ${stepBadgeClasses[variant]}`}>
          {step}
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <h3 className={titleClasses[variant]}>
              {title}
            </h3>
            {description && (
              <p className={descriptionClasses[variant]}>
                {description}
              </p>
            )}
          </div>
          <div className={contentClasses[variant]}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardContent() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const blessedVideoRef = useRef<HTMLVideoElement>(null)
  const damnedVideoRef = useRef<HTMLVideoElement>(null)
  const [userOrdinals, setUserOrdinals] = useState<MagicEdenToken[]>([])
  const [loadingOrdinals, setLoadingOrdinals] = useState(false)
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)      
  const [isVerifying, setIsVerifying] = useState(false)
  const [musicVolume, setMusicVolume] = useState(30)
  const [isMusicMuted, setIsMusicMuted] = useState(false)
  const [startMusic, setStartMusic] = useState(false)
  const [activeSection, setActiveSection] = useState<'my-profile' | 'my-damned' | 'leaderboard' | 'points-history' | 'morality'>('my-profile')
  const [discordLinked, setDiscordLinked] = useState(false)
  const [discordUserId, setDiscordUserId] = useState<string | null>(null)
  const [loadingDiscord, setLoadingDiscord] = useState(false)
  const [twitterLinked, setTwitterLinked] = useState(false)
  const [twitterUserId, setTwitterUserId] = useState<string | null>(null)
  const [twitterUsername, setTwitterUsername] = useState<string | null>(null)
  const [loadingTwitter, setLoadingTwitter] = useState(false)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const [myDamnedTab, setMyDamnedTab] = useState<'collection' | 'purchases' | 'lists' | 'sells'>('collection')
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([])
  const [listHistory, setListHistory] = useState<any[]>([])
  const [sellHistory, setSellHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [totalGoodKarma, setTotalGoodKarma] = useState<number>(0)
  const [totalBadKarma, setTotalBadKarma] = useState<number>(0)
  const [loadingKarma, setLoadingKarma] = useState(false)
  const karmaCalculatedRef = useRef<Set<string>>(new Set()) // Track which wallets have had karma calculated
  const [checkInStatus, setCheckInStatus] = useState<{
    canCheckIn: boolean
    hoursRemaining: number
    nextCheckin: string | null
    lastCheckin: string | null
  } | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkInCountdown, setCheckInCountdown] = useState<number>(0)
  const [chosenSide, setChosenSide] = useState<'good' | 'evil' | null>(null)
  const [loadingSide, setLoadingSide] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
      
  // Helper function to convert satoshis to BTC
  const satoshisToBTC = (satoshis: number | string): string => {
    const sats = typeof satoshis === 'string' ? parseFloat(satoshis) : satoshis
    const btc = sats / 100000000
    return btc.toFixed(8).replace(/\.?0+$/, '') // Remove trailing zeros
  }

  // Fetch karma totals and chosen side
  const fetchKarmaTotals = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return
    setLoadingKarma(true)
    try {
      const response = await fetch(`/api/profile?walletAddress=${encodeURIComponent(walletAddress)}`)
      const profile = await response.json()
      if (profile && !profile.error) {
        setTotalGoodKarma(profile.total_good_karma || 0)
        setTotalBadKarma(profile.total_bad_karma || 0)
        setChosenSide(profile.chosen_side || null)
        setProfileUsername(profile.username || null)
        setProfileAvatarUrl(profile.avatar_url || null)
      }
    } catch (error) {
      console.error('Error fetching karma totals:', error)
    } finally {
      setLoadingKarma(false)
    }
  }, [])

  // Fetch chosen side
  const fetchChosenSide = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return
    try {
      const response = await fetch(`/api/profile/reset-karma?walletAddress=${encodeURIComponent(walletAddress)}`)
      const data = await response.json()
      if (data && !data.error) {
        setChosenSide(data.chosenSide)
      }
    } catch (error) {
      console.error('Error fetching chosen side:', error)
    }
  }, [])

  // Handle reset karma and choose side
  const handleResetKarma = async (side: 'good' | 'evil') => {
    if (!address) {
      toast.warning('Please connect your wallet first')
      return
    }
    
    setLoadingSide(true)
    try {
      const response = await fetch('/api/profile/reset-karma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          chosenSide: side
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setChosenSide(side)
        setTotalGoodKarma(0)
        setTotalBadKarma(0)
        setShowResetConfirm(false)
        toast.success(data.message || `You have chosen the ${side} side!`)
        // Refresh page data
        await fetchKarmaTotals(address)
      } else {
        toast.error(data.error || 'Failed to reset karma')
      }
    } catch (error) {
      console.error('Error resetting karma:', error)
      toast.error('Failed to reset karma. Please try again.')
    } finally {
      setLoadingSide(false)
    }
  }

  // Fetch check-in status
  const fetchCheckInStatus = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return
    try {
      const response = await fetch(`/api/daily-checkin?walletAddress=${encodeURIComponent(walletAddress)}`)
      const data = await response.json()
      if (data && !data.error) {
        setCheckInStatus({
          canCheckIn: data.canCheckIn,
          hoursRemaining: data.hoursRemaining || 0,
          nextCheckin: data.nextCheckin,
          lastCheckin: data.lastCheckin
        })
      }
    } catch (error) {
      console.error('Error fetching check-in status:', error)
    }
  }, [])                                  

  // Start music after a delay
  useEffect(() => {
    const musicTimer = setTimeout(() => {
      setStartMusic(true)
    }, 2000)
    return () => clearTimeout(musicTimer)
  }, [])

  // Auto-play videos
  useEffect(() => {
    const playVideos = async () => {
      try {
        if (blessedVideoRef.current) {
          blessedVideoRef.current.play().catch(err => console.log('Blessed video play failed:', err))
        }
        if (damnedVideoRef.current) {
          damnedVideoRef.current.play().catch(err => console.log('Damned video play failed:', err))
        }
    } catch (error) {
        console.log('Video autoplay blocked:', error)
      }
    }
    playVideos()
  }, [])

  const handleHolderVerified = (holder: boolean, walletAddress?: string) => {
    setIsHolder(holder)
    setIsVerifying(false)
    if (holder && walletAddress) {
      fetchUserOrdinals(walletAddress)
    }
  }

  const handleVerifyingStart = () => {
    setIsVerifying(true)
  }

  const fetchUserOrdinals = useCallback(async (walletAddress: string) => {
    setLoadingOrdinals(true)
    try {
      const apiUrl = `/api/magic-eden?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned`
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      })

      if (!response.ok) {
        console.error('Failed to fetch ordinals:', response.status)
        setLoadingOrdinals(false)
        return
      }

      const data = await response.json()
      
      console.log('📦 Magic Eden API response structure:', {
        hasTokens: !!data.tokens,
        tokensLength: data.tokens?.length,
        total: data.total,
        keys: Object.keys(data),
        firstToken: data.tokens?.[0] ? {
          keys: Object.keys(data.tokens[0]),
          id: data.tokens[0].id,
          inscriptionId: data.tokens[0].inscriptionId,
          contentURI: data.tokens[0].contentURI,
          meta: data.tokens[0].meta,
          priceInfo: data.tokens[0].priceInfo
        } : null
      })
      
      // Handle different response formats
      let tokens: MagicEdenToken[] = []
      if (Array.isArray(data.tokens)) {
        tokens = data.tokens
      } else if (Array.isArray(data)) {
        tokens = data
      } else if (data.tokens && Array.isArray(data.tokens)) {
        tokens = data.tokens
      }

      console.log('✅ Parsed tokens count:', tokens.length)
      setUserOrdinals(tokens)
      
      // Calculate karma only once per wallet connection session to prevent duplicates
      // Purchase karma is awarded automatically when count increases are detected
      if (tokens.length > 0 && !karmaCalculatedRef.current.has(walletAddress)) {
        try {
          karmaCalculatedRef.current.add(walletAddress)
          await fetch('/api/karma/calculate-ordinal-karma', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
          })
        } catch (error) {
          console.error('Error calculating ordinal karma:', error)
          karmaCalculatedRef.current.delete(walletAddress) // Remove on error so it can retry
        }
      }
    } catch (error) {
      console.error('Error fetching ordinals:', error)
    } finally {
      setLoadingOrdinals(false)
    }
  }, [])

  // Fetch Discord link status
  const checkDiscordStatus = useCallback(async () => {
    if (!address) return
    setLoadingDiscord(true)
    try {
      const response = await fetch(`/api/profile/discord?walletAddress=${encodeURIComponent(address)}`)
      const data = await response.json()
      setDiscordLinked(data.linked || false)
      setDiscordUserId(data.discordUserId || null)
    } catch (error) {
      console.error('Error checking Discord status:', error)
    } finally {
      setLoadingDiscord(false)
    }
  }, [address])

  // Fetch Twitter link status
  const checkTwitterStatus = useCallback(async () => {
    if (!address) return
    setLoadingTwitter(true)
    try {
      const response = await fetch(`/api/profile/twitter?walletAddress=${encodeURIComponent(address)}`)
      const data = await response.json()
      setTwitterLinked(data.linked || false)
      setTwitterUserId(data.twitterUserId || null)
      setTwitterUsername(data.twitterUsername || null)
    } catch (error) {
      console.error('Error checking Twitter status:', error)
    } finally {
      setLoadingTwitter(false)
    }
  }, [address])

  // Auto-create profile when wallet connects
  useEffect(() => {
    if (connected && address) {
      // Create profile automatically
      fetch('/api/profile/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          paymentAddress: address // Initially same as wallet address
        })
      }).then(() => {
        // Fetch karma totals after profile is created/updated
        fetchKarmaTotals(address)
      }).catch(err => {
        console.error('Failed to create profile:', err)
      })
      
      fetchUserOrdinals(address)
      checkDiscordStatus()
      checkTwitterStatus()
      fetchKarmaTotals(address)
      fetchCheckInStatus(address)
      fetchChosenSide(address)
    } else {
      setUserOrdinals([])
      setDiscordLinked(false)
      setDiscordUserId(null)
      setTwitterLinked(false)
      setTwitterUserId(null)
      setTwitterUsername(null)
      setTotalGoodKarma(0)
      setTotalBadKarma(0)
      setCheckInStatus(null)
      setChosenSide(null)
      setProfileUsername(null)
      setProfileAvatarUrl(null)
      karmaCalculatedRef.current.clear() // Reset when wallet disconnects
    }
  }, [connected, address, fetchUserOrdinals, checkDiscordStatus, checkTwitterStatus, fetchKarmaTotals, fetchCheckInStatus, fetchChosenSide])

  // Check Discord auth status from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authStatus = params.get('discord_auth')
    if (authStatus === 'success' && address) {
      // Refresh Discord status
      checkDiscordStatus()
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [address, checkDiscordStatus])

  // Check Twitter auth status from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authStatus = params.get('twitter_auth')
    if (authStatus === 'success' && address) {
      // Refresh Twitter status
      checkTwitterStatus()
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [address, checkTwitterStatus])

  // Handle Discord auth
  const handleDiscordAuth = () => {
    if (!address) {
      toast.warning('Please connect your wallet first')
      return
    }
    window.location.href = `/api/discord/auth?walletAddress=${encodeURIComponent(address)}`
  }

  // Handle Twitter auth
  const handleTwitterAuth = () => {
    if (!address) {
      toast.warning('Please connect your wallet first')
      return
    }
    window.location.href = `/api/twitter/auth?walletAddress=${encodeURIComponent(address)}`
  }

  // Handle daily check-in
  const handleDailyCheckIn = async (type: 'good' | 'evil') => {
    if (!address) {
      toast.warning('Please connect your wallet first')
      return
    }
    
    if (checkInStatus && !checkInStatus.canCheckIn) {
      return
    }
    
    setCheckingIn(true)
    try {
      const response = await fetch('/api/daily-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          type
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Update karma totals
        setTotalGoodKarma(data.totalGoodKarma || totalGoodKarma)
        setTotalBadKarma(data.totalBadKarma || totalBadKarma)
        // Refresh check-in status
        await fetchCheckInStatus(address)
        toast.success(data.message || `Check-in successful! ${data.karmaAwarded > 0 ? '+' : ''}${data.karmaAwarded} karma`)
      } else {
        toast.error(data.error || 'Check-in failed')
        // Refresh status to get updated countdown
        await fetchCheckInStatus(address)
      }
    } catch (error) {
      console.error('Error checking in:', error)
      toast.error('Failed to check in. Please try again.')
    } finally {
      setCheckingIn(false)
    }
  }

  // Countdown timer for check-in
  useEffect(() => {
    if (!checkInStatus || checkInStatus.canCheckIn) {
      setCheckInCountdown(0)
      return
    }
    
    if (!checkInStatus.nextCheckin) {
      return
    }
    
    const updateCountdown = () => {
      const now = new Date().getTime()
      const nextCheckin = new Date(checkInStatus.nextCheckin!).getTime()
      const diff = nextCheckin - now
      
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        setCheckInCountdown(Math.ceil(diff / (1000 * 60 * 60)))
      } else {
        // Check-in is available, refresh status
        fetchCheckInStatus(address!)
      }
    }
    
    updateCountdown()
    const interval = setInterval(updateCountdown, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [checkInStatus, address, fetchCheckInStatus])

  const getCheckInStatusMessage = useCallback(() => {
    if (!checkInStatus) return 'Fetching status…'
    if (checkInStatus.canCheckIn) {
      return chosenSide === 'good' ? '+5 good karma available now' : '-5 evil karma available now'
    }
    if (checkInStatus.nextCheckin) {
      const diffMs = new Date(checkInStatus.nextCheckin).getTime() - Date.now()
      if (diffMs <= 0) return 'Available shortly'
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      if (hours <= 0) return `${Math.max(minutes, 1)}m remaining`
      return minutes > 0 ? `${hours}h ${minutes}m remaining` : `${hours}h remaining`
    }
    if (checkInCountdown > 0) {
      return `${checkInCountdown}h remaining`
    }
    return 'Cooldown active'
  }, [checkInStatus, checkInCountdown, chosenSide])

  const checkInLastStamp = useMemo(() => {
    if (!checkInStatus?.lastCheckin) return null
    const lastDate = new Date(checkInStatus.lastCheckin)
    if (Number.isNaN(lastDate.getTime())) return null
    return lastDate.toLocaleString()
  }, [checkInStatus])

  const checkInReady = Boolean(checkInStatus?.canCheckIn)

  const discordDisplayName = useMemo(() => {
    if (!discordLinked) return null
    if (profileUsername) return profileUsername
    if (discordUserId) return discordUserId
    return null
  }, [discordLinked, profileUsername, discordUserId])

  const twitterDisplayName = useMemo(() => {
    if (!twitterLinked) return null
    if (twitterUsername) return `@${twitterUsername}`
    if (twitterUserId) return twitterUserId
    return null
  }, [twitterLinked, twitterUsername, twitterUserId])

  // Fetch activity history from Magic Eden
  // Note: Must NOT include collectionSymbol in query - filter client-side instead
  // Fetch 3 pages deep (offset 0, 100, 200) for each activity type
  const fetchActivityHistory = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return
    
    setLoadingHistory(true)
    try {
      // Fetch all activity types with 3 pages each (no collectionSymbol in query)
      const offsets = [0, 100, 200]
      const limit = 100
      
      // Helper function to fetch multiple pages for an activity kind
      const fetchPages = async (kind: string) => {
        const pagePromises = offsets.map(offset =>
          fetch(`/api/magic-eden/activities?ownerAddress=${encodeURIComponent(walletAddress)}&kind=${kind}&limit=${limit}&offset=${offset}`)
        )
        const responses = await Promise.all(pagePromises)
        const allActivities: any[] = []
        
        for (const res of responses) {
          if (res.ok) {
            const data = await res.json()
            // Filter for the-damned collection (client-side filtering)
            const filtered = (data.activities || []).filter((activity: any) => 
              activity.collectionSymbol === 'the-damned'
            )
            allActivities.push(...filtered)
          }
        }
        
        return allActivities
      }

      // Fetch all activity types in parallel
      const [buysBroadcasted, mints, creates, lists, delists, transfers] = await Promise.all([
        fetchPages('buying_broadcasted'),
        fetchPages('mint_broadcasted'),
        fetchPages('create'),
        fetchPages('list'),
        fetchPages('delist'),
        fetchPages('transfer')
      ])

      // Combine all buy activities: mint, create, buying_broadcasted
      let allPurchases: any[] = []
      
      // Filter buying_broadcasted where user is the new owner (bought something)
      const purchases = buysBroadcasted.filter((activity: any) => 
        activity.newOwner?.toLowerCase() === walletAddress.toLowerCase() &&
        activity.kind === 'buying_broadcasted'
      )
      allPurchases.push(...purchases)

      // Filter mint_broadcasted where user is the new owner
      const mintsFiltered = mints.filter((activity: any) => 
        activity.newOwner?.toLowerCase() === walletAddress.toLowerCase() &&
        (activity.kind === 'mint_broadcasted' || activity.kind === 'mint')
      )
      allPurchases.push(...mintsFiltered)

      // Filter create activities where user is the new owner
      const createsFiltered = creates.filter((activity: any) => 
        activity.newOwner?.toLowerCase() === walletAddress.toLowerCase() &&
        activity.kind === 'create'
      )
      allPurchases.push(...createsFiltered)

      // Sort purchases by date (newest first)
      allPurchases.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        return dateB - dateA
      })
      setPurchaseHistory(allPurchases)

      // Parse list history (list and delist) - treated as negative
      let allListsFiltered: any[] = []
      
      const listsFiltered = lists.filter((activity: any) => 
        activity.kind === 'list' &&
        activity.oldOwner?.toLowerCase() === walletAddress.toLowerCase()
      )
      allListsFiltered.push(...listsFiltered)
      
      const delistsFiltered = delists.filter((activity: any) => 
        activity.kind === 'delist' &&
        activity.oldOwner?.toLowerCase() === walletAddress.toLowerCase()
      )
      allListsFiltered.push(...delistsFiltered)
      
      // Sort by date (newest first)
      allListsFiltered.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        return dateB - dateA
      })
      setListHistory(allListsFiltered)

      // Parse sell history (transfers where user was the old owner)
      const sellsFiltered = transfers.filter((activity: any) => 
        activity.kind === 'transfer' &&
        activity.oldOwner?.toLowerCase() === walletAddress.toLowerCase() &&
        activity.newOwner?.toLowerCase() !== walletAddress.toLowerCase() &&
        activity.txValue && activity.txValue > 0 // Only actual sales with value
      )
      // Sort by date (newest first)
      sellsFiltered.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        return dateB - dateA
      })
      setSellHistory(sellsFiltered)
    } catch (error) {
      console.error('Error fetching activity history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  // Fetch activity history when wallet connects or when entering my-damned section
  // This ensures counts are available for the tab buttons before clicking them
  useEffect(() => {
    if (connected && address && activeSection === 'my-damned') {
      fetchActivityHistory(address)
    }
  }, [connected, address, activeSection, fetchActivityHistory])


  // Calculate stats
  const totalOrdinals = userOrdinals.length

  return (
    <>
      <BackgroundMusic shouldPlay={startMusic} volume={musicVolume} isMuted={isMusicMuted} />
      <BloodCanvas />
      <main className="min-h-screen relative overflow-x-hidden bg-black">
        {/* Background Videos */}
        <div className="fixed inset-0 z-0">
          {/* Blessed Side Background - Heaven Gate */}
          <div className="absolute left-0 top-0 w-1/2 h-full overflow-hidden">
            <video
              ref={blessedVideoRef}
              className="w-full h-full object-cover opacity-50"
              loop
              muted
              playsInline
              autoPlay
            >
              <source src={`/${encodeURIComponent('New folder (8)')}/Make_a_gate_202511041646_0jdzq.mp4`} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/40 via-blue-900/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
          </div>

          {/* Damned Side Background - Hell Gate */}
          <div className="absolute right-0 top-0 w-1/2 h-full overflow-hidden">
            <video
              ref={damnedVideoRef}
              className="w-full h-full object-cover opacity-50"
              loop
              muted
              playsInline
              autoPlay
            >
              <source src={`/${encodeURIComponent('New folder (8)')}/Make_a_gate_202511041646_j7tr4.mp4`} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-l from-red-900/40 via-orange-900/20 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
        </div>

          {/* Center Divider */}
          <div className="absolute left-1/2 top-0 w-1 h-full bg-gradient-to-b from-transparent via-[#ff0000]/50 to-transparent transform -translate-x-1/2" />
          <div className="absolute left-1/2 top-0 w-2 h-full bg-gradient-to-b from-transparent via-[#ff0000]/20 to-transparent transform -translate-x-1/2 blur-sm" />
      </div>

        <Header 
          isHolder={isHolder} 
          isVerifying={isVerifying}
          connected={connected}
          onHolderVerified={handleHolderVerified}
          onVerifyingStart={handleVerifyingStart}
          onConnectedChange={() => {}}
          musicVolume={musicVolume}
          onMusicVolumeChange={setMusicVolume}
          isMusicMuted={isMusicMuted}
          onMusicMutedChange={setIsMusicMuted}
        />

        {connected && address && (
          <div className="container mx-auto px-4 pt-6 relative z-10 max-w-7xl">
            <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
              <div className="bg-black/60 border border-red-600/40 rounded-xl p-4 md:p-6 shadow-lg">
                <DualityStatus walletAddress={address} profileSide={chosenSide} mode="compact" />
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-black/60 border border-red-600/30 rounded-xl p-4 md:p-5 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] md:text-xs uppercase text-gray-400 tracking-[0.45em]">Karma Score</span>
                    {loadingKarma && (
                      <span className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.3em] animate-pulse">Syncing…</span>
                    )}
                  </div>
                  {chosenSide ? (
                    <div className="mt-3 space-y-4">
                      <div className="flex items-baseline justify-between">
                        <div className={`text-3xl md:text-4xl font-black font-mono ${chosenSide === 'good' ? 'text-green-400' : 'text-red-400'}`}>
                          {loadingKarma ? '…' : (chosenSide === 'good' ? totalGoodKarma : totalBadKarma).toLocaleString()}
                        </div>
                        <div className="text-xs uppercase font-mono text-gray-500 tracking-[0.4em]">
                          {chosenSide === 'good' ? 'GOOD' : 'EVIL'}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div className="flex items-center justify-between text-gray-400">
                          <span>Good</span>
                          <span className="text-green-400">{totalGoodKarma.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-400">
                          <span>Evil</span>
                          <span className="text-red-400">{totalBadKarma.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-gray-400 font-mono">
                      Choose a morality side to start tracking your karma totals.
                    </p>
                  )}
                </div>

                {chosenSide && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!checkInReady || checkingIn || !chosenSide) return
                      handleDailyCheckIn(chosenSide)
                    }}
                    disabled={!checkInReady || checkingIn}
                    className={`rounded-xl border-2 px-4 py-4 md:px-5 md:py-5 text-left font-mono transition-all duration-200 shadow-md ${
                      checkInReady
                        ? 'bg-green-500 text-black border-green-400 hover:bg-green-400 hover:border-green-300 shadow-[0_0_20px_rgba(34,197,94,0.35)]'
                        : 'bg-gray-900/70 text-gray-400 border-gray-700 cursor-not-allowed'
                    } ${checkingIn ? 'opacity-75' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl ${checkInReady ? 'text-black' : 'text-gray-500'}`}>✓</span>
                        <span className="text-xs md:text-sm uppercase tracking-[0.4em]">Daily Check-In</span>
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.3em]">
                        {checkInReady ? (checkingIn ? 'Processing…' : 'Ready') : 'Cooldown'}
                      </span>
                    </div>
                    <div className={`mt-3 text-xs md:text-sm tracking-normal ${checkInReady ? 'text-black/80' : 'text-gray-400'}`}>
                      {getCheckInStatusMessage()}
                    </div>
                    {checkInLastStamp && (
                      <div className={`mt-2 text-[10px] tracking-normal ${checkInReady ? 'text-black/60' : 'text-gray-500'}`}>
                        Last check-in {checkInLastStamp}
                      </div>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="container mx-auto px-4 py-8 relative z-10 max-w-7xl">
          {/* Internal Navigation */}
          <div className="mb-8 flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => setActiveSection('my-profile')}
              className={`px-6 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                activeSection === 'my-profile'
                  ? 'bg-red-600/80 border-red-600 text-white'
                  : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
              }`}
            >
              My Profile
            </button>
            <button
              onClick={() => setActiveSection('my-damned')}
              className={`px-6 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                activeSection === 'my-damned'
                  ? 'bg-red-600/80 border-red-600 text-white'
                  : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
              }`}
            >
              My Damned
            </button>
            <button
              onClick={() => setActiveSection('leaderboard')}
              className={`px-6 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                activeSection === 'leaderboard'
                  ? 'bg-red-600/80 border-red-600 text-white'
                  : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
              }`}
            >
              Leaderboard
            </button>
            <button
              onClick={() => setActiveSection('points-history')}
              className={`px-6 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                activeSection === 'points-history'
                  ? 'bg-red-600/80 border-red-600 text-white'
                  : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
              }`}
            >
              Points History
            </button>
            <button
              onClick={() => setActiveSection('morality')}
              className={`px-6 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                activeSection === 'morality'
                  ? 'bg-red-600/80 border-red-600 text-white'
                  : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
              }`}
            >
              Morality
            </button>
          </div>

          {/* My Profile Section */}
          {activeSection === 'my-profile' && (
            <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-red-600 mb-6 font-mono border-b border-red-600/30 pb-2">
                MY PROFILE
              </h2>
              <div className="space-y-6">
                {(() => {
                  const walletComplete = Boolean(connected && address)
                  const socialsComplete = walletComplete && discordLinked && twitterLinked

                  return (
                    <>
                      {socialsComplete && (
                        <div className="mb-6 bg-black/30 border border-blue-600/30 rounded-lg px-4 py-3 text-xs md:text-sm text-gray-200 font-mono flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                          <div className="flex flex-wrap items-center gap-4 md:flex-1">
                          <div className="flex items-center gap-3">
                            {profileAvatarUrl ? (
                              <img src={profileAvatarUrl} alt="Discord avatar" className="w-7 h-7 rounded-full border border-green-500/60" />
                            ) : (
                              <span className="text-lg">💬</span>
                            )}
                            <div className="flex flex-col">
                              <span className="text-green-400">Discord linked</span>
                              {discordDisplayName && <span className="text-[10px] text-gray-400">{discordDisplayName}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🐦</span>
                            <div className="flex flex-col">
                              <span className="text-blue-400">Twitter linked</span>
                              {twitterDisplayName && <span className="text-[10px] text-gray-400">{twitterDisplayName}</span>}
                            </div>
                            </div>
                          </div>
                          <div className="w-full md:flex-1 flex md:justify-end">
                            {chosenSide ? (
                              <div className="flex flex-col md:items-end gap-3 w-full">
                                <div className="flex flex-wrap md:flex-nowrap items-center justify-between md:justify-end gap-3 w-full">
                                  <span
                                    className={`text-xs md:text-sm font-bold uppercase tracking-[0.3em] ${
                                      chosenSide === 'good' ? 'text-green-400' : 'text-red-400'
                                    }`}
                                  >
                                    Chosen Side: {chosenSide.toUpperCase()}
                                  </span>
                                  <button
                                    onClick={() => setShowResetConfirm(true)}
                                    disabled={loadingSide}
                                    className="px-3 py-1 rounded-md font-mono text-[11px] md:text-xs uppercase border border-yellow-500 text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50"
                                  >
                                    {loadingSide ? 'Resetting…' : 'Reset'}
                                  </button>
                                </div>
                                {showResetConfirm && (
                                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 text-[11px] text-yellow-300 bg-black/50 border border-yellow-600/40 rounded-md px-3 py-2">
                                    <span>Reset alignment?</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleResetKarma('good')}
                                        disabled={loadingSide}
                                        className="px-2 py-1 rounded border border-green-500 text-green-400 hover:bg-green-500/20 disabled:opacity-50"
                                      >
                                        Good
                                      </button>
                                      <button
                                        onClick={() => handleResetKarma('evil')}
                                        disabled={loadingSide}
                                        className="px-2 py-1 rounded border border-red-500 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                      >
                                        Evil
                                      </button>
                                      <button
                                        onClick={() => setShowResetConfirm(false)}
                                        className="px-2 py-1 rounded border border-gray-500 text-gray-400 hover:bg-gray-500/20"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] md:text-xs text-gray-400 md:text-right">
                                Choose your side below to unlock quests.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {!walletComplete && (
                        <StepCard
                          step={1}
                          title="Connect Your Wallet"
                          description="LaserEyes verification unlocks everything"
                          variant="blocking"
                        >
                          <div className="space-y-4">
                            <div className="text-lg md:text-xl font-mono font-bold text-red-100">
                              Connect your wallet to unlock the dashboard.
                            </div>
                            <p className="text-sm md:text-base text-red-200/80">
                              Hit the connect button in the header. We auto-verify holder status the second LaserEyes links you in.
                            </p>
                          </div>
                        </StepCard>
                      )}

                      {walletComplete && !socialsComplete && (
                        <StepCard
                          step={2}
                          title="Link Discord & Twitter"
                          description="Social auth proves you belong to the cult"
                          variant="blocking"
                        >
                          <div className="space-y-5">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <span className="text-3xl">💬</span>
                                <div>
                                  <div className="text-white text-base font-bold">Discord</div>
                                  {discordLinked && discordUserId && (
                                    <div className="text-red-100/80 text-xs">Linked: {discordUserId}</div>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={handleDiscordAuth}
                                disabled={loadingDiscord}
                                className={`px-5 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                                  discordLinked
                                    ? 'bg-green-600/80 border-green-600 text-white cursor-default'
                                    : 'bg-red-600/80 border-red-600 text-white hover:bg-red-600 hover:border-red-500'
                                } ${loadingDiscord ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {loadingDiscord ? 'Loading...' : discordLinked ? '✓ Connected' : 'Connect Discord'}
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <span className="text-3xl">🐦</span>
                                <div>
                                  <div className="text-white text-base font-bold">Twitter</div>
                                  {twitterLinked && twitterUsername && (
                                    <div className="text-red-100/80 text-xs">@{twitterUsername}</div>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={handleTwitterAuth}
                                disabled={loadingTwitter}
                                className={`px-5 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                                  twitterLinked
                                    ? 'bg-blue-600/80 border-blue-600 text-white cursor-default'
                                    : 'bg-blue-600/80 border-blue-600 text-white hover:bg-blue-600 hover:border-blue-500'
                                } ${loadingTwitter ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {loadingTwitter ? 'Loading...' : twitterLinked ? '✓ Connected' : 'Connect Twitter'}
                              </button>
                            </div>
                            <p className="text-xs md:text-sm text-red-200/80">
                              Both logins are mandatory before karma quests, Discord tasks, or leaderboard slots unlock.
                            </p>
                          </div>
                        </StepCard>
                      )}

                      {walletComplete && socialsComplete && chosenSide === null && (
                        <StepCard
                          step={3}
                          title="Choose Your Side"
                          description="Pick once, reset if you dare"
                          variant="blocking"
                        >
                          <div className="space-y-4">
                              <div className="space-y-3">
                                <div className="text-yellow-300 text-sm md:text-base font-mono">
                                  ⚠️ Lock in GOOD or EVIL to access quests, Discord tasks, and Duality.
                                </div>
                                <div className="flex flex-col md:flex-row gap-3">
                                  <button
                                    onClick={() => handleResetKarma('good')}
                                    disabled={loadingSide}
                                    className={`flex-1 px-4 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                                      loadingSide
                                        ? 'opacity-50 cursor-not-allowed bg-green-600/80 border-green-600 text-white'
                                        : 'bg-green-600/80 border-green-600 text-white hover:bg-green-600 hover:border-green-500'
                                    }`}
                                  >
                                    {loadingSide ? 'Choosing...' : '✓ Choose Good'}
                                  </button>
                                  <button
                                    onClick={() => handleResetKarma('evil')}
                                    disabled={loadingSide}
                                    className={`flex-1 px-4 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                                      loadingSide
                                        ? 'opacity-50 cursor-not-allowed bg-red-600/80 border-red-600 text-white'
                                        : 'bg-red-600/80 border-red-600 text-white hover:bg-red-700 hover:border-red-500'
                                    }`}
                                  >
                                    {loadingSide ? 'Choosing...' : '✗ Choose Evil'}
                                  </button>
                                </div>
                                <p className="text-xs text-gray-500">
                                  Resetting later wipes karma history but keeps your profile and social links.
                                </p>
                              </div>
                          </div>
                        </StepCard>
                      )}
                    </>
                  )
                })()}

                {connected && chosenSide && (
                  <StepCard
                    step={4}
                    title="Discord Holder Tasks"
                    description="Complete these checkpoints to stay verified"
                    variant="compact"
                  >
                    <div className="space-y-3">
                      {!discordLinked && (
                        <div className="text-sm text-yellow-400 font-mono">
                          Link Discord above to mark these tasks complete. Review the checklist here so you know what the bot expects.
                        </div>
                      )}
                      <Morality
                        walletAddress={address}
                        chosenSide={chosenSide}
                        filterPlatforms={['discord']}
                        compact
                        disabled={!discordLinked}
                      />
                      <p className="text-xs text-gray-500">
                        Finish these Discord-specific tasks to keep the Holder role. Completions sync instantly with your karma log.
                      </p>
                    </div>
                  </StepCard>
                )}

                {connected && chosenSide && (
                  <StepCard
                    step={5}
                    title="Morality Quest Board"
                    description="Earn karma through good or evil deeds"
                    variant="compact"
                  >
                    <div className="space-y-3">
                      <Morality walletAddress={address} chosenSide={chosenSide} limit={4} compact />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setActiveSection('morality')}
                          className="px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase border-2 border-red-600 text-red-400 hover:bg-red-600/20 transition"
                        >
                          View full quest board →
                        </button>
                        <button
                          onClick={() => setActiveSection('my-damned')}
                          className="px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase border-2 border-red-600 text-red-400 hover:bg-red-600/20 transition"
                        >
                          View Ordinal activity →
                        </button>
                      </div>
                    </div>
                  </StepCard>
                )}

                {connected && (
                  <StepCard
                    step={connected && chosenSide ? 6 : 4}
                    title="Duality Protocol Status"
                    description="Weekly pairing, fate meter, and trials"
                  >
                    <DualityStatus walletAddress={address} profileSide={chosenSide} />
                  </StepCard>
                )}
              </div>
            </div>
          )}

          {/* Stats Cards */}
          {connected && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
                <div className="text-gray-400 text-sm font-mono uppercase mb-2">Total Ordinals</div>
                <div className="text-3xl font-bold text-red-600 font-mono">{totalOrdinals}</div>
              </div>
              <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
                <div className="text-gray-400 text-sm font-mono uppercase mb-2">Status</div>
                <div className="text-2xl font-bold font-mono">
                  {isHolder ? (
                    <span className="text-green-500">✓ Holder</span>
                  ) : (
                    <span className="text-[#ff6b6b]">Not Holder</span>
                )}
              </div>
            </div>
          </div>
          )}

          {/* My Collection Section */}
          {activeSection === 'my-damned' && connected ? (
            <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-red-600 mb-6 font-mono border-b border-red-600/30 pb-2">
                MY DAMNED
              </h2>
              
              {/* Tab Navigation */}
              <div className="mb-6 flex flex-wrap gap-2 border-b border-red-600/30 pb-4">
                <button
                  onClick={() => setMyDamnedTab('collection')}
                  className={`px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase transition-all border-2 ${
                    myDamnedTab === 'collection'
                      ? 'bg-red-600/80 border-red-600 text-white'
                      : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
                  }`}
                >
                  Collection
                </button>
                <button
                  onClick={() => setMyDamnedTab('purchases')}
                  className={`px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase transition-all border-2 ${
                    myDamnedTab === 'purchases'
                      ? 'bg-red-600/80 border-red-600 text-white'
                      : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
                  }`}
                >
                  Purchases ({purchaseHistory.length})
                </button>
                <button
                  onClick={() => setMyDamnedTab('lists')}
                  className={`px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase transition-all border-2 ${
                    myDamnedTab === 'lists'
                      ? 'bg-red-600/80 border-red-600 text-white'
                      : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
                  }`}
                >
                  Lists ({listHistory.length})
                </button>
                <button
                  onClick={() => setMyDamnedTab('sells')}
                  className={`px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase transition-all border-2 ${
                    myDamnedTab === 'sells'
                      ? 'bg-red-600/80 border-red-600 text-white'
                      : 'bg-black/60 border-red-600/50 text-red-600 hover:bg-red-600/20'
                  }`}
                >
                  Sells ({sellHistory.length})
                </button>
              </div>
              
              {/* Collection Tab */}
              {myDamnedTab === 'collection' && (
                <>
              {loadingOrdinals ? (
                <div className="text-center py-12">
                      <div className="text-red-600 font-mono text-lg animate-pulse">Loading your ordinals...</div>
                </div>
              ) : userOrdinals.length === 0 ? (
                <div className="text-center py-12">
                      <div className="text-gray-400 font-mono text-lg mb-2">No ordinals found in your wallet</div>
                      <a
                        href="https://magiceden.us/ordinals/marketplace/the-damned"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-600 hover:text-red-500 font-mono underline"
                      >
                        Browse The Damned Collection →
                      </a>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {userOrdinals.map((token, index) => (
                    <div
                      key={token.id || token.inscriptionId || index}
                      className="bg-black/40 backdrop-blur-sm border border-red-600/50 rounded-lg overflow-hidden hover:border-red-600 hover:bg-black/60 transition-all group cursor-pointer"
                    >
                      <div className="relative aspect-square bg-black/80">
                        {(() => {
                          // Try multiple image sources based on Magic Eden API structure
                          const imageUrl = token.contentURI || token.image || token.thumbnail || token.meta?.image
                          return imageUrl ? (
                          <img
                              src={imageUrl}
                              alt={token.meta?.name || token.name || token.tokenId || `Ordinal ${index + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Crect fill='%23000'/%3E%3Ctext fill='%23ff0000' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-family='monospace'%3ENO IMAGE%3C/text%3E%3C/svg%3E"
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-red-600 font-mono text-sm">
                            NO IMAGE
                          </div>
                          )
                        })()}
                        {(() => {
                          const price = token.priceInfo?.price || token.price
                          return price && price > 0 ? (
                            <div className="absolute top-2 right-2 bg-red-600/90 text-white px-2 py-1 rounded text-xs font-bold font-mono">
                              ${Number(price).toLocaleString()}
                            </div>
                          ) : null
                        })()}
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="text-red-600 font-bold text-sm font-mono truncate">
                          {token.meta?.name || token.name || token.tokenId || `ID: ${token.id?.slice(-8) || token.inscriptionId?.slice(-8) || 'N/A'}`}
                        </div>
                        {(() => {
                          // Handle traits from meta or direct traits
                          const traits = token.meta?.traits || token.traits
                          if (traits && Array.isArray(traits) && traits.length > 0) {
                            return (
                          <div className="space-y-1">
                                {traits.slice(0, 3).map((trait: any, idx: number) => {
                                  const key = trait.trait_type || trait.key || `Trait ${idx}`
                                  const value = trait.value || 'N/A'
                                  return (
                                    <div key={idx} className="text-xs text-gray-400 font-mono">
                                      <span className="text-gray-500">{key}:</span> {value}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          } else if (traits && typeof traits === 'object' && !Array.isArray(traits)) {
                            return (
                              <div className="space-y-1">
                                {Object.entries(traits).slice(0, 3).map(([key, value]: [string, any]) => (
                              <div key={key} className="text-xs text-gray-400 font-mono">
                                <span className="text-gray-500">{key}:</span> {value?.value || value || 'N/A'}
                              </div>
                            ))}
                          </div>
                            )
                          }
                          return null
                        })()}
                        {token.inscriptionId && (
                          <div className="text-xs text-gray-500 font-mono truncate">
                            Inscription: {token.inscriptionId.slice(0, 12)}...
                          </div>
                        )}
                        <a
                          href={`https://magiceden.us/ordinals/item-details/${token.inscriptionId || token.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center mt-2 px-3 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded text-xs font-mono font-bold transition-all"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View on Magic Eden
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
                  )}
                </>
              )}

              {/* Purchase History Tab */}
              {myDamnedTab === 'purchases' && (
                <div>
                  {loadingHistory ? (
                    <div className="text-center py-12">
                      <div className="text-red-600 font-mono text-lg animate-pulse">Loading purchase history...</div>
                    </div>
                  ) : purchaseHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-gray-400 font-mono text-lg mb-2">No purchase history found</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {purchaseHistory.map((activity, index) => (
                        <div key={index} className="bg-black/40 rounded-lg p-4 border border-red-600/30">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <div className="text-red-600 font-mono font-bold text-sm">
                                Token: {activity.tokenId || activity.tokenInscriptionNumber || 'N/A'}
                              </div>
                              {activity.txValue && (
                                <div className="text-green-500 font-mono text-sm mt-1">
                                  Price: {satoshisToBTC(activity.txValue)} BTC
                                </div>
                              )}
                              <div className="text-gray-400 font-mono text-xs mt-1">
                                {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Unknown date'}
                              </div>
                            </div>
                            <a
                              href={`https://magiceden.us/ordinals/item-details/${activity.tokenId || activity.tokenInscriptionNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded text-xs font-mono font-bold transition-all"
                            >
                              View →
                            </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

              {/* List History Tab */}
              {myDamnedTab === 'lists' && (
                <div>
                  {loadingHistory ? (
                    <div className="text-center py-12">
                      <div className="text-red-600 font-mono text-lg animate-pulse">Loading list history...</div>
              </div>
                  ) : listHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-gray-400 font-mono text-lg mb-2">No list history found</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {listHistory.map((activity, index) => (
                        <div key={index} className="bg-black/40 rounded-lg p-4 border border-red-600/30">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                                  activity.kind === 'list' ? 'bg-green-600/80 text-white' : 'bg-red-600/80 text-white'
                                }`}>
                                  {activity.kind === 'list' ? 'LISTED' : 'DELISTED'}
                                </span>
                                <span className="text-red-600 font-mono font-bold text-sm">
                                  Token: {activity.tokenId || activity.tokenInscriptionNumber || 'N/A'}
                                                                    </span>
                                  </div>
                                  {activity.listedPrice && (
                                    <div className="text-yellow-500 font-mono text-sm mt-1">
                                      Listed at: {satoshisToBTC(activity.listedPrice)} BTC
            </div>
          )}
                                  <div className="text-gray-400 font-mono text-xs mt-1">
                                {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Unknown date'}
        </div>
      </div>
                            <a
                              href={`https://magiceden.us/ordinals/item-details/${activity.tokenId || activity.tokenInscriptionNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded text-xs font-mono font-bold transition-all"
                            >
                              View →
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sell History Tab */}
              {myDamnedTab === 'sells' && (
                <div>
                  {loadingHistory ? (
                    <div className="text-center py-12">
                      <div className="text-red-600 font-mono text-lg animate-pulse">Loading sell history...</div>
                    </div>
                  ) : sellHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-gray-400 font-mono text-lg mb-2">No sell history found</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sellHistory.map((activity, index) => (
                        <div key={index} className="bg-black/40 rounded-lg p-4 border border-red-600/30">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <div className="text-red-600 font-mono font-bold text-sm">
                                Token: {activity.tokenId || activity.tokenInscriptionNumber || 'N/A'}
                              </div>
                              {activity.txValue && (
                                <div className="text-green-500 font-mono text-sm mt-1">
                                  Sold for: {satoshisToBTC(activity.txValue)} BTC
                                </div>
      )}
                              {activity.newOwner && (
                                <div className="text-gray-400 font-mono text-xs mt-1">
                                  Buyer: {activity.newOwner.slice(0, 8)}...{activity.newOwner.slice(-6)}
    </div>
                              )}
                              <div className="text-gray-400 font-mono text-xs mt-1">
                                {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Unknown date'}
                              </div>
                            </div>
                            <a
                              href={`https://magiceden.us/ordinals/item-details/${activity.tokenId || activity.tokenInscriptionNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded text-xs font-mono font-bold transition-all"
                            >
                              View →
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeSection === 'my-damned' ? (
            <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-12 text-center">
              <div className="text-gray-400 font-mono text-lg mb-4">
                Connect your wallet to view your collection
              </div>
              <p className="text-gray-500 font-mono text-sm">
                Use the wallet connect button in the header to get started
              </p>
            </div>
          ) : null}

          {/* Leaderboard Section */}
          {activeSection === 'leaderboard' && (
            <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-red-600 mb-6 font-mono border-b border-red-600/30 pb-2">
                LEADERBOARD
              </h2>
              {chosenSide ? (
                <Leaderboard chosenSide={chosenSide} />
              ) : (
                <div className="text-center py-12">
                  <div className="text-yellow-500 font-mono text-lg mb-4">
                    ⚠️ You must choose a side to view the leaderboard
                  </div>
                  <div className="text-gray-400 font-mono text-sm">
                    Go to My Profile to choose your side (Good or Evil)
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Points History Section */}
          {activeSection === 'points-history' && (
            <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-red-600 mb-6 font-mono border-b border-red-600/30 pb-2">
                POINTS HISTORY
              </h2>
              {chosenSide ? (
                <PointsHistory walletAddress={address} chosenSide={chosenSide} />
              ) : (
                <div className="text-center py-12">
                  <div className="text-yellow-500 font-mono text-lg mb-4">
                    ⚠️ You must choose a side to view your karma history
                  </div>
                  <div className="text-gray-400 font-mono text-sm">
                    Go to My Profile to choose your side (Good or Evil)
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Morality Section */}
          {activeSection === 'morality' && (
            <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-red-600 mb-6 font-mono border-b border-red-600/30 pb-2">
                MORALITY TASKS
              </h2>
              {chosenSide ? (
                <>
                  <p className="text-gray-400 font-mono text-sm mb-6">
                    Complete tasks to earn {chosenSide === 'good' ? 'good' : 'bad'} karma. All tasks are tracked and verified.
                  </p>
                  <Morality walletAddress={address} chosenSide={chosenSide} />
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="text-yellow-500 font-mono text-lg mb-4">
                    ⚠️ You must choose a side to view tasks
                  </div>
                  <div className="text-gray-400 font-mono text-sm">
                    Go to My Profile to choose your side (Good or Evil)
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export default function DashboardPage() {
  return (
    <LaserEyesWrapper>
      <DashboardContent />
    </LaserEyesWrapper>
  )
}

