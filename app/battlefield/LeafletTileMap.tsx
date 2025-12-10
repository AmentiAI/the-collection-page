'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, ImageOverlay, useMap, useMapEvents, Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useRouter } from 'next/navigation'

const MAP_WIDTH = 4096
const MAP_HEIGHT = 2728

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const customCRS = L.CRS.Simple

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

// Convert map coordinates (0-2048) to Leaflet CRS.Simple coordinates
// Use coordinates directly - same as BattlefieldMap
// CRS.Simple uses [lat, lng] which is [y, x]
function mapToLatLng(mapX: number, mapY: number): [number, number] {
  // Use coordinates directly - no conversion needed
  return [mapY, mapX]
}

// Component to track mouse coordinates - uses pixel coordinates directly
// Throttled to improve performance during dragging
function MapCoordinates({ onCoordsChange }: { onCoordsChange: (coords: { x: number; y: number } | null) => void }) {
  const map = useMap()
  const lastUpdateRef = useRef<number>(0)
  const isDraggingRef = useRef<boolean>(false)
  const throttleDelay = 50 // Update coordinates every 50ms max
  
  useMapEvents({
    mousedown: () => {
      isDraggingRef.current = true
    },
    mouseup: () => {
      isDraggingRef.current = false
    },
    dragstart: () => {
      isDraggingRef.current = true
    },
    dragend: () => {
      isDraggingRef.current = false
    },
    mousemove: (e) => {
      // Skip coordinate updates during drag for better performance
      if (isDraggingRef.current) return
      
      const now = Date.now()
      if (now - lastUpdateRef.current < throttleDelay) return
      lastUpdateRef.current = now
      
      const container = map.getContainer()
      if (!container) return
      
      // Get the visible map bounds in CRS.Simple coordinates
      const bounds = map.getBounds()
      const sw = bounds.getSouthWest() // bottom-left: [high Y, low X]
      const ne = bounds.getNorthEast() // top-right: [low Y, high X]
      
      // In CRS.Simple: lat = Y, lng = X
      // Calculate visible map area in map pixel coordinates
      const visibleMapWidth = ne.lng - sw.lng
      const visibleMapHeight = sw.lat - ne.lat
      
      // Get mouse position relative to container (0 to container size)
      const containerX = e.containerPoint.x
      const containerY = e.containerPoint.y
      
      // Convert container position to map pixel coordinates
      // X: left to right (0 to MAP_WIDTH)
      const mapX = Math.round(sw.lng + (containerX / container.clientWidth) * visibleMapWidth)
      
      // Y: top to bottom (0 to MAP_HEIGHT)
      // In CRS.Simple: ne.lat is top (Y=0), sw.lat is bottom (Y=MAP_HEIGHT)
      // containerY=0 is top, containerY=height is bottom
      // So: mapY = ne.lat (top) + (containerY / height) * visibleHeight
      const mapY = Math.round(ne.lat + (containerY / container.clientHeight) * visibleMapHeight)
      
      // Clamp to valid pixel range
      const clampedX = Math.max(0, Math.min(MAP_WIDTH - 1, mapX))
      const clampedY = Math.max(0, Math.min(MAP_HEIGHT - 1, mapY))
      
      onCoordsChange({ x: clampedX, y: clampedY })
    },
    mouseout: () => {
      onCoordsChange(null)
    },
  })
  
  return null
}

// Landmark marker component
function LandmarkMarker({ landmark, isMobile }: { landmark: Landmark; isMobile?: boolean }) {
  const router = useRouter()
  const [lat, lng] = mapToLatLng(landmark.mapX, landmark.mapY)
  const [icon, setIcon] = useState<L.DivIcon | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const markerRef = useRef<L.Marker | null>(null)
  
  // Debug logging removed to reduce console noise
  
  // Calculate icon size based on mobile zoom level
  // At zoom -2 (mobile), we're zoomed out 4x, so icons should be 4x smaller
  // But make them 50% bigger for better visibility: 24 * 1.5 = 36
  const iconSize = isMobile ? 36 : 96 // 36px on mobile (50% bigger than proportional), 96px on desktop

  // Create icon with hover glow effect
  const createIcon = (hovered: boolean) => {
    const cursorStyle = landmark.url ? 'cursor: pointer;' : ''
    // No glow in initial creation - glow is added via filter on hover
    
    return L.divIcon({
      className: 'landmark-marker',
      html: `<div style="width: ${iconSize}px; height: ${iconSize}px; background: ${landmark.type === 'demonic' ? 'rgba(220, 38, 38, 0.8)' : 'rgba(6, 182, 212, 0.8)'}; border: 2px solid ${landmark.type === 'demonic' ? '#dc2626' : '#06b6d4'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: ${iconSize / 2}px; ${cursorStyle} transition: all 0.2s ease;">${landmark.name.charAt(0)}</div>`,
      iconSize: [iconSize, iconSize],
      iconAnchor: [iconSize / 2, iconSize / 2],
    })
  }

  useEffect(() => {
    const cursorStyle = landmark.url ? 'cursor: pointer;' : ''
    let img: HTMLImageElement | null = null
    let cancelled = false
    
    // If landmark has a standalone image URL, use it directly
    if (landmark.imageUrl) {
      const newIcon = L.divIcon({
        className: 'landmark-marker',
        html: `<img src="${landmark.imageUrl}" width="${iconSize}" height="${iconSize}" style="image-rendering: pixelated; ${cursorStyle} transition: all 0.2s ease;" />`,
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconSize / 2, iconSize / 2],
      })
      setIcon(newIcon)
      return () => {
        cancelled = true
      }
    }
    
    // Otherwise, use sprite sheet
    const canvas = document.createElement('canvas')
    canvas.width = iconSize
    canvas.height = iconSize
    const ctx = canvas.getContext('2d')
    
    if (ctx) {
      // Create fallback icon first (colored circle)
      const fallbackIcon = createIcon(false)
      setIcon(fallbackIcon)
      
      img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (cancelled) return
        try {
          ctx.clearRect(0, 0, iconSize, iconSize)
          ctx.drawImage(
            img!,
            landmark.spriteX,
            landmark.spriteY,
            landmark.spriteWidth,
            landmark.spriteHeight,
            0,
            0,
            iconSize,
            iconSize
          )
          
          // Convert canvas to data URL for the icon
          const dataUrl = canvas.toDataURL('image/png')
          
          // No glow in initial creation - glow is added via filter on hover
          
          const newIcon = L.divIcon({
            className: 'landmark-marker',
            html: `<img src="${dataUrl}" width="${iconSize}" height="${iconSize}" style="image-rendering: pixelated; ${cursorStyle} transition: all 0.2s ease;" />`,
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2],
          })
          setIcon(newIcon)
        } catch (err) {
          // Silently handle errors - fallback icon is already set
        }
      }
      img.onerror = () => {
        // Silently handle errors - fallback icon is already set
      }
      const spriteSource = landmark.spriteSource || 'landmarks.png'
      img.src = `/${spriteSource}`
    }
    
    // Cleanup function to prevent memory leaks
    return () => {
      cancelled = true
      if (img) {
        img.onload = null
        img.onerror = null
        img.src = ''
        img = null
      }
    }
  }, [landmark, isMobile, iconSize]) // Removed isHovered - hover is handled via CSS filters, not icon recreation
  
  // Always render marker - use fallback icon if custom icon hasn't loaded
  const displayIcon = icon || createIcon(false)

  const handleMarkerClick = (e: L.LeafletMouseEvent) => {
    if (landmark.url) {
      e.originalEvent.preventDefault()
      e.originalEvent.stopPropagation()
      e.originalEvent.stopImmediatePropagation()
      // Use Next.js router for client-side navigation
      router.push(landmark.url)
      return false
    }
  }

  const handleMouseOver = () => {
    setIsHovered(true)
    // Update icon with glow by modifying the DOM element directly
    // Use drop-shadow filter which respects alpha channel (transparent backgrounds)
    if (markerRef.current) {
      const element = markerRef.current.getElement()
      if (element) {
        const iconElement = element.querySelector('img, div') as HTMLElement
        if (iconElement) {
          // Clear any existing box-shadow
          iconElement.style.boxShadow = ''
          
          const glowColor = landmark.type === 'demonic' ? 'rgba(220, 38, 38, 0.9)' : 'rgba(6, 182, 212, 0.9)'
          const glowColor2 = landmark.type === 'demonic' ? 'rgba(220, 38, 38, 0.6)' : 'rgba(6, 182, 212, 0.6)'
          // drop-shadow follows the alpha channel, so it only glows around visible parts
          const dropShadow1 = `drop-shadow(0 0 8px ${glowColor})`
          const dropShadow2 = `drop-shadow(0 0 16px ${glowColor2})`
          const brightness = 'brightness(1.3)'
          iconElement.style.filter = `${dropShadow1} ${dropShadow2} ${brightness}`
          iconElement.style.transition = 'all 0.2s ease'
        }
      }
    }
  }

  const handleMouseOut = () => {
    setIsHovered(false)
    // Remove glow by modifying the DOM element directly
    if (markerRef.current) {
      const element = markerRef.current.getElement()
      if (element) {
        const iconElement = element.querySelector('img, div') as HTMLElement
        if (iconElement) {
          iconElement.style.filter = ''
        }
      }
    }
  }

  return (
    <Marker 
      ref={markerRef}
      position={[lat, lng]} 
      icon={displayIcon}
      key={`${landmark.id || landmark.mapX}-${landmark.mapY}`}
      eventHandlers={{
        click: handleMarkerClick,
        mouseover: handleMouseOver,
        mouseout: handleMouseOut,
      }}
      autoPan={false}
    >
      <Tooltip 
        permanent={isMobile || false}
        direction="top"
        offset={isMobile ? [0, -15] : [0, -50]}
        className="landmark-tooltip"
        interactive={false}
        opacity={1}
      >
        <div className={`font-bold text-sm ${landmark.type === 'demonic' ? 'text-red-400' : 'text-cyan-400'}`}>
          {landmark.name}
        </div>
      </Tooltip>
    </Marker>
  )
}

function MapInit({ isMobile }: { isMobile: boolean }) {
  const map = useMap()
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null
    let cancelled = false
    
    timeoutId = setTimeout(() => {
      if (cancelled) return
      try {
        map.invalidateSize()
        
        // Set zoom first based on mobile detection
        const targetZoom = isMobile ? -2 : 0
        map.setZoom(targetZoom, { animate: false })
        
        // Use same bounds format as editor: SW = [MAP_HEIGHT, 0], NE = [0, MAP_WIDTH]
        // This ensures the map shows exactly 0-4096 x 0-2728 range
        const sw = L.latLng(MAP_HEIGHT, 0) // bottom-left
        const ne = L.latLng(0, MAP_WIDTH)  // top-right
        const bounds = L.latLngBounds(sw, ne)
        map.fitBounds(bounds, { padding: [0, 0], animate: false, maxZoom: targetZoom })
      } catch (error) {
        // Silently handle initialization errors
      }
    }, 100)
    
    // Cleanup function to cancel timeout if component unmounts
    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
  }, [map, isMobile])
  
  return null
}

export default function LeafletTileMap({ 
  landmarks = [], 
  onCoordsChange 
}: { 
  landmarks?: Landmark[]
  onCoordsChange?: (coords: { x: number; y: number } | null) => void 
}) {
  // Initialize mobile detection immediately (not in useEffect)
  // Check both screen width and touch capability for better mobile detection
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      const isSmallScreen = window.innerWidth < 768
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      // Consider mobile if small screen OR touch device (covers tablets too)
      return isSmallScreen || (isTouchDevice && window.innerWidth < 1024)
    }
    return false
  })

  useEffect(() => {
    const checkMobile = () => {
      const isSmallScreen = window.innerWidth < 768
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      setIsMobile(isSmallScreen || (isTouchDevice && window.innerWidth < 1024))
    }
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Removed debug logging to reduce console noise
  
  const bounds: [[number, number], [number, number]] = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]]
  const initialZoom = isMobile ? -2 : 0 // Much less zoom on mobile
  
  return (
    <MapContainer
      center={[MAP_HEIGHT / 2, MAP_WIDTH / 2]}
      zoom={initialZoom}
      minZoom={isMobile ? -2 : 0}
      maxZoom={isMobile ? -2 : 0}
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      zoomSnap={0}
      zoomDelta={0}
      style={{ height: '100%', width: '100%', backgroundColor: '#000000', position: 'absolute', top: 0, left: 0 }}
      crs={customCRS}
      maxBounds={L.latLngBounds([0, 0], [MAP_HEIGHT, MAP_WIDTH])}
      maxBoundsViscosity={1.0}
      worldCopyJump={false}
      preferCanvas={true}
      fadeAnimation={false}
      zoomAnimation={false}
      markerZoomAnimation={false}
      whenReady={() => {
        // Map container ready
      }}
    >
      <MapInit isMobile={isMobile} />
      <ImageOverlay
        url="/content.jpg"
        bounds={bounds}
        opacity={1}
        interactive={false}
        eventHandlers={{
          load: () => {
            // Image overlay loaded
          },
          error: () => {
            // Silently handle image overlay errors
          }
        }}
      />
      {onCoordsChange && <MapCoordinates onCoordsChange={onCoordsChange} />}
      
      {/* Render landmarks */}
      {landmarks.map((landmark) => (
        <LandmarkMarker key={landmark.id || `${landmark.mapX}-${landmark.mapY}`} landmark={landmark} isMobile={isMobile} />
      ))}
    </MapContainer>
  )
}
