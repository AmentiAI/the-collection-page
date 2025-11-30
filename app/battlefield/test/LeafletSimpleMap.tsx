'use client'

import { useEffect } from 'react'
import { MapContainer, ImageOverlay, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const MAP_SIZE = 2048

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const customCRS = L.CRS.Simple

function MapInit() {
  const map = useMap()
  
  useEffect(() => {
    console.log('🟡 LeafletSimpleMap: Map initialized')
    console.log('🟡 Map center:', map.getCenter())
    console.log('🟡 Map zoom:', map.getZoom())
    console.log('🟡 Map bounds:', map.getBounds())
    
    // Fit the map to show the entire image
    setTimeout(() => {
      try {
        const bounds = L.latLngBounds([0, 0], [MAP_SIZE, MAP_SIZE])
        map.fitBounds(bounds, { padding: [10, 10], animate: false })
        console.log('✅ LeafletSimpleMap: Fit bounds called')
      } catch (error) {
        console.error('❌ LeafletSimpleMap: Fit bounds error:', error)
      }
    }, 100)
  }, [map])
  
  return null
}

export default function LeafletSimpleMap() {
  useEffect(() => {
    console.log('🟣 LeafletSimpleMap component mounted')
  }, [])
  
  const bounds: [[number, number], [number, number]] = [[0, 0], [MAP_SIZE, MAP_SIZE]]
  
  return (
    <MapContainer
      center={[MAP_SIZE / 2, MAP_SIZE / 2]}
      zoom={0}
      minZoom={0}
      maxZoom={4}
      zoomControl={false}
      style={{ height: '100%', width: '100%', backgroundColor: '#000000', position: 'absolute', top: 0, left: 0 }}
      crs={customCRS}
      whenReady={() => {
        console.log('🟢 LeafletSimpleMap: MapContainer ready')
      }}
    >
      <MapInit />
      <ImageOverlay
        url="/map.webp"
        bounds={bounds}
        opacity={1}
        eventHandlers={{
          load: () => {
            console.log('✅ LeafletSimpleMap: Image overlay loaded')
          },
          error: (e) => {
            console.error('❌ LeafletSimpleMap: Image overlay error:', e)
          }
        }}
      />
    </MapContainer>
  )
}

