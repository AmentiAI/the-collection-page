'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useLaserEyes } from '@omnisat/lasereyes'
import Header from '@/components/Header'
import { AlertCircle } from 'lucide-react'

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
  const { connected, address } = useLaserEyes()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [landmarks, setLandmarks] = useState<Landmark[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [hasListed, setHasListed] = useState(false)
  const [checkingListings, setCheckingListings] = useState(false)

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

  // Update IP address when wallet is connected
  useEffect(() => {
    if (!connected || !address) {
      return
    }

    // Update IP address
    fetch('/api/update-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address }),
    }).catch((err) => {
      console.error('Error updating IP:', err)
    })
  }, [connected, address])

  // Check for listed ordinals
  useEffect(() => {
    if (!connected || !address) {
      setHasListed(false)
      return
    }

    setCheckingListings(true)
    fetch(`/api/magic-eden?ownerAddress=${encodeURIComponent(address)}&collectionSymbol=the-damned&fetchAll=true`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
    })
      .then(async (res) => {
        if (!res.ok) {
          return { tokens: [] }
        }
        return res.json()
      })
      .then((data) => {
        const tokens = Array.isArray(data.tokens) ? data.tokens : Array.isArray(data) ? data : []
        const hasAnyListed = tokens.some((token: any) => {
          const isListed = token?.listed === true
          const rawPrice = Number(
            token?.priceInfo?.price ?? token?.listedPrice ?? token?.listingPrice ?? token?.price ?? token?.listing?.price ?? 0,
          )
          return isListed || (Number.isFinite(rawPrice) && rawPrice > 0)
        })
        setHasListed(hasAnyListed)
      })
      .catch((err) => {
        console.error('Error checking listings:', err)
        setHasListed(false)
      })
      .finally(() => {
        setCheckingListings(false)
      })
  }, [connected, address])

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

  // Memoize style content to prevent re-rendering the style tag on every component update
  const battlefieldStyles = useMemo(() => `
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
  `, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: battlefieldStyles}} />
      <div className="h-screen bg-black text-white overflow-hidden flex flex-col">
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={connected}
          onHolderVerified={setIsHolder}
          onVerifyingStart={() => setIsVerifying(true)}
        onConnectedChange={() => {}}
          showMusicControls={true}
      />

        <div className="flex-1 map-container relative">
          {connected && hasListed && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
              <div className="rounded-2xl border-2 border-amber-500/70 bg-amber-950/30 p-8 text-center max-w-md mx-4">
                <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-amber-200 mb-2">
                  Listed Ordinals Detected
                </h2>
                <p className="text-gray-400 mb-4">
                  You must delist to continue playing.
                </p>
              </div>
            </div>
          )}
          {!hasListed && <LeafletTileMap landmarks={allLandmarks} />}
        </div>
      </div>
    </>
  )
}
