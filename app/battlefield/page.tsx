'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Header from '@/components/Header'

// Leaflet map with landmarks
const LeafletTileMap = dynamic(() => import('./LeafletTileMap'), { ssr: false })

interface Landmark {
  id?: string
  spriteX: number
  spriteY: number
  spriteWidth: number
  spriteHeight: number
  mapX: number
  mapY: number
  type: 'demonic' | 'angelic'
  name: string
  url?: string
  imageUrl?: string // Optional standalone image URL (instead of sprite sheet)
  spriteSource?: string // Which sprite sheet image to use (landmarks.png or landmarks2.png)
}

export default function BattlefieldPage() {
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [landmarks, setLandmarks] = useState<Landmark[]>([])
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      if (typeof window !== 'undefined') {
        const isSmallScreen = window.innerWidth < 768
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
        setIsMobile(isSmallScreen || (isTouchDevice && window.innerWidth < 1024))
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load landmarks from API
  useEffect(() => {
    fetch('/api/landmarks')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.landmarks) {
          setLandmarks(data.landmarks)
        }
      })
      .catch(err => {
        console.error('Error loading landmarks:', err)
        setLandmarks([])
      })
  }, [])

  // Memoize special landmarks to prevent recreation on every render
  const demonLandmark = useMemo<Landmark>(() => ({
    id: 'demon-left-1',
    spriteX: 0,
    spriteY: 0,
    spriteWidth: 0,
    spriteHeight: 0,
    mapX: 3510,
    mapY: 1017,
    type: 'demonic' as const,
    name: 'Demon',
    imageUrl: '/demon-left-1.png',
  }), [])

  const angelLandmark = useMemo<Landmark>(() => ({
    id: 'angel-left-1',
    spriteX: 0,
    spriteY: 0,
    spriteWidth: 0,
    spriteHeight: 0,
    mapX: -310,
    mapY: 1017,
    type: 'angelic' as const,
    name: 'Angel',
    imageUrl: '/angel-right-1.png',
  }), [])

  // Memoize combined landmarks array
  const allLandmarks = useMemo(() => {
    return isMobile 
      ? landmarks 
      : [...landmarks, demonLandmark, angelLandmark]
  }, [landmarks, isMobile, demonLandmark, angelLandmark])

  // Memoize landmark counts to avoid filtering on every render
  const landmarkCounts = useMemo(() => {
    const demonic = allLandmarks.filter(l => l.type === 'demonic').length
    const angelic = allLandmarks.filter(l => l.type === 'angelic').length
    return { demonic, angelic, total: allLandmarks.length }
  }, [allLandmarks])

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .map-container .leaflet-container {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          z-index: 1 !important;
        }
        .map-container {
          position: relative !important;
          overflow: hidden !important;
        }
        .landmark-tooltip {
          background: rgba(0, 0, 0, 0.9) !important;
          border: 2px solid rgba(255, 255, 255, 0.3) !important;
          border-radius: 4px !important;
          padding: 4px 8px !important;
          font-weight: bold !important;
          pointer-events: none !important;
        }
        .landmark-tooltip .leaflet-tooltip-arrow {
          border-top-color: rgba(255, 255, 255, 0.3) !important;
        }
        /* Hide default Leaflet popup icons */
        .leaflet-popup-content-wrapper {
          display: none !important;
        }
        .leaflet-popup-tip {
          display: none !important;
        }
        /* Prevent any default popup behavior */
        .leaflet-marker-icon[class*="popup"] {
          display: none !important;
        }
      `}} />
      <div className="h-screen bg-black text-white overflow-hidden flex flex-col">
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={false}
          onHolderVerified={setIsHolder}
          onVerifyingStart={() => setIsVerifying(true)}
        onConnectedChange={() => {}}
          showMusicControls={true}
      />

        <div className="flex-1 map-container relative">
          <LeafletTileMap landmarks={allLandmarks} onCoordsChange={setMouseCoords} />

          {/* Coordinate display overlay */}
            {mouseCoords && (
            <div className="absolute bottom-2 left-2 md:bottom-4 md:left-4 bg-black/80 border border-green-500/50 px-2 py-1.5 md:px-4 md:py-3 rounded z-[1000]">
              <div className="text-xs md:text-sm font-mono text-green-400">
                <div>X: {mouseCoords.x}, Y: {mouseCoords.y}</div>
              </div>
            </div>
          )}
          
          {/* Landmarks count */}
          <div className="absolute top-2 right-2 md:top-4 md:right-4 bg-black/80 border border-green-500/50 px-2 py-1.5 md:px-4 md:py-3 rounded z-[1000]">
            <div className="text-xs md:text-sm font-mono text-green-400">
              <div>🔥 Demonic: {landmarkCounts.demonic}</div>
              <div>✨ Angelic: {landmarkCounts.angelic}</div>
              <div>📍 Total: {landmarkCounts.total}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
