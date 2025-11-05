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
  const [activeSection, setActiveSection] = useState<'my-damned' | 'leaderboard' | 'points-history' | 'morality'>('my-damned')                                  

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
      }).catch(err => {
        console.error('Failed to create profile:', err)
      })
      
      fetchUserOrdinals(address)
    } else {
      setUserOrdinals([])
    }
  }, [connected, address, fetchUserOrdinals])


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
          {/* Dashboard Title */}
          <div className="mb-8 text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-2">
              <span className="bg-gradient-to-r from-red-600 via-orange-600 to-red-600 bg-clip-text text-transparent">
                TRADING DASHBOARD
              </span>
            </h1>
            <p className="text-[#ff6b6b] text-sm md:text-base font-mono uppercase tracking-wider">
              Manage Your Collection
            </p>
          </div>

          {/* Internal Navigation */}
          <div className="mb-8 flex flex-wrap gap-4 justify-center">
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
                MY COLLECTION
              </h2>
              
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

