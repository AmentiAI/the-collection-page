'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamicImport from 'next/dynamic'
import BloodCanvas from '@/components/BloodCanvas'
import Header from '@/components/Header'
import BackgroundMusic from '@/components/BackgroundMusic'
import Leaderboard from '@/components/dashboard/Leaderboard'
import PointsHistory from '@/components/dashboard/PointsHistory'
import Morality from '@/components/dashboard/Morality'
import { useLaserEyes } from '@omnisat/lasereyes'

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

function DashboardContent() {
  const { connected, address } = useLaserEyes()
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
      
  // Helper function to convert satoshis to BTC
  const satoshisToBTC = (satoshis: number | string): string => {
    const sats = typeof satoshis === 'string' ? parseFloat(satoshis) : satoshis
    const btc = sats / 100000000
    return btc.toFixed(8).replace(/\.?0+$/, '') // Remove trailing zeros
  }

  // Fetch karma totals
  const fetchKarmaTotals = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return
    setLoadingKarma(true)
    try {
      const response = await fetch(`/api/profile?walletAddress=${encodeURIComponent(walletAddress)}`)
      const profile = await response.json()
      if (profile && !profile.error) {
        setTotalGoodKarma(profile.total_good_karma || 0)
        setTotalBadKarma(profile.total_bad_karma || 0)
      }
    } catch (error) {
      console.error('Error fetching karma totals:', error)
    } finally {
      setLoadingKarma(false)
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
      
      // Calculate karma based on ordinal ownership (+5 points per ordinal)
      // Purchase karma (+10 per ordinal) is awarded automatically when count increases are detected
      if (tokens.length > 0) {
        try {
          await fetch('/api/karma/calculate-ordinal-karma', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
          })
        } catch (error) {
          console.error('Error calculating ordinal karma:', error)
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
    } else {
      setUserOrdinals([])
      setDiscordLinked(false)
      setDiscordUserId(null)
      setTwitterLinked(false)
      setTwitterUserId(null)
      setTwitterUsername(null)
      setTotalGoodKarma(0)
      setTotalBadKarma(0)
    }
  }, [connected, address, fetchUserOrdinals, checkDiscordStatus, checkTwitterStatus, fetchKarmaTotals])

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
      alert('Please connect your wallet first')
      return
    }
    window.location.href = `/api/discord/auth?walletAddress=${encodeURIComponent(address)}`
  }

  // Handle Twitter auth
  const handleTwitterAuth = () => {
    if (!address) {
      alert('Please connect your wallet first')
      return
    }
    window.location.href = `/api/twitter/auth?walletAddress=${encodeURIComponent(address)}`
  }

  // Fetch activity history from Magic Eden
  const fetchActivityHistory = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return
    
    setLoadingHistory(true)
    try {
      const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
      
      // Fetch all activity types in parallel
      const [purchasesRes, listsRes, delistsRes, sellsRes] = await Promise.all([
        fetch(`/api/magic-eden/activities?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned&kind=buying_broadcasted&limit=100`),
        fetch(`/api/magic-eden/activities?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned&kind=list&limit=100`),
        fetch(`/api/magic-eden/activities?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned&kind=delist&limit=100`),
        fetch(`/api/magic-eden/activities?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned&kind=transfer&limit=100`)
      ])

      // Parse purchase history (buying_broadcasted)
      if (purchasesRes.ok) {
        const purchasesData = await purchasesRes.json()
        // Filter where user is the new owner (bought something)
        const purchases = (purchasesData.activities || []).filter((activity: any) => 
          activity.newOwner?.toLowerCase() === walletAddress.toLowerCase() &&
          activity.kind === 'buying_broadcasted'
        )
        // Sort by date (newest first)
        purchases.sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || 0).getTime()
          const dateB = new Date(b.createdAt || 0).getTime()
          return dateB - dateA
        })
        setPurchaseHistory(purchases)
      }

      // Parse list history (list and delist)
      let allLists: any[] = []
      if (listsRes.ok) {
        const listsData = await listsRes.json()
        const lists = (listsData.activities || []).filter((activity: any) => 
          activity.kind === 'list' &&
          activity.oldOwner?.toLowerCase() === walletAddress.toLowerCase()
        )
        allLists.push(...lists)
      }
      if (delistsRes.ok) {
        const delistsData = await delistsRes.json()
        const delists = (delistsData.activities || []).filter((activity: any) => 
          activity.kind === 'delist' &&
          activity.oldOwner?.toLowerCase() === walletAddress.toLowerCase()
        )
        allLists.push(...delists)
      }
      // Sort by date (newest first)
      allLists.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        return dateB - dateA
      })
      setListHistory(allLists)

      // Parse sell history (transfers where user was the old owner)
      if (sellsRes.ok) {
        const sellsData = await sellsRes.json()
        const sells = (sellsData.activities || []).filter((activity: any) => 
          activity.kind === 'transfer' &&
          activity.oldOwner?.toLowerCase() === walletAddress.toLowerCase() &&
          activity.newOwner?.toLowerCase() !== walletAddress.toLowerCase() &&
          activity.txValue && activity.txValue > 0 // Only actual sales with value
        )
        // Sort by date (newest first)
        sells.sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || 0).getTime()
          const dateB = new Date(b.createdAt || 0).getTime()
          return dateB - dateA
        })
        setSellHistory(sells)
      }
    } catch (error) {
      console.error('Error fetching activity history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  // Fetch activity history when wallet connects or when switching to activity tabs
  useEffect(() => {
    if (connected && address && activeSection === 'my-damned' && myDamnedTab !== 'collection') {
      fetchActivityHistory(address)
        }
  }, [connected, address, activeSection, myDamnedTab, fetchActivityHistory])


  // Calculate stats
  const totalOrdinals = userOrdinals.length
  const totalValue = userOrdinals.reduce((sum, token) => {
    const price = token.priceInfo?.price || token.price || 0
    return sum + Number(price)
  }, 0)

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
          showStakeButton={true}
        />

        <div className="container mx-auto px-4 py-8 relative z-10 max-w-7xl">
          {/* Compact Hellish Karma Scoreboard */}
          {connected && address && (
            <div className="mb-6 relative">
              {/* Scanline overlay effect */}
              <div className="absolute inset-0 pointer-events-none z-20 opacity-10" style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.05) 2px, rgba(255,0,0,0.05) 4px)'
              }} />

              {/* Compact scoreboard container */}
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
                  {/* Compact horizontal scoreboard with NET in center */}
                  <div className="grid grid-cols-3 gap-2 md:gap-4 items-center max-w-4xl mx-auto">
                    {/* Good Karma - Left */}
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-sm opacity-50 group-hover:opacity-75 blur-sm transition duration-300" style={{ boxShadow: '0 0 15px rgba(34, 197, 94, 0.5)' }} />
                      <div className="relative bg-black/95 border-2 border-green-500/80 rounded-sm px-3 py-2 md:px-4 md:py-2" style={{ 
                        boxShadow: 'inset 0 0 15px rgba(34, 197, 94, 0.15), 0 0 25px rgba(34, 197, 94, 0.4)'
                      }}>
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className="text-base md:text-lg" style={{ textShadow: '0 0 10px rgba(250, 204, 21, 0.8)', filter: 'drop-shadow(0 0 5px rgba(250, 204, 21, 0.6))' }}>✦</span>
                          <div>
                            <div className="text-green-400 text-[10px] font-mono uppercase tracking-widest font-bold">GOOD</div>
                            {loadingKarma ? (
                              <div className="text-green-400 font-mono text-xs animate-pulse">...</div>
                            ) : (
                              <div className="text-xl md:text-2xl font-black text-green-400 font-mono" style={{
                                textShadow: '0 0 15px rgba(34, 197, 94, 0.9), 0 0 30px rgba(34, 197, 94, 0.5), 0 1px 0 #000',
                                fontVariantNumeric: 'tabular-nums',
                                filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.7))'
                              }}>
                                {totalGoodKarma.toLocaleString()}
          </div>
                            )}
        </div>
                        </div>
          </div>
        </div>

                    {/* Net Karma - Center (where page divides) */}
                    <div className="relative group">
                      <div className={`absolute -inset-0.5 rounded-sm opacity-50 group-hover:opacity-70 blur-sm transition duration-300 ${
                        totalGoodKarma - totalBadKarma >= 0 ? 'bg-gradient-to-r from-yellow-500 to-green-500' : 'bg-gradient-to-r from-yellow-600 to-red-600'
                      }`} style={{ boxShadow: `0 0 20px ${totalGoodKarma - totalBadKarma >= 0 ? 'rgba(250, 204, 21, 0.6)' : 'rgba(220, 38, 38, 0.7)'}` }} />
                      <div className={`relative bg-black/95 border-2 ${totalGoodKarma - totalBadKarma >= 0 ? 'border-yellow-500/80' : 'border-orange-600/80'} rounded-sm px-3 py-2 md:px-4 md:py-2 text-center`} style={{ 
                        boxShadow: `inset 0 0 15px ${totalGoodKarma - totalBadKarma >= 0 ? 'rgba(250, 204, 21, 0.2)' : 'rgba(220, 38, 38, 0.25)'}, 0 0 25px ${totalGoodKarma - totalBadKarma >= 0 ? 'rgba(250, 204, 21, 0.5)' : 'rgba(220, 38, 38, 0.6)'}`
                      }}>
                        <div>
                          <div className={`text-[9px] md:text-[10px] font-mono uppercase tracking-wider font-bold ${totalGoodKarma - totalBadKarma >= 0 ? 'text-yellow-400' : 'text-orange-400'}`}>NET</div>
                          {loadingKarma ? (
                            <div className={`font-mono text-xs animate-pulse ${totalGoodKarma - totalBadKarma >= 0 ? 'text-green-400' : 'text-red-400'}`}>...</div>
                          ) : (
                            <div className={`text-2xl md:text-3xl font-black font-mono ${
                              totalGoodKarma - totalBadKarma >= 0 ? 'text-green-400' : 'text-red-500'
                            }`} style={{
                              textShadow: totalGoodKarma - totalBadKarma >= 0 
                                ? '0 0 20px rgba(34, 197, 94, 1), 0 0 40px rgba(34, 197, 94, 0.6), 0 1px 0 #000'
                                : '0 0 20px rgba(220, 38, 38, 1), 0 0 40px rgba(220, 38, 38, 0.7), 0 1px 0 #000',
                              fontVariantNumeric: 'tabular-nums',
                              filter: totalGoodKarma - totalBadKarma >= 0 
                                ? 'drop-shadow(0 0 10px rgba(34, 197, 94, 0.8))'
                                : 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.9))'
                            }}>
                              {totalGoodKarma - totalBadKarma >= 0 ? '+' : ''}{(totalGoodKarma - totalBadKarma).toLocaleString()}
          </div>
                          )}
        </div>
          </div>
        </div>

                    {/* Bad Karma - Right */}
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-red-700 rounded-sm opacity-50 group-hover:opacity-75 blur-sm transition duration-300" style={{ boxShadow: '0 0 15px rgba(220, 38, 38, 0.6)' }} />
                      <div className="relative bg-black/95 border-2 border-red-600/80 rounded-sm px-3 py-2 md:px-4 md:py-2" style={{ 
                        boxShadow: 'inset 0 0 15px rgba(220, 38, 38, 0.2), 0 0 25px rgba(220, 38, 38, 0.5)'
                      }}>
                        <div className="flex items-center gap-2 md:gap-3 justify-end">
                          <div className="text-right">
                            <div className="text-red-400 text-[10px] font-mono uppercase tracking-widest font-bold">BAD</div>
                            {loadingKarma ? (
                              <div className="text-red-400 font-mono text-xs animate-pulse">...</div>
                            ) : (
                              <div className="text-xl md:text-2xl font-black text-red-500 font-mono" style={{
                                textShadow: '0 0 15px rgba(220, 38, 38, 1), 0 0 30px rgba(220, 38, 38, 0.6), 0 1px 0 #000',
                                fontVariantNumeric: 'tabular-nums',
                                filter: 'drop-shadow(0 0 8px rgba(220, 38, 38, 0.8))'
                              }}>
                                {totalBadKarma.toLocaleString()}
          </div>
                            )}
        </div>
                          <span className="text-base md:text-lg" style={{ textShadow: '0 0 10px rgba(250, 204, 21, 0.8)', filter: 'drop-shadow(0 0 5px rgba(250, 204, 21, 0.6))' }}>⚡</span>
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
                      KARMA
                    </h2>
          </div>
        </div>
      </div>
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
              {connected && address ? (
                <div className="space-y-4">
                  <div className="bg-black/40 rounded-lg p-4 border border-red-600/30">
                    <div className="text-gray-400 text-sm font-mono uppercase mb-2">Wallet Address</div>
                    <div className="text-white font-mono text-sm break-all">{address}</div>
                  </div>
                  <div className="bg-black/40 rounded-lg p-4 border border-red-600/30">
                    <div className="text-gray-400 text-sm font-mono uppercase mb-2">Holder Status</div>
                    <div className={`font-mono font-bold ${isHolder ? 'text-green-500' : 'text-red-500'}`}>
                      {isHolder ? '✓ Verified Holder' : '✗ Not a Holder'}
                    </div>
            </div>
            
                  {/* Social Auth Section */}
                  <div className="bg-black/40 rounded-lg p-4 border border-red-600/30">
                    <div className="text-gray-400 text-sm font-mono uppercase mb-4">Social Accounts</div>
                    <div className="space-y-3">
                      {/* Discord Auth */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">💬</div>
                          <div>
                            <div className="text-white font-mono text-sm">Discord</div>
                            {discordLinked && discordUserId && (
                              <div className="text-gray-400 font-mono text-xs">
                                Linked: {discordUserId}
                  </div>
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
                      
                      {/* Twitter Auth */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">🐦</div>
                          <div>
                            <div className="text-white font-mono text-sm">Twitter</div>
                            {twitterLinked && twitterUsername && (
                              <div className="text-gray-400 font-mono text-xs">
                                @{twitterUsername}
                              </div>
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
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-400 font-mono text-lg mb-4">
                    Connect your wallet to view your profile
                        </div>
                      </div>
                    )}
            </div>
          )}

          {/* Stats Cards */}
          {connected && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
                <div className="text-gray-400 text-sm font-mono uppercase mb-2">Total Ordinals</div>
                <div className="text-3xl font-bold text-red-600 font-mono">{totalOrdinals}</div>
              </div>
              <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
                <div className="text-gray-400 text-sm font-mono uppercase mb-2">Collection Value</div>
                <div className="text-3xl font-bold text-red-600 font-mono">
                  {totalValue > 0 ? `$${totalValue.toLocaleString()}` : 'N/A'}
                </div>
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
              <Leaderboard />
            </div>
          )}

          {/* Points History Section */}
          {activeSection === 'points-history' && (
            <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-red-600 mb-6 font-mono border-b border-red-600/30 pb-2">
                POINTS HISTORY
              </h2>
              <PointsHistory walletAddress={address} />
            </div>
          )}

          {/* Morality Section */}
          {activeSection === 'morality' && (
            <div className="bg-black/60 backdrop-blur-sm border border-red-600/50 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-red-600 mb-6 font-mono border-b border-red-600/30 pb-2">
                MORALITY TASKS
              </h2>
              <p className="text-gray-400 font-mono text-sm mb-6">
                Complete tasks to earn good karma or receive bad karma. All tasks are tracked and verified.
              </p>
              <Morality walletAddress={address} />
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

