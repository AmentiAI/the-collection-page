'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MAP_SIZE = 2048
const TILE_SIZE = 256
const MIN_ZOOM = 0
const MAX_ZOOM = 4

// Fix for default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

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
}

// Create custom CRS for our 2048x2048 map
// CRS.Simple uses a simple coordinate system where:
// - (0, 0) is top-left
// - Y increases downward (south)
// - X increases rightward (east)
// - Coordinates are in [lat, lng] format where lat=Y, lng=X
const customCRS = L.CRS.Simple

// Convert map coordinates (0-2048) to Leaflet CRS.Simple coordinates
// CRS.Simple: (0,0) is top-left, positive x goes right, positive y goes DOWN (like screen coords)
// Map coordinates: (0,0) is top-left, (2048,2048) is bottom-right
// So we can use coordinates directly!
function mapToLatLng(mapX: number, mapY: number): [number, number] {
  // CRS.Simple uses the same coordinate system as our map
  // Leaflet uses [lat, lng] which is [y, x] in CRS.Simple
  return [mapY, mapX]
}

// Convert Leaflet CRS.Simple coordinates back to map coordinates (0-2048)
// This is the exact inverse of mapToLatLng
function latLngToMap(lat: number, lng: number): [number, number] {
  // mapToLatLng returns [mapY, mapX], so lat = mapY, lng = mapX
  const mapX = Math.round(lng)
  const mapY = Math.round(lat)
  // Clamp to valid range
  const clampedX = Math.max(0, Math.min(MAP_SIZE - 1, mapX))
  const clampedY = Math.max(0, Math.min(MAP_SIZE - 1, mapY))
  return [clampedX, clampedY]
}

// Custom tile layer component with comprehensive logging
function CustomTileLayer() {
  const map = useMap()
  const tileRequests = useRef<Map<string, { start: number; status?: string }>>(new Map())
  
  useEffect(() => {
    console.log('🔵 ========== CustomTileLayer MOUNTED ==========')
    console.log('🔵 Map center:', map.getCenter())
    console.log('🔵 Map zoom:', map.getZoom())
    console.log('🔵 Map bounds:', map.getBounds())
    console.log('🔵 Map container size:', map.getContainer()?.clientWidth, 'x', map.getContainer()?.clientHeight)
    console.log('🔵 Map CRS:', map.options.crs)
    console.log('🔵 Tile URL template: /api/map/tiles/{z}/{x}/{y}')
    
    // Intercept fetch requests to log API calls
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const url = args[0] as string
      if (url.includes('/api/map/tiles/')) {
        const match = url.match(/\/api\/map\/tiles\/(\d+)\/(\d+)\/(\d+)/)
        if (match) {
          const [, z, x, y] = match
          const tileKey = `${z}/${x}/${y}`
          console.log(`🌐 FETCH REQUEST: ${url}`)
          console.log(`🌐 Tile coordinates: z=${z}, x=${x}, y=${y}`)
          tileRequests.current.set(tileKey, { start: Date.now() })
        }
      }
      
      const response = await originalFetch(...args)
      
      if (url.includes('/api/map/tiles/')) {
        const match = url.match(/\/api\/map\/tiles\/(\d+)\/(\d+)\/(\d+)/)
        if (match) {
          const [, z, x, y] = match
          const tileKey = `${z}/${x}/${y}`
          const duration = Date.now() - (tileRequests.current.get(tileKey)?.start || Date.now())
          const status = response.status
          const contentType = response.headers.get('content-type')
          const contentLength = response.headers.get('content-length')
          
          console.log(`🌐 FETCH RESPONSE: ${url}`)
          console.log(`🌐 Status: ${status} ${status === 200 ? '✅' : '❌'}`)
          console.log(`🌐 Content-Type: ${contentType}`)
          console.log(`🌐 Content-Length: ${contentLength} bytes`)
          console.log(`🌐 Duration: ${duration}ms`)
          
          if (status !== 200) {
            const errorText = await response.clone().text().catch(() => 'Could not read error')
            console.error(`❌ ERROR RESPONSE:`, errorText)
          }
          
          tileRequests.current.set(tileKey, { 
            start: tileRequests.current.get(tileKey)?.start || Date.now(),
            status: status.toString()
          })
        }
      }
      
      return response
    }
    
    return () => {
      console.log('🔵 CustomTileLayer unmounted')
      window.fetch = originalFetch
    }
  }, [map])
  
  return (
    <TileLayer
      url="/api/map/tiles/{z}/{x}/{y}"
      tileSize={TILE_SIZE}
      noWrap={true}
      updateWhenZooming={true}
      updateWhenIdle={true}
      maxZoom={MAX_ZOOM}
      minZoom={MIN_ZOOM}
      bounds={[[0, 0], [MAP_SIZE, MAP_SIZE]] as any}
      errorTileUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      eventHandlers={{
        loading: () => {
          console.log('🟡 TileLayer loading event - tiles are loading')
        },
        load: () => {
          console.log('✅ TileLayer load event - all tiles loaded')
          console.log('✅ Total tile requests:', tileRequests.current.size)
        },
        tileloadstart: (e: any) => {
          const coords = e.coords
          const url = `/api/map/tiles/${coords.z}/${coords.x}/${coords.y}`
          console.log(`🟡 TILE LOAD START: z=${coords.z}, x=${coords.x}, y=${coords.y}`)
          console.log(`🟡 Full URL: ${window.location.origin}${url}`)
        },
        tileload: (e: any) => {
          const coords = e.coords
          const tile = e.tile
          console.log(`✅ TILE LOAD SUCCESS: z=${coords.z}, x=${coords.x}, y=${coords.y}`)
          if (tile instanceof HTMLImageElement) {
            console.log(`✅ Tile image dimensions: ${tile.width}x${tile.height}`)
            console.log(`✅ Tile image src: ${tile.src.substring(0, 100)}...`)
          }
        },
        tileerror: (e: any) => {
          const coords = e.coords
          const url = `/api/map/tiles/${coords.z}/${coords.x}/${coords.y}`
          console.error(`❌ TILE LOAD ERROR: z=${coords.z}, x=${coords.x}, y=${coords.y}`)
          console.error(`❌ Full URL: ${window.location.origin}${url}`)
          console.error(`❌ Error details:`, e.error || e)
          if (e.tile instanceof HTMLImageElement) {
            console.error(`❌ Failed tile src: ${e.tile.src}`)
          }
        }
      }}
    />
  )
}

// Component to log map state and sync zoom
function MapZoomSync({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap()
  
  useEffect(() => {
    console.log('🟡 MapZoomSync mounted - map is ready!')
    console.log('🟡 Map instance:', map)
    console.log('🟡 Map center:', map.getCenter())
    console.log('🟡 Map zoom:', map.getZoom())
    console.log('🟡 Map bounds:', map.getBounds())
    console.log('🟡 Map container:', map.getContainer())
    console.log('🟡 Map container size:', map.getContainer()?.clientWidth, 'x', map.getContainer()?.clientHeight)
    console.log('🟡 Map CRS:', map.options.crs)
    
    // Check for tile layers
    map.eachLayer((layer: any) => {
      console.log('🟡 Found layer:', layer.constructor.name, layer)
      if (layer instanceof L.TileLayer) {
        console.log('🟡 Found TileLayer!')
      }
    })
  }, [map])
  
  useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom())
    },
  })
  
  return null
}

// Component to track mouse coordinates and display them
function MapCoordinates({ onCoordsChange }: { onCoordsChange: (coords: { x: number; y: number } | null) => void }) {
  const map = useMap()
  
  useMapEvents({
    mousemove: (e) => {
      const { lat, lng } = e.latlng
      const mapCenter = map.getCenter()
      const mapBounds = map.getBounds()
      
      // Debug: log center and bounds occasionally
      if (Math.random() < 0.005) {
        console.log('Map center:', mapCenter.lat, mapCenter.lng)
        console.log('Map bounds:', mapBounds.getSouthWest(), mapBounds.getNorthEast())
        console.log('Mouse lat/lng:', lat, lng)
      }
      
      // In CRS.Simple, lat is Y and lng is X
      // Direct conversion since CRS.Simple uses same coordinate system
      const mapX = Math.round(lng)
      const mapY = Math.round(lat)
      // Clamp to valid range
      const clampedX = Math.max(0, Math.min(MAP_SIZE - 1, mapX))
      const clampedY = Math.max(0, Math.min(MAP_SIZE - 1, mapY))
      onCoordsChange({ x: clampedX, y: clampedY })
    },
    mouseout: () => {
      onCoordsChange(null)
    },
  })
  
  return null
}

// Component to handle reset and initial fit
function MapReset({ resetKey }: { resetKey: number }) {
  const map = useMap()
  const hasInitialized = useRef(false)
  
  useEffect(() => {
    console.log('🟠 MapReset effect running, resetKey:', resetKey, 'hasInitialized:', hasInitialized.current)
    
    const initializeMap = () => {
      console.log('🟠 initializeMap called')
      const container = map.getContainer()
      if (!container) {
        console.error('❌ Map container not found')
        return
      }
      
      console.log('🟠 Map container found:', container)
      console.log('🟠 Container size before invalidateSize:', container.clientWidth, 'x', container.clientHeight)
      
      // Invalidate size first to ensure accurate measurements
      map.invalidateSize()
      
      // Wait a bit for size to be recalculated
      setTimeout(() => {
        const containerWidth = container.clientWidth || 800
        const containerHeight = container.clientHeight || 600
        console.log('🟠 Container size after invalidateSize:', containerWidth, 'x', containerHeight)
        
        // Calculate the scale factor needed to fit the entire 2048x2048 map
        // We need to fit a square map into a potentially rectangular container
        // The scale should be based on the smaller dimension to ensure the entire map fits
        const scaleX = containerWidth / MAP_SIZE
        const scaleY = containerHeight / MAP_SIZE
        const scale = Math.min(scaleX, scaleY) // Use the smaller scale to ensure both dimensions fit
        
        // In CRS.Simple, zoom levels work as follows:
        // - At zoom 0, 1 map unit = 1 pixel (1:1)
        // - At zoom 1, 1 map unit = 2 pixels (zoomed in 2x, shows half the area)
        // - At zoom 2, 1 map unit = 4 pixels (zoomed in 4x, shows quarter the area)
        // So to show the entire map, we want zoom 0 if the container is >= 2048x2048
        // If the container is smaller, we need to "zoom out" which isn't possible in CRS.Simple
        // Instead, we need to use a custom transformation or accept that we can't show the full map
        
        // Actually, wait - I think I misunderstood. Let me check the Leaflet docs approach.
        // In CRS.Simple, the map coordinates are in pixels, and zoom 0 is the base level.
        // The issue is that if the container is smaller than the map, we can't show the entire map at 1:1
        
        // In CRS.Simple, we need to manually calculate the zoom level
        // because fitBounds can have issues with aspect ratios
        // Calculate the zoom level needed to show the entire map
        
        // In CRS.Simple: at zoom 0, 1 unit = 1 pixel
        // To fit 2048x2048 map in container, we need to scale it down
        // The scale factor is: min(containerWidth, containerHeight) / MAP_SIZE
        // But CRS.Simple doesn't support negative zoom, so we need zoom 0
        // and accept that if container is smaller, we can't show the full map
        
        // Simple approach: set view to center at zoom 0
        // In CRS.Simple, zoom 0 means 1:1 pixel mapping
        // If container is smaller than 2048x2048, we'll only see part of the map
        // but at least the map will be visible
        try {
          // Ensure map is ready
          if (!map || !map.getCenter) {
            console.error('❌ Map not ready')
            return
          }
          
          console.log('🟠 Setting map view to center:', MAP_SIZE / 2, MAP_SIZE / 2, 'zoom:', MIN_ZOOM)
          
          // Set view to center of map at minimum zoom
          map.setView([MAP_SIZE / 2, MAP_SIZE / 2], MIN_ZOOM, { animate: false })
          
          console.log('🟠 Map view set. Current center:', map.getCenter())
          console.log('🟠 Map zoom:', map.getZoom())
          console.log('🟠 Map bounds:', map.getBounds())
          
          // Wait a moment, then try to fit bounds if the map is ready
          setTimeout(() => {
            try {
              console.log('🟠 Attempting fitBounds...')
              // In CRS.Simple: coordinates are [y, x] where (0,0) is top-left
              // For bounds: southwest is bottom-left (high Y, low X), northeast is top-right (low Y, high X)
              // But wait - in CRS.Simple, "south" means higher Y values (down), "north" means lower Y values (up)
              // So: SW = [MAP_SIZE, 0] (bottom-left), NE = [0, MAP_SIZE] (top-right)
              // However, Leaflet's latLngBounds expects [minLat, minLng] to [maxLat, maxLng]
              // In CRS.Simple, minLat = 0 (top), maxLat = MAP_SIZE (bottom)
              // So we need: SW = [MAP_SIZE, 0], NE = [0, MAP_SIZE]
              const sw = L.latLng(MAP_SIZE, 0) // bottom-left: high Y (south), low X (west)
              const ne = L.latLng(0, MAP_SIZE)  // top-right: low Y (north), high X (east)
              const bounds = L.latLngBounds(sw, ne)
              
              console.log('🟠 Bounds SW (should be bottom-left):', sw.lat, sw.lng)
              console.log('🟠 Bounds NE (should be top-right):', ne.lat, ne.lng)
              
              console.log('🟠 Bounds created:', bounds)
              console.log('🟠 Bounds valid:', bounds.isValid())
              
              if (bounds && bounds.isValid && bounds.isValid()) {
                map.fitBounds(bounds, {
                  padding: [0, 0],
                  animate: false,
                  maxZoom: MAX_ZOOM
                })
                console.log('🟠 fitBounds called')
              } else {
                console.warn('🟠 Bounds invalid, skipping fitBounds')
              }
            } catch (fitError) {
              console.warn('🟠 fitBounds failed (this is okay):', fitError)
              // Map is already set to center, so this is fine
            }
          }, 100)
        } catch (error) {
          console.error('❌ Error initializing map view:', error)
        }
        
        // Verify after initialization
        setTimeout(() => {
          const center = map.getCenter()
          const bounds = map.getBounds()
          const sw = bounds.getSouthWest()
          const ne = bounds.getNorthEast()
          console.log('Map initialized. Center:', center.lat.toFixed(2), center.lng.toFixed(2), 'Expected: 1024, 1024')
          console.log('Map bounds SW:', sw.lat.toFixed(2), sw.lng.toFixed(2), 'Expected: 0, 0')
          console.log('Map bounds NE:', ne.lat.toFixed(2), ne.lng.toFixed(2), 'Expected: 2048, 2048')
          console.log('Visible area:', (ne.lng - sw.lng).toFixed(2), 'x', (ne.lat - sw.lat).toFixed(2))
          console.log('Map zoom:', map.getZoom())
          console.log('Container size:', containerWidth, containerHeight)
        }, 150)
      }, 50)
    }
    
    if (!hasInitialized.current) {
      hasInitialized.current = true
      // Wait for map container to be ready
      setTimeout(initializeMap, 200)
    } else if (resetKey > 0) {
      // Reset: recalculate zoom to fit entire map
      setTimeout(initializeMap, 50)
    }
  }, [resetKey, map])
  
  return null
}

// Landmark marker component
function LandmarkMarker({ landmark }: { landmark: Landmark }) {
  const [lat, lng] = mapToLatLng(landmark.mapX, landmark.mapY)
  const [icon, setIcon] = useState<L.DivIcon | null>(null)
  
  // Create icon with canvas
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 48
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    
    if (ctx) {
      // Create fallback icon first (colored circle)
      const fallbackIcon = L.divIcon({
        className: 'landmark-marker',
        html: `<div style="width: 48px; height: 48px; background: ${landmark.type === 'demonic' ? 'rgba(220, 38, 38, 0.8)' : 'rgba(6, 182, 212, 0.8)'}; border: 2px solid ${landmark.type === 'demonic' ? '#dc2626' : '#06b6d4'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">${landmark.name.charAt(0)}</div>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      })
      setIcon(fallbackIcon)
      
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          ctx.clearRect(0, 0, 48, 48)
          ctx.drawImage(
            img,
            landmark.spriteX,
            landmark.spriteY,
            landmark.spriteWidth,
            landmark.spriteHeight,
            0,
            0,
            48,
            48
          )
          
          // Create icon with drawn canvas
          const newIcon = L.divIcon({
            className: 'landmark-marker',
            html: canvas.outerHTML,
            iconSize: [48, 48],
            iconAnchor: [24, 24],
          })
          setIcon(newIcon)
        } catch (err) {
          console.error('Error drawing landmark sprite:', err)
        }
      }
      img.onerror = () => {
        console.error('Failed to load landmark sprite for', landmark.name)
      }
      img.src = '/landmarks.png'
    }
  }, [landmark])
  
  // Debug logging
  useEffect(() => {
    console.log(`Landmark ${landmark.name}: map(${landmark.mapX}, ${landmark.mapY}) -> leaflet([${lat.toFixed(2)}, ${lng.toFixed(2)}])`)
  }, [landmark, lat, lng])
  
  if (!icon) {
    return null
  }
  
  return (
    <Marker 
      position={[lat, lng]} 
      icon={icon}
    >
      <Popup>
        <div className="text-sm font-mono">
          <div className={`font-bold ${landmark.type === 'demonic' ? 'text-red-400' : 'text-cyan-400'}`}>
            {landmark.name}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Map Coordinates: X: {landmark.mapX}, Y: {landmark.mapY}<br/>
            <span className="text-xs text-gray-500">Leaflet: ({lat.toFixed(2)}, {lng.toFixed(2)})</span>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}

// Map controls component
function MapControls({ onZoomIn, onZoomOut, onReset, zoom, minZoom, maxZoom }: {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  zoom: number
  minZoom: number
  maxZoom: number
}) {
  const map = useMap()
  
  const handleZoomIn = () => {
    map.zoomIn()
    onZoomIn()
  }
  
  const handleZoomOut = () => {
    map.zoomOut()
    onZoomOut()
  }
  
  const handleReset = () => {
    try {
      // First set view to center
      map.setView([MAP_SIZE / 2, MAP_SIZE / 2], MIN_ZOOM, { animate: false })
      
      // Then try to fit bounds
      setTimeout(() => {
        try {
          const sw = L.latLng(MAP_SIZE, 0) // bottom-left (high Y, low X)
          const ne = L.latLng(0, MAP_SIZE) // top-right (low Y, high X)
          const bounds = L.latLngBounds(sw, ne)
          
          if (bounds && bounds.isValid && bounds.isValid()) {
            map.fitBounds(bounds, {
              padding: [0, 0],
              animate: false,
              maxZoom: MAX_ZOOM
            })
          }
        } catch (fitError) {
          console.warn('fitBounds failed on reset:', fitError)
        }
      }, 50)
    } catch (error) {
      console.error('Error resetting map:', error)
      map.setView([MAP_SIZE / 2, MAP_SIZE / 2], MIN_ZOOM, { animate: false })
    }
    
    onReset()
  }
  
  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-[1000]">
      <Button
        onClick={handleZoomIn}
        disabled={zoom >= maxZoom}
        className="bg-red-600 hover:bg-red-700 text-white border-2 border-red-500"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        onClick={handleZoomOut}
        disabled={zoom <= minZoom}
        className="bg-red-600 hover:bg-red-700 text-white border-2 border-red-500"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        onClick={handleReset}
        className="bg-red-600 hover:bg-red-700 text-white border-2 border-red-500"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}

// Component to handle panning to landmarks
function MapPanTo({ targetLandmark, onPanComplete }: { targetLandmark: Landmark | null, onPanComplete: () => void }) {
  const map = useMap()
  const lastTargetId = useRef<string | null>(null)
  
  useEffect(() => {
    if (targetLandmark) {
      const landmarkId = targetLandmark.id || `${targetLandmark.mapX}-${targetLandmark.mapY}`
      if (landmarkId !== lastTargetId.current) {
        lastTargetId.current = landmarkId
        const [lat, lng] = mapToLatLng(targetLandmark.mapX, targetLandmark.mapY)
        map.setView([lat, lng], Math.max(2, map.getZoom()), {
          animate: true,
          duration: 0.5
        })
        // Call onPanComplete after animation
        setTimeout(() => {
          onPanComplete()
        }, 600)
      }
    } else {
      lastTargetId.current = null
    }
  }, [targetLandmark, map, onPanComplete])
  
  return null
}

export default function BattlefieldMap({ 
  landmarks, 
  mapZoom, 
  resetKey, 
  onZoomChange, 
  onZoomIn, 
  onZoomOut, 
  onReset,
  panToLandmark,
  onPanComplete,
  onCoordsChange
}: {
  landmarks: Landmark[]
  mapZoom: number
  resetKey: number
  onZoomChange: (zoom: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  panToLandmark: Landmark | null
  onPanComplete: () => void
  onCoordsChange: (coords: { x: number; y: number } | null) => void
}) {
  useEffect(() => {
    console.log('🟣 ========== BATTLEFIELD MAP COMPONENT ==========')
    console.log('🟣 Landmarks count:', landmarks.length)
    console.log('🟣 Map zoom:', mapZoom)
    console.log('🟣 Reset key:', resetKey)
    console.log('🟣 Map size constant:', MAP_SIZE, 'x', MAP_SIZE)
    console.log('🟣 Tile size constant:', TILE_SIZE, 'x', TILE_SIZE)
    console.log('🟣 Zoom range:', MIN_ZOOM, 'to', MAX_ZOOM)
    console.log('🟣 Expected tiles at zoom 0:', Math.pow(2, 0), 'x', Math.pow(2, 0), '=', Math.pow(2, 0) * Math.pow(2, 0), 'tiles')
    console.log('🟣 ==============================================')
  }, [landmarks.length, mapZoom, resetKey])
  
  return (
    <MapContainer
      center={[MAP_SIZE / 2, MAP_SIZE / 2]}
      zoom={0}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      zoomControl={false}
      style={{ height: '100%', width: '100%', zIndex: 1, backgroundColor: '#000000' }}
      crs={customCRS}
      maxBounds={L.latLngBounds([0, 0], [MAP_SIZE, MAP_SIZE])}
      bounds={L.latLngBounds([0, 0], [MAP_SIZE, MAP_SIZE])}
      key={resetKey}
      worldCopyJump={false}
      maxBoundsViscosity={1.0}
      whenReady={() => {
        console.log('🟢 MapContainer whenReady fired!')
      }}
    >
      <MapZoomSync onZoomChange={onZoomChange} />
      <MapReset resetKey={resetKey} />
      <MapPanTo targetLandmark={panToLandmark} onPanComplete={onPanComplete} />
      <MapCoordinates onCoordsChange={onCoordsChange} />
      <CustomTileLayer />
      <MapControls
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onReset={onReset}
        zoom={mapZoom}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
      />
      
      {/* Render landmarks */}
      {landmarks.map((landmark) => (
        <LandmarkMarker key={landmark.id || `${landmark.mapX}-${landmark.mapY}`} landmark={landmark} />
      ))}
    </MapContainer>
  )
}

