'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef, ReactNode } from 'react'
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
}

const StepCard = ({ step, title, description, children }: StepCardProps) => (
  <div className="bg-black/40 rounded-xl border border-red-600/40 p-5 md:p-6 shadow-lg space-y-3">
    <div className="flex items-start gap-4">
      <div className="w-12 h-12 rounded-full bg-red-700/60 border border-red-500 flex items-center justify-center font-mono text-lg font-bold text-white">
        {step}
      </div>
      <div className="flex-1">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
          <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-red-200">
            {title}
          </h3>
          {description && (
            <p className="text-xs md:text-sm text-gray-400 font-mono uppercase tracking-wide">
              {description}
            </p>
          )}
        </div>
        <div className="text-sm md:text-base text-gray-200 font-mono leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  </div>
)

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
            <DualityStatus walletAddress={address} profileSide={chosenSide} mode="compact" />
          </div>
        )}

        <div className="container mx-auto px-4 py-8 relative z-10 max-w-7xl">
          {/* Compact Hellish Karma Scoreboard */}
          {connected && address && (
            <div className="mb-6 relative">
              {/* Scanline overlay effect */}
              <div className="absolute inset-0 pointer-events-none z-20 opacity-10" style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.05) 2px, rgba(255,0,0,0.05) 4px)'
              }} />

              {/* Compact scoreboard container */}
              {chosenSide && (
              <div className="relative bg-gradient-to-br from-black via-red-950/30 to-black border-2 border-red-600/50 rounded-sm p-4 shadow-2xl overflow-hidden" style={{
                boxShadow: 'inset 0 0 30px rgba(220, 38, 38, 0.2), 0 0 50px rgba(220, 38, 38, 0.4)'
              }}>
                {/* Hellish grid background */}
                <div className="absolute inset-0 opacity-5" style={{
                  backgroundImage: `
                    linear-gradient(rgba(220,38,38,0.3) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(220,38,38,0.3) 1px, transparent 1px)
                  `,
                  backgroundSize: '30px 30px'
                }} />

                {/* Small corner brackets */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-red-600/70" style={{ boxShadow: '0 0 6px rgba(220, 38, 38, 0.6)' }} />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-red-600/70" style={{ boxShadow: '0 0 6px rgba(220, 38, 38, 0.6)' }} />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-red-600/70" style={{ boxShadow: '0 0 6px rgba(220, 38, 38, 0.6)' }} />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-red-600/70" style={{ boxShadow: '0 0 6px rgba(220, 38, 38, 0.6)' }} />
                
                {/* Hellish pulsing glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-red-900/15 via-orange-900/5 to-red-900/15 animate-pulse" />
                
                <div className="relative z-10">
                  {/* Compact horizontal scoreboard - show only chosen side karma */}
                  <div className="flex justify-center items-center max-w-4xl mx-auto">
                    <div className="relative group">
                      <div className={`absolute -inset-0.5 rounded-sm opacity-50 group-hover:opacity-70 blur-sm transition duration-300 ${
                        chosenSide === 'good' ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-red-600 to-red-700'
                      }`} style={{ boxShadow: chosenSide === 'good' ? '0 0 20px rgba(34, 197, 94, 0.6)' : '0 0 20px rgba(220, 38, 38, 0.7)' }} />
                      <div className={`relative bg-black/95 border-2 ${chosenSide === 'good' ? 'border-green-500/80' : 'border-red-600/80'} rounded-sm px-6 py-3 md:px-8 md:py-4 text-center`} style={{ 
                        boxShadow: chosenSide === 'good'
                          ? 'inset 0 0 15px rgba(34, 197, 94, 0.2), 0 0 25px rgba(34, 197, 94, 0.5)'
                          : 'inset 0 0 15px rgba(220, 38, 38, 0.2), 0 0 25px rgba(220, 38, 38, 0.6)'
                      }}>
                        <div>
                          <div className={`text-[10px] md:text-xs font-mono uppercase tracking-widest font-bold ${chosenSide === 'good' ? 'text-green-400' : 'text-red-400'}`}>
                            {chosenSide === 'good' ? 'GOOD KARMA' : 'EVIL KARMA'}
                          </div>
                          {loadingKarma ? (
                            <div className={`font-mono text-xs animate-pulse mt-2 ${chosenSide === 'good' ? 'text-green-400' : 'text-red-400'}`}>...</div>
                          ) : (
                            <div className={`text-3xl md:text-4xl font-black font-mono mt-2 ${
                              chosenSide === 'good' ? 'text-green-400' : 'text-red-500'
                            }`} style={{
                              textShadow: chosenSide === 'good'
                                ? '0 0 20px rgba(34, 197, 94, 1), 0 0 40px rgba(34, 197, 94, 0.6), 0 1px 0 #000'
                                : '0 0 20px rgba(220, 38, 38, 1), 0 0 40px rgba(220, 38, 38, 0.7), 0 1px 0 #000',
                              fontVariantNumeric: 'tabular-nums',
                              filter: chosenSide === 'good'
                                ? 'drop-shadow(0 0 10px rgba(34, 197, 94, 0.8))'
                                : 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.9))'
                            }}>
                              {(chosenSide === 'good' ? totalGoodKarma : totalBadKarma).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* KARMA Header above the scoreboard */}
                  <div className="text-center mt-3">
                    <h2 className="text-lg md:text-xl font-black text-red-600 font-mono uppercase tracking-wider" style={{
                      textShadow: '0 0 20px rgba(220, 38, 38, 0.8), 0 0 40px rgba(220, 38, 38, 0.5), 0 1px 0 #000',
                      filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.6))'
                    }}>
                      {chosenSide === 'good' ? 'GOOD KARMA' : 'EVIL KARMA'}
                    </h2>
                    </div>
                  </div>
                </div>
           
              )}
            </div>
          )}

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
                <StepCard
                  step={1}
                  title="Connect Your Wallet"
                  description="LaserEyes verification unlocks everything"
                >
                  {connected && address ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-gray-400 text-xs uppercase">Wallet Address</div>
                        <div className="text-white text-sm break-all">{address}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs uppercase">Holder Status</div>
                        <div className={`font-mono font-bold ${isHolder ? 'text-green-500' : 'text-red-500'}`}>
                          {isHolder ? '✓ Verified Holder' : '✗ Not a Holder'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">
                      Hit the connect button in the header to sync your wallet. Verification runs automatically once connected.
                    </div>
                  )}
                </StepCard>

                <StepCard
                  step={2}
                  title="Link Discord & Twitter"
                  description="Social auth proves you belong to the cult"
                >
                  {connected ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">💬</span>
                          <div>
                            <div className="text-white text-sm font-bold">Discord</div>
                            {discordLinked && discordUserId && (
                              <div className="text-gray-400 text-xs">Linked: {discordUserId}</div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={handleDiscordAuth}
                          disabled={loadingDiscord}
                          className={`px-4 py-2 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
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
                          <span className="text-2xl">🐦</span>
                          <div>
                            <div className="text-white text-sm font-bold">Twitter</div>
                            {twitterLinked && twitterUsername && (
                              <div className="text-gray-400 text-xs">@{twitterUsername}</div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={handleTwitterAuth}
                          disabled={loadingTwitter}
                          className={`px-4 py-2 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                            twitterLinked
                              ? 'bg-blue-600/80 border-blue-600 text-white cursor-default'
                              : 'bg-blue-600/80 border-blue-600 text-white hover:bg-blue-600 hover:border-blue-500'
                          } ${loadingTwitter ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {loadingTwitter ? 'Loading...' : twitterLinked ? '✓ Connected' : 'Connect Twitter'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Both accounts are required before you can complete Discord tasks or claim leaderboard spots.
                      </p>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">Connect your wallet first to unlock social authentication.</div>
                  )}
                </StepCard>

                <StepCard
                  step={3}
                  title="Choose Your Side"
                  description="Pick once, reset if you dare"
                >
                  {connected ? (
                    <div className="space-y-4">
                      {chosenSide === null ? (
                        <div className="space-y-3">
                          <div className="text-yellow-500 text-sm">⚠️ You must choose a side to access quests, Discord tasks, and Duality.</div>
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
                      ) : (
                        <div className="space-y-3">
                          <div className={`font-mono font-bold text-lg ${chosenSide === 'good' ? 'text-green-500' : 'text-red-500'}`}>
                            {chosenSide === 'good' ? '✓ You ride with the GOOD — all systems synced.' : '✗ You pledged to EVIL — all systems synced.'}
                          </div>
                          <button
                            onClick={() => setShowResetConfirm(true)}
                            disabled={loadingSide}
                            className="w-full px-4 py-2 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 bg-yellow-600/80 border-yellow-600 text-white hover:bg-yellow-600 hover:border-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loadingSide ? 'Resetting...' : 'Reset & Change Side'}
                          </button>
                          {showResetConfirm && (
                            <div className="bg-black/60 rounded-lg p-4 border border-yellow-600/50">
                              <div className="text-yellow-500 text-sm mb-3">
                                ⚠️ This will wipe all karma points and history. Are you sure?
                              </div>
                              <div className="flex flex-col md:flex-row gap-2">
                                <button
                                  onClick={() => handleResetKarma('good')}
                                  disabled={loadingSide}
                                  className="flex-1 px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase bg-green-600/80 border-green-600 text-white hover:bg-green-600 disabled:opacity-50"
                                >
                                  Choose Good
                                </button>
                                <button
                                  onClick={() => handleResetKarma('evil')}
                                  disabled={loadingSide}
                                  className="flex-1 px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase bg-red-600/80 border-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  Choose Evil
                                </button>
                                <button
                                  onClick={() => setShowResetConfirm(false)}
                                  className="px-4 py-2 rounded-lg font-mono font-bold text-xs uppercase bg-gray-600/80 border-gray-600 text-white hover:bg-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">Connect your wallet to lock in a side.</div>
                  )}
                </StepCard>

                {connected && chosenSide && (
                  <StepCard
                    step={4}
                    title="Discord Holder Tasks"
                    description="Complete these checkpoints to stay verified"
                  >
                    <div className="space-y-4">
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
                  >
                    <div className="space-y-4">
                      <Morality walletAddress={address} chosenSide={chosenSide} limit={6} />
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

                {connected && chosenSide && (
                  <StepCard
                    step={7}
                    title="Daily Check-In"
                    description="Tap in once every 24 hours for karma"
                  >
                    <div className="space-y-3">
                      {checkInStatus === null ? (
                        <div className="text-gray-500 text-sm">Loading check-in status...</div>
                      ) : checkInStatus.canCheckIn ? (
                        <div className="space-y-3">
                          <div className="text-green-500 text-sm">✓ Ready to check in!</div>
                          <button
                            onClick={() => handleDailyCheckIn(chosenSide)}
                            disabled={checkingIn}
                            className={`w-full px-4 py-3 rounded-lg font-mono font-bold text-sm uppercase transition-all border-2 ${
                              checkingIn
                                ? 'opacity-50 cursor-not-allowed'
                                : chosenSide === 'good'
                                  ? 'bg-green-600/80 border-green-600 text-white hover:bg-green-600 hover:border-green-500'
                                  : 'bg-red-600/80 border-red-600 text-white hover:bg-red-700 hover:border-red-500'
                            }`}
                          >
                            {checkingIn ? 'Checking in...' : chosenSide === 'good' ? '✓ Check in for Good (+5)' : '✗ Check in for Evil (-5)'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-red-500 text-sm">
                            ⏰ Cooldown: {checkInCountdown > 0 ? `${checkInCountdown} hour${checkInCountdown !== 1 ? 's' : ''} remaining` : 'Calculating...'}
                          </div>
                          {checkInStatus.nextCheckin && (
                            <div className="text-gray-400 text-xs">
                              Next check-in: {new Date(checkInStatus.nextCheckin).toLocaleString()}
                            </div>
                          )}
                          {checkInStatus.lastCheckin && (
                            <div className="text-gray-500 text-xs">
                              Last check-in: {new Date(checkInStatus.lastCheckin).toLocaleString()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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

