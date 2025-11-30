'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Header from '@/components/Header'

// Test 2: Canvas-based map
function CanvasMap() {
  useEffect(() => {
    const canvas = document.getElementById('canvas-map') as HTMLCanvasElement
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      console.log('✅ Test 2: Canvas image loaded')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    img.onerror = () => {
      console.error('❌ Test 2: Canvas image failed to load')
      ctx.fillStyle = 'red'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'white'
      ctx.font = '20px Arial'
      ctx.fillText('Image failed to load', 10, 30)
    }
    img.src = '/map.webp'
  }, [])
  
  return null
}

// Test 3: Leaflet with direct image
const LeafletSimpleMap = dynamic(() => import('./LeafletSimpleMap'), { ssr: false })

// Test 4: Leaflet with tile API
const LeafletTileMap = dynamic(() => import('./LeafletTileMap'), { ssr: false })

export default function BattlefieldTestPage() {
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .test-map-container .leaflet-container {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          z-index: 1 !important;
        }
        .test-map-container {
          position: relative !important;
          overflow: hidden !important;
          contain: layout style paint !important;
        }
      `}} />
      <div className="min-h-screen bg-black text-white overflow-y-auto">
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={false}
        onHolderVerified={setIsHolder}
        onVerifyingStart={() => setIsVerifying(true)}
        onConnectedChange={() => {}}
      />
      
      <div className="p-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-red-400">Battlefield Map Tests</h1>
        
        <div className="space-y-8">
          {/* Test 1: Simple Image */}
          <div className="border-4 border-red-500 p-6 bg-gray-900 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-red-400">Test 1: Simple Image Map</h2>
            <p className="text-sm text-gray-400 mb-4">Direct img tag - should show map.webp if file exists</p>
            <div className="relative w-full h-96 bg-black overflow-hidden rounded border-2 border-gray-700">
              <img 
                src="/map.webp" 
                alt="Map"
                className="w-full h-full object-contain"
                onError={(e) => {
                  console.error('❌ Test 1: Image failed to load:', e)
                  const target = e.target as HTMLImageElement
                  target.style.border = '2px solid red'
                }}
                onLoad={() => {
                  console.log('✅ Test 1: Image loaded successfully')
                }}
              />
            </div>
          </div>
          
          {/* Test 2: Canvas Map */}
          <div className="border-4 border-cyan-500 p-6 bg-gray-900 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-cyan-400">Test 2: Canvas Map</h2>
            <p className="text-sm text-gray-400 mb-4">Canvas rendering - should draw map.webp on canvas</p>
            <div className="relative w-full h-96 bg-black overflow-hidden rounded border-2 border-gray-700">
              <CanvasMap />
              <canvas
                id="canvas-map"
                width={1024}
                height={1024}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          
          {/* Test 3: Leaflet Simple */}
          <div className="border-4 border-yellow-500 p-6 bg-gray-900 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">Test 3: Leaflet with Direct Image</h2>
            <p className="text-sm text-gray-400 mb-4">Leaflet ImageOverlay - should show map using ImageOverlay (no tiles)</p>
            <div className="test-map-container relative w-full h-96 bg-black overflow-hidden rounded border-2 border-gray-700">
              <LeafletSimpleMap />
            </div>
          </div>
          
          {/* Test 4: Leaflet Tiles */}
          <div className="border-4 border-green-500 p-6 bg-gray-900 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-green-400">Test 4: Leaflet with Tile API</h2>
            <p className="text-sm text-gray-400 mb-4">Leaflet TileLayer - should show map using /api/map/tiles endpoint (same as main page)</p>
            <div className="test-map-container relative w-full h-96 bg-black overflow-hidden rounded border-2 border-gray-700">
              <LeafletTileMap />
            </div>
          </div>
        </div>
        
        <div className="mt-8 p-6 bg-gray-900 border-2 border-gray-700 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Debug Info</h2>
          <div className="text-sm font-mono space-y-2">
            <div>✅ Check browser console (F12) for detailed logs from each test</div>
            <div>✅ Each test should show a map in its container</div>
            <div>✅ If you see a black screen, check console for errors</div>
            <div>✅ Test 1 & 2 don't require API - they test if map.webp exists</div>
            <div>✅ Test 3 uses Leaflet but no API calls</div>
            <div>✅ Test 4 uses the same tile API as the main /battlefield page</div>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

