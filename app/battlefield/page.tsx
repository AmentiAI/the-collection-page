'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Header from '@/components/Header'
import GlobalStartTimeLock from '@/components/GlobalStartTimeLock'

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

  // Create rain drops dynamically
  useEffect(() => {
    const rainOverlay = document.getElementById('rain-overlay')
    if (!rainOverlay) return

    // Clear existing drops
    rainOverlay.innerHTML = ''

    // Create rain drops - adjust count based on screen size for performance
    const dropCount = isMobile ? 30 : 60
    const drops: HTMLDivElement[] = []

    for (let i = 0; i < dropCount; i++) {
      const drop = document.createElement('div')
      drop.className = 'rain-drop'
      drop.style.left = `${Math.random() * 100}%`
      drop.style.animationDuration = `${0.5 + Math.random() * 0.5}s`
      drop.style.animationDelay = `${Math.random() * 2}s`
      drop.style.opacity = `${0.3 + Math.random() * 0.4}`
      rainOverlay.appendChild(drop)
      drops.push(drop)
    }

    return () => {
      // Cleanup on unmount
      drops.forEach(drop => drop.remove())
    }
  }, [isMobile])

  // Lightning flash effect using JavaScript for better control
  useEffect(() => {
    const lightningOverlay = document.getElementById('lightning-overlay')
    if (!lightningOverlay) return

    let timeoutId: NodeJS.Timeout

    const flashLightning = () => {
      // Random delay between 8-15 seconds for less frequent flashes
      const delay = 4000 + Math.random() * 11000
      
      timeoutId = setTimeout(() => {
        // First flash
        lightningOverlay.style.background = 'rgba(255, 255, 255, 0.9)'
        lightningOverlay.style.opacity = '1'
        
        setTimeout(() => {
          lightningOverlay.style.background = 'rgba(255, 255, 255, 0)'
          lightningOverlay.style.opacity = '0'
          
          // Second flash (quick)
          setTimeout(() => {
            lightningOverlay.style.background = 'rgba(255, 255, 255, 1)'
            lightningOverlay.style.opacity = '1'
            
            setTimeout(() => {
              lightningOverlay.style.background = 'rgba(255, 255, 255, 0)'
              lightningOverlay.style.opacity = '0'
              
              // Third flash (fade)
              setTimeout(() => {
                lightningOverlay.style.background = 'rgba(255, 255, 255, 0.6)'
                lightningOverlay.style.opacity = '1'
                
                setTimeout(() => {
                  lightningOverlay.style.background = 'rgba(255, 255, 255, 0)'
                  lightningOverlay.style.opacity = '0'
                  
                  // Schedule next flash
                  flashLightning()
                }, 50)
              }, 30)
            }, 30)
          }, 20)
        }, 50)
      }, delay)
    }

    // Start the lightning cycle
    flashLightning()

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      lightningOverlay.style.background = 'rgba(255, 255, 255, 0)'
      lightningOverlay.style.opacity = '0'
    }
  }, [])

  // Add demon image as a special landmark
  const demonLandmark: Landmark = {
    id: 'demon-left-1',
    spriteX: 0,
    spriteY: 0,
    spriteWidth: 0,
    spriteHeight: 0,
    mapX: 3510,
    mapY: 1017,
    type: 'demonic',
    name: 'Demon',
    imageUrl: '/demon-left-1.png',
  }
  // Add demon image as a special landmark
  const angelLandmark: Landmark = {
    id: 'angel-left-1',
    spriteX: 0,
    spriteY: 0,
    spriteWidth: 0,
    spriteHeight: 0,
    mapX: -310,
    mapY: 1017,
    type: 'angelic',
    name: 'Angel',
    imageUrl: '/angel-right-1.png',
  }
  // Combine API landmarks with special demon and angel landmarks (hide on mobile)
  const allLandmarks = isMobile 
    ? landmarks 
    : [...landmarks, demonLandmark, angelLandmark]

  return (
    <GlobalStartTimeLock>
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
        
        /* Rain effect - lightweight CSS animation */
        .rain-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 10;
          overflow: hidden;
        }
        
        .rain-drop {
          position: absolute;
          width: 2px;
          height: 20px;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.2));
          animation: rain-fall linear infinite;
        }
        
        @keyframes rain-fall {
          0% {
            transform: translateY(-100vh) translateX(0);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) translateX(20px);
            opacity: 0.3;
          }
        }
        
        /* Lightning flash effect */
        .lightning-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 5;
          background: rgba(255, 255, 255, 0);
          opacity: 0;
          transition: background 0.05s ease, opacity 0.05s ease;
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
          {/* Lightning flash overlay */}
          <div className="lightning-overlay" id="lightning-overlay" />
          
          {/* Rain overlay */}
          <div className="rain-overlay" id="rain-overlay" />
          
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
              <div>🔥 Demonic: {allLandmarks.filter(l => l.type === 'demonic').length}</div>
              <div>✨ Angelic: {allLandmarks.filter(l => l.type === 'angelic').length}</div>
              <div>📍 Total: {allLandmarks.length}</div>
            </div>
          </div>
        </div>
      </div>
      </>
    </GlobalStartTimeLock>
  )
}
