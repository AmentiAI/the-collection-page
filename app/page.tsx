'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import dynamicImport from 'next/dynamic'
import BloodCanvas from '@/components/BloodCanvas'
import Header from '@/components/Header'
import Filters from '@/components/Filters'
import Gallery from '@/components/Gallery'
import BackgroundMusic from '@/components/BackgroundMusic'
import Modal from '@/components/Modal'
import SplashScreen from '@/components/SplashScreen'
import TraitRarityTracker from '@/components/TraitRarityTracker'
import { Ordinal, Trait } from '@/types'

// Only load LaserEyes provider after page is mounted
const LaserEyesWrapper = dynamicImport(
  () => import('@/components/LaserEyesWrapper'),
  { 
    ssr: false,
    loading: () => null
  }
)

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
              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-4 sm:gap-6 lg:gap-8">                                                               
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
                <aside className="order-3 lg:order-3">
                  <TraitRarityTracker collectionSymbol="the-damned" />
                </aside>
              </div>
            </div>
          </main>
          {selectedOrdinal && (
            <Modal ordinal={selectedOrdinal} onClose={() => setSelectedOrdinal(null)} />
          )}
        </>
      )}
    </LaserEyesWrapper>
  )
}
