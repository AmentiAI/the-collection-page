'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import dynamicImport from 'next/dynamic'
import Image from 'next/image'
import { useWallet } from '@/lib/wallet/compatibility'
import { useToast } from '@/components/Toast'
import BloodCanvas from '@/components/BloodCanvas'
import Header from '@/components/Header'
import Filters from '@/components/Filters'
import Gallery from '@/components/Gallery'
import BackgroundMusic from '@/components/BackgroundMusic'
import Modal from '@/components/Modal'
import SplashScreen from '@/components/SplashScreen'
import { Ordinal, Trait } from '@/types'

const LaserEyesWrapper = dynamicImport(
  () => import('@/components/LaserEyesWrapper'),
  { ssr: false, loading: () => null },
)

function ChestCallout() {
  const [chestOpen, setChestOpen] = useState(false)
  const [chestTooltipVisible, setChestTooltipVisible] = useState(false)
  const [chestGrantStatus, setChestGrantStatus] = useState<'idle' | 'loading' | 'granted' | 'claimed' | 'error'>(
    'idle',
  )
  const chestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wallet = useWallet()
  const toast = useToast()

  useEffect(() => {
    return () => {
      if (chestTimerRef.current) {
        clearTimeout(chestTimerRef.current)
      }
    }
  }, [])

  const handleChestClick = async () => {
    if (chestTimerRef.current) {
      clearTimeout(chestTimerRef.current)
      chestTimerRef.current = null
    }

    if (chestOpen) {
      setChestOpen(false)
      setChestTooltipVisible(false)
      setChestGrantStatus('idle')
      return
    }

    if (!wallet.currentAddress) {
      toast.error('Connect your wallet to claim the chest reward.')
      return
    }

    setChestOpen(true)
    setChestTooltipVisible(false)
    chestTimerRef.current = setTimeout(() => {
      setChestTooltipVisible(true)
    }, 1000)

    if (chestGrantStatus === 'granted' || chestGrantStatus === 'claimed') {
      return
    }

    setChestGrantStatus('loading')
    try {
      const response = await fetch('/api/ascension/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet.currentAddress, eventKey: 'treasure_chest_initial' }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? 'Failed to grant ascension powder.')
      }

      if (payload.granted) {
        setChestGrantStatus('granted')
        toast.success('The chest reveals 20 ascension powder!')
      } else {
        setChestGrantStatus('claimed')
        toast.info('You have already claimed the treasure from this chest.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to grant ascension powder.'
      setChestGrantStatus('error')
      toast.error(message)
    }
  }

  return (
    <div className="relative z-10 mt-6 flex justify-center pb-12">
      <div className="relative">
        <button
          type="button"
          onClick={handleChestClick}
          className="group relative inline-flex items-center justify-center rounded-full border border-amber-500/40 bg-black/40 p-3 shadow-[0_0_25px_rgba(251,191,36,0.35)] transition hover:border-amber-300/60 hover:bg-black/60"
          aria-label={chestOpen ? 'Close the mysterious chest' : 'Open the mysterious chest'}
        >
          <Image
            src={chestOpen ? '/chest-open.png' : '/chest-closed.png'}
            alt="Damned treasure chest"
            width={140}
            height={120}
            className="h-auto w-36 select-none drop-shadow-[0_0_20px_rgba(251,191,36,0.35)]"
            priority={false}
          />
        </button>
        {chestTooltipVisible && (
          <div className="absolute -top-16 left-1/2 w-max -translate-x-1/2 rounded-xl border border-amber-400/60 bg-black/85 px-4 py-2 text-xs font-mono uppercase tracking-[0.35em] text-amber-200 shadow-[0_0_25px_rgba(251,191,36,0.4)]">
            You have found something!
          </div>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [filteredOrdinals, setFilteredOrdinals] = useState<Ordinal[]>([])
  const [filters, setFilters] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [shake, setShake] = useState(false)
  const [selectedOrdinal, setSelectedOrdinal] = useState<Ordinal | null>(null)
  const [showSplash, setShowSplash] = useState(true)
  const [startMusic, setStartMusic] = useState(false) // Will start after 2 seconds
  const [userInteracted, setUserInteracted] = useState(false)
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)
  const [musicVolume, setMusicVolume] = useState(30)
  const [isMusicMuted, setIsMusicMuted] = useState(false)
  

  const handleEnter = () => {
    setUserInteracted(true)
    setShowSplash(false)
  }

  const handleHolderVerified = (holder: boolean, address?: string) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }

  const handleVerifyingStart = () => {
    setIsVerifying(true)
  }

  useEffect(() => {
    // Start music after 2 seconds
    const musicTimer = setTimeout(() => {
      setStartMusic(true)
    }, 2000)

    return () => clearTimeout(musicTimer)
  }, [])

  useEffect(() => {
    const shakeInterval = setInterval(() => {
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }, 4000)

    return () => clearInterval(shakeInterval)
  }, [])

  useEffect(() => {
    fetch('/generated_ordinals.json')
      .then(res => res.json())
      .then(data => {
        setOrdinals(data)
        setFilteredOrdinals(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading data:', err)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    let filtered = [...ordinals]

    Object.keys(filters).forEach(category => {
      const traitNames = filters[category]
      if (traitNames.size > 0) {
        filtered = filtered.filter(ordinal => {
          const trait = ordinal.traits[category]?.name
          return trait && traitNames.has(trait)
        })
      }
    })

    setFilteredOrdinals(filtered)
  }, [filters, ordinals])

  const updateFilters = (category: string, traitName: string, checked: boolean) => {
    setFilters(prev => {
      const newFilters = { ...prev }
      if (!newFilters[category]) {
        newFilters[category] = new Set()
      }
      if (checked) {
        newFilters[category].add(traitName)
      } else {
        newFilters[category].delete(traitName)
        if (newFilters[category].size === 0) {
          delete newFilters[category]
        }
      }
      return newFilters
    })
  }

  const clearAllFilters = () => {
    setFilters({})
  }

  // Ensure we always render something
  if (!showSplash && ordinals.length === 0 && !loading) {
    // Initial load - show loading state
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[#ff6b6b] text-xl">Loading The Damned...</div>
      </div>
    )
  }

  return (
    <LaserEyesWrapper>
      <BackgroundMusic shouldPlay={startMusic} volume={musicVolume} isMuted={isMusicMuted} />
      {showSplash ? (
        <SplashScreen onEnter={handleEnter} />
      ) : (
        <>
          <BloodCanvas />
          <main className={`min-h-screen relative overflow-x-hidden ${shake ? 'shake' : ''}`}>
            <Header 
              isHolder={isHolder} 
              isVerifying={isVerifying}
              connected={connected}
              onHolderVerified={handleHolderVerified}
              onVerifyingStart={handleVerifyingStart}
              onConnectedChange={setConnected}
              musicVolume={musicVolume}
              onMusicVolumeChange={setMusicVolume}
              isMusicMuted={isMusicMuted}
              onMusicMutedChange={setIsMusicMuted}
            />
                        <div className="container mx-auto px-4 py-8 relative z-10 max-w-7xl">                                                                               
              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 sm:gap-6 lg:gap-8">                                                               
                <aside className="order-2 lg:order-1">
                  <Filters
                    ordinals={ordinals}
                    filters={filters}
                    onFilterChange={updateFilters}
                    onClearAll={clearAllFilters}
                  />
                </aside>
                <main className="order-1 lg:order-2">
                  <Gallery
                    ordinals={filteredOrdinals}
                    loading={loading}
                    onOrdinalClick={setSelectedOrdinal}
                  />
                </main>
              </div>
            </div>
            <ChestCallout />
          </main>
          {selectedOrdinal && (
            <Modal ordinal={selectedOrdinal} onClose={() => setSelectedOrdinal(null)} />
          )}
        </>
      )}
    </LaserEyesWrapper>
  )
}
