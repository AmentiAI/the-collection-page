'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import dynamicImport from 'next/dynamic'
import Image from 'next/image'
import BloodCanvas from '@/components/BloodCanvas'
import Header from '@/components/Header'
import Filters from '@/components/Filters'
import Gallery from '@/components/Gallery'
import Modal from '@/components/Modal'
import SplashScreen from '@/components/SplashScreen'
import YouTubeVideoPlayer from '@/components/YouTubeVideoPlayer'
import HordeKillsTicker from '@/components/HordeKillsTicker'
import { Ordinal, Trait } from '@/types'

// LaserEyesWrapper is already provided by app/layout.tsx, no need to wrap again

export default function Home() {
  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [filteredOrdinals, setFilteredOrdinals] = useState<Ordinal[]>([])
  const [filters, setFilters] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [shake, setShake] = useState(false)
  const [selectedOrdinal, setSelectedOrdinal] = useState<Ordinal | null>(null)
  const [showSplash, setShowSplash] = useState(false)
  const [userInteracted, setUserInteracted] = useState(false)
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  

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
    const shakeInterval = setInterval(() => {
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }, 4000)

    return () => clearInterval(shakeInterval)
  }, [])

  useEffect(() => {
    fetch('/collection_metadata.json')
      .then(res => res.json())
      .then(data => {
        // Transform slim metadata back to Ordinal format for compatibility
        const ordinalData = data.ordinals.map((item: any) => ({
          ...item,
          // Expand traits from slim format { category: "name" } to full format { category: { name: "name" } }
          traits: Object.fromEntries(
            Object.entries(item.traits).map(([category, name]) => [
              category,
              { name: name as string }
            ])
          )
        }))
        setOrdinals(ordinalData)
        setFilteredOrdinals(ordinalData)
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
    <>
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
              showMusicControls={!isVideoPlaying}
            />
            {/* YouTube Video Player with Custom Controls */}
            <div className="w-full relative z-10">
              <YouTubeVideoPlayer
                videoId="wWkwbofYung"
                onPlayingChange={setIsVideoPlaying}
              />
            </div>
            {/* Horde Kills Ticker */}
            <HordeKillsTicker />
            {/* Ordinal collection hidden - just showing video */}
            {/* <div className="container mx-auto px-4 py-8 relative z-10 max-w-7xl">
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
            </div> */}
          </main>
          {selectedOrdinal && (
            <Modal ordinal={selectedOrdinal} onClose={() => setSelectedOrdinal(null)} />
          )}
        </>
      )}
    </>
  )
}
