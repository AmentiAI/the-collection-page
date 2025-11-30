'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Save, X, Plus } from 'lucide-react'
import { useToast } from '@/components/Toast'

const MAP_WIDTH = 4096
const MAP_HEIGHT = 2728

interface Landmark {
  id: string
  spriteX: number
  spriteY: number
  spriteWidth: number
  spriteHeight: number
  mapX: number
  mapY: number
  type: 'demonic' | 'angelic'
  name: string
  url?: string
}

export default function LandmarkEditorPage() {
  const mapCanvasRef = useRef<HTMLCanvasElement>(null)
  const landmarksCanvasRef = useRef<HTMLCanvasElement>(null)
  const mapImageRef = useRef<HTMLImageElement | null>(null)
  const landmarksImageRef = useRef<HTMLImageElement | null>(null)
  const toast = useToast()
  
  const [landmarks, setLandmarks] = useState<Landmark[]>([])
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null)
  const [isSelectingSprite, setIsSelectingSprite] = useState(false)
  const [spriteSelection, setSpriteSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [spriteStart, setSpriteStart] = useState<{ x: number; y: number } | null>(null)
  const [mapPosition, setMapPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [newLandmarkType, setNewLandmarkType] = useState<'demonic' | 'angelic'>('demonic')
  const [newLandmarkName, setNewLandmarkName] = useState('')
  const [newLandmarkUrl, setNewLandmarkUrl] = useState('')
  const [landmarkPreviews, setLandmarkPreviews] = useState<Record<string, string>>({})
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number } | null>(null)
  const [clickedCoords, setClickedCoords] = useState<{ x: number; y: number } | null>(null)

  // Load images
  useEffect(() => {
    const mapImg = new Image()
    mapImg.src = '/content.jpg'
    mapImg.onload = () => {
      mapImageRef.current = mapImg
      drawMap()
    }

    const landmarksImg = new Image()
    landmarksImg.src = '/landmarks.png'
    landmarksImg.onload = () => {
      landmarksImageRef.current = landmarksImg
      drawLandmarksSprite()
    }
  }, [])

  const drawMap = useCallback(() => {
    const canvas = mapCanvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = mapImageRef.current
    if (!canvas || !ctx || !img) return

    // Set canvas to display size (800x800)
    const displayWidth = 800
    const displayHeight = 800
    canvas.width = displayWidth
    canvas.height = displayHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Draw the map image scaled to canvas
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight)
    
    // Calculate scale factor: canvas pixels per map pixel
    const scaleX = displayWidth / MAP_WIDTH
    const scaleY = displayHeight / MAP_HEIGHT
    
    // Draw landmarks at their exact map coordinates
    // Invert Y when drawing: mapY is from top (0-MAP_HEIGHT), canvasY is from top (0-800)
    // So: canvasY = (MAP_HEIGHT - mapY) * scaleY
    landmarks.forEach((landmark) => {
      const canvasX = landmark.mapX * scaleX
      const canvasY = (MAP_HEIGHT - landmark.mapY) * scaleY
      
      ctx.fillStyle = landmark.type === 'demonic' ? 'rgba(220, 38, 38, 0.7)' : 'rgba(6, 182, 212, 0.7)'
      ctx.beginPath()
      ctx.arc(canvasX, canvasY, 8, 0, Math.PI * 2)
      ctx.fill()
      
      if (selectedLandmark?.id === landmark.id) {
        ctx.strokeStyle = 'yellow'
        ctx.lineWidth = 3
        ctx.stroke()
      }
    })
  }, [landmarks, selectedLandmark])

  const drawLandmarksSprite = useCallback(() => {
    const canvas = landmarksCanvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = landmarksImageRef.current
    if (!canvas || !ctx || !img) return

    canvas.width = img.width
    canvas.height = img.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)

    // Draw sprite selection
    if (spriteSelection) {
      ctx.strokeStyle = 'yellow'
      ctx.lineWidth = 2
      ctx.strokeRect(spriteSelection.x, spriteSelection.y, spriteSelection.width, spriteSelection.height)
    }

    // Draw existing landmark sprites
    landmarks.forEach((landmark) => {
      ctx.strokeStyle = landmark.type === 'demonic' ? 'red' : 'cyan'
      ctx.lineWidth = 2
      ctx.strokeRect(landmark.spriteX, landmark.spriteY, landmark.spriteWidth, landmark.spriteHeight)
    })
  }, [landmarks, spriteSelection])

  useEffect(() => {
    drawMap()
  }, [drawMap])

  useEffect(() => {
    drawLandmarksSprite()
  }, [drawLandmarksSprite])

  const handleMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mapCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    // Get click position relative to displayed canvas
    const displayX = e.clientX - rect.left
    const displayY = e.clientY - rect.top
    
    // Convert display coordinates to internal canvas coordinates (accounting for CSS scaling)
    const internalX = (displayX / rect.width) * canvas.width
    const internalY = (displayY / rect.height) * canvas.height
    
    // Convert internal canvas coordinates (0-800) directly to map pixel coordinates
    // X: left to right (0 to MAP_WIDTH)
    const mapX = Math.round((internalX / canvas.width) * MAP_WIDTH)
    
    // Y: top to bottom (0 to MAP_HEIGHT)
    // Canvas Y=0 is top, Y=height is bottom
    // Map Y=0 is top, Y=MAP_HEIGHT is bottom
    // Invert Y: canvas top (internalY=0) -> mapY=0, canvas bottom (internalY=height) -> mapY=MAP_HEIGHT
    const mapY = Math.round(MAP_HEIGHT - (internalY / canvas.height) * MAP_HEIGHT)
    
    // Clamp to valid pixel range
    const clampedX = Math.max(0, Math.min(MAP_WIDTH - 1, mapX))
    const clampedY = Math.max(0, Math.min(MAP_HEIGHT - 1, mapY))
    
    setClickedCoords({ x: clampedX, y: clampedY })

    if (selectedLandmark) {
      setLandmarks(prev => prev.map(l => 
        l.id === selectedLandmark.id ? { ...l, mapX: clampedX, mapY: clampedY } : l
      ))
    } else if (spriteSelection) {
      // Create new landmark (temporary ID, will be replaced with UUID when saved)
      const newLandmark: Landmark = {
        id: `temp-${Date.now()}`, // Temporary ID to identify unsaved landmarks
        spriteX: spriteSelection.x,
        spriteY: spriteSelection.y,
        spriteWidth: spriteSelection.width,
        spriteHeight: spriteSelection.height,
        mapX: clampedX,
        mapY: clampedY,
        type: newLandmarkType,
        name: newLandmarkName || `${newLandmarkType} Landmark ${landmarks.filter(l => l.type === newLandmarkType).length + 1}`,
        url: newLandmarkUrl.trim() || undefined,
      }
      setLandmarks(prev => [...prev, newLandmark])
      setSpriteSelection(null)
      setNewLandmarkName('')
    }
  }

  const handleMapMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mapCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    // Get mouse position relative to displayed canvas
    const displayX = e.clientX - rect.left
    const displayY = e.clientY - rect.top
    
    // Canvas internal size is 800x800, map is 4096x2728
    // Convert display coordinates to internal canvas coordinates (accounting for CSS scaling)
    const internalX = (displayX / rect.width) * canvas.width
    const internalY = (displayY / rect.height) * canvas.height
    
    // Convert internal canvas coordinates (0-800) directly to map pixel coordinates
    // X: left to right (0 to MAP_WIDTH)
    const mapX = Math.round((internalX / canvas.width) * MAP_WIDTH)
    
    // Y: top to bottom (0 to MAP_HEIGHT)
    // Canvas Y=0 is top, Y=height is bottom
    // Map Y=0 is top, Y=MAP_HEIGHT is bottom
    // Invert Y: canvas top (internalY=0) -> mapY=0, canvas bottom (internalY=height) -> mapY=MAP_HEIGHT
    const mapY = Math.round(MAP_HEIGHT - (internalY / canvas.height) * MAP_HEIGHT)
    
    // Clamp to valid pixel range
    const clampedX = Math.max(0, Math.min(MAP_WIDTH - 1, mapX))
    const clampedY = Math.max(0, Math.min(MAP_HEIGHT - 1, mapY))
    
    setMouseCoords({ x: clampedX, y: clampedY })
  }

  const handleMapMouseLeave = () => {
    setMouseCoords(null)
  }

  const handleSpriteMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = landmarksCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setIsSelectingSprite(true)
    setSpriteStart({ x, y })
  }

  const handleSpriteMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelectingSprite || !spriteStart) return

    const canvas = landmarksCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setSpriteSelection({
      x: Math.min(spriteStart.x, x),
      y: Math.min(spriteStart.y, y),
      width: Math.abs(x - spriteStart.x),
      height: Math.abs(y - spriteStart.y),
    })
  }

  const handleSpriteMouseUp = () => {
    setIsSelectingSprite(false)
  }

  // Generate cropped image preview for a landmark
  const generateLandmarkPreview = useCallback((landmark: Landmark): Promise<string> => {
    return new Promise((resolve) => {
      const img = landmarksImageRef.current
      if (!img) {
        resolve('')
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = landmark.spriteWidth
      canvas.height = landmark.spriteHeight
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        resolve('')
        return
      }

      // Draw the cropped portion of the sprite sheet
      ctx.drawImage(
        img,
        landmark.spriteX,
        landmark.spriteY,
        landmark.spriteWidth,
        landmark.spriteHeight,
        0,
        0,
        landmark.spriteWidth,
        landmark.spriteHeight
      )

      resolve(canvas.toDataURL('image/png'))
    })
  }, [])

  // Generate previews for all landmarks
  useEffect(() => {
    if (landmarks.length === 0 || !landmarksImageRef.current) return

    const generatePreviews = async () => {
      const previews: Record<string, string> = {}
      for (const landmark of landmarks) {
        const preview = await generateLandmarkPreview(landmark)
        previews[landmark.id] = preview
      }
      setLandmarkPreviews(previews)
    }

    generatePreviews()
  }, [landmarks, generateLandmarkPreview])

  // Load landmarks from API on mount
  useEffect(() => {
    fetch('/api/landmarks')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.landmarks) {
          setLandmarks(data.landmarks)
        }
      })
      .catch(err => console.error('Error loading landmarks:', err))
  }, [])

  const handleDelete = async (landmark: Landmark) => {
    // Helper function to check if ID is a valid UUID
    const isValidUUID = (id: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(id)
    }

    // If it's a temp ID (not saved to DB yet), just remove from local state
    if (!landmark.id || !isValidUUID(landmark.id)) {
      setLandmarks(prev => prev.filter(l => l.id !== landmark.id))
      if (selectedLandmark?.id === landmark.id) {
        setSelectedLandmark(null)
      }
      toast.success('Landmark removed (was not saved to database)')
      return
    }

    // Delete from database
    try {
      const response = await fetch(`/api/landmarks/${landmark.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(`Failed to delete ${landmark.name}: ${error.error || error.message}`)
        return
      }

      // Remove from local state
      setLandmarks(prev => prev.filter(l => l.id !== landmark.id))
      if (selectedLandmark?.id === landmark.id) {
        setSelectedLandmark(null)
      }
      
      toast.success(`${landmark.name} deleted from database`)
    } catch (error) {
      console.error('Error deleting landmark:', error)
      toast.error('Failed to delete landmark')
    }
  }

  const handleSave = async () => {
    try {
      // Helper function to check if ID is a valid UUID
      const isValidUUID = (id: string) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        return uuidRegex.test(id)
      }

      const savedLandmarks: Landmark[] = []
      const errors: string[] = []

      // Save all landmarks to database
      for (const landmark of landmarks) {
        if (landmark.id && isValidUUID(landmark.id)) {
          // Update existing (only if it's a valid UUID from database)
          try {
            const response = await fetch(`/api/landmarks/${landmark.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: landmark.name,
                type: landmark.type,
                spriteX: landmark.spriteX,
                spriteY: landmark.spriteY,
                spriteWidth: landmark.spriteWidth,
                spriteHeight: landmark.spriteHeight,
                mapX: landmark.mapX,
                mapY: landmark.mapY,
                url: landmark.url || null, // Explicitly send null for empty/undefined URLs
              }),
            })
            
            if (!response.ok) {
              const error = await response.json()
              errors.push(`Failed to update ${landmark.name}: ${error.error || error.message}`)
            } else {
              const data = await response.json()
              if (data.success && data.landmark) {
                savedLandmarks.push(data.landmark)
              }
            }
          } catch (err) {
            errors.push(`Error updating ${landmark.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        } else {
          // Create new (if no ID, invalid UUID, or temp ID)
          try {
            const response = await fetch('/api/landmarks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: landmark.name,
                type: landmark.type,
                spriteX: landmark.spriteX,
                spriteY: landmark.spriteY,
                spriteWidth: landmark.spriteWidth,
                spriteHeight: landmark.spriteHeight,
                mapX: landmark.mapX,
                mapY: landmark.mapY,
                url: landmark.url || null, // Explicitly send null for empty/undefined URLs
              }),
            })
            
            if (!response.ok) {
              const error = await response.json()
              errors.push(`Failed to create ${landmark.name}: ${error.error || error.message}`)
            } else {
              const data = await response.json()
              if (data.success && data.landmark) {
                savedLandmarks.push(data.landmark)
              }
            }
          } catch (err) {
            errors.push(`Error creating ${landmark.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        }
      }
      
      // Reload landmarks from database to get all saved landmarks with correct IDs
      const reloadResponse = await fetch('/api/landmarks')
      const reloadData = await reloadResponse.json()
      if (reloadData.success && reloadData.landmarks) {
        setLandmarks(reloadData.landmarks)
      }
      
      if (errors.length > 0) {
        toast.error(`Some landmarks failed to save: ${errors.join(', ')}`)
      } else {
        toast.success(`All ${landmarks.length} landmark(s) saved to database!`)
      }
    } catch (error) {
      console.error('Error saving landmarks:', error)
      toast.error('Failed to save landmarks')
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-black uppercase mb-8 text-red-500">Landmark Editor</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Landmarks Sprite Sheet */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">1. Select Sprite from landmarks.png</h2>
            <div className="border-2 border-red-500/50 rounded overflow-auto max-h-[600px]">
              <canvas
                ref={landmarksCanvasRef}
                className="cursor-crosshair"
                onMouseDown={handleSpriteMouseDown}
                onMouseMove={handleSpriteMouseMove}
                onMouseUp={handleSpriteMouseUp}
                onMouseLeave={handleSpriteMouseUp}
              />
            </div>
            {spriteSelection && (
              <div className="bg-black/80 border border-yellow-500 p-4 rounded">
                <div className="text-sm font-mono">
                  <div>X: {spriteSelection.x}, Y: {spriteSelection.y}</div>
                  <div>Width: {spriteSelection.width}, Height: {spriteSelection.height}</div>
                </div>
                <div className="mt-4 space-y-2">
                  <select
                    value={newLandmarkType}
                    onChange={(e) => setNewLandmarkType(e.target.value as 'demonic' | 'angelic')}
                    className="bg-black border border-red-500 text-white px-3 py-2 rounded w-full"
                  >
                    <option value="demonic">🔥 Demonic</option>
                    <option value="angelic">✨ Angelic</option>
                  </select>
                  <input
                    type="text"
                    value={newLandmarkName}
                    onChange={(e) => setNewLandmarkName(e.target.value)}
                    placeholder="Landmark name (optional)"
                    className="bg-black border border-red-500 text-white px-3 py-2 rounded w-full"
                  />
                  <input
                    type="text"
                    value={newLandmarkUrl}
                    onChange={(e) => setNewLandmarkUrl(e.target.value)}
                    placeholder="URL (e.g., /battle, /graveyard)"
                    className="bg-black border border-red-500 text-white px-3 py-2 rounded w-full"
                  />
                  <div className="text-xs text-gray-400">
                    Now click on the map to place this landmark
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Map */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">2. Click Map to Place Landmark</h2>
            <div className="border-2 border-red-500/50 rounded relative">
              <canvas
                ref={mapCanvasRef}
                className="cursor-crosshair w-full"
                onClick={handleMapClick}
                onMouseMove={handleMapMouseMove}
                onMouseLeave={handleMapMouseLeave}
              />
              {/* Coordinate overlay */}
              {(mouseCoords || clickedCoords) && (
                <div className="absolute top-2 left-2 bg-black/90 border border-yellow-500 px-3 py-2 rounded font-mono text-sm z-10">
                  {clickedCoords ? (
                    <div>
                      <div className="text-yellow-400 font-bold">Clicked:</div>
                      <div className="text-white">X: {clickedCoords.x}, Y: {clickedCoords.y}</div>
                    </div>
                  ) : mouseCoords ? (
                    <div>
                      <div className="text-gray-400">Mouse:</div>
                      <div className="text-white">X: {mouseCoords.x}, Y: {mouseCoords.y}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="text-sm text-gray-400">
              {selectedLandmark 
                ? `Selected: ${selectedLandmark.name} (${selectedLandmark.mapX}, ${selectedLandmark.mapY}) - Click map to move it`
                : spriteSelection 
                  ? 'Click on map to place selected sprite'
                  : 'Select a sprite first, then click map to place it'}
            </div>
            {selectedLandmark && (
              <div className="mt-4 p-4 bg-black/80 border border-yellow-500 rounded">
                <h3 className="text-lg font-bold mb-2">Edit Landmark</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={selectedLandmark.name}
                    onChange={(e) => {
                      const updated = { ...selectedLandmark, name: e.target.value }
                      setSelectedLandmark(updated)
                      setLandmarks(prev => prev.map(l => 
                        l.id === selectedLandmark.id ? updated : l
                      ))
                    }}
                    placeholder="Landmark name"
                    className="bg-black border border-yellow-500 text-white px-3 py-2 rounded w-full"
                  />
                  <input
                    type="text"
                    value={selectedLandmark.url || ''}
                    onChange={(e) => {
                      const urlValue = e.target.value.trim() || undefined
                      const updated = { ...selectedLandmark, url: urlValue }
                      setSelectedLandmark(updated)
                      setLandmarks(prev => prev.map(l => 
                        l.id === selectedLandmark.id ? updated : l
                      ))
                    }}
                    placeholder="URL (e.g., /battle, /graveyard)"
                    className="bg-black border border-yellow-500 text-white px-3 py-2 rounded w-full"
                  />
                </div>
              </div>
            )}
            {clickedCoords && (
              <div className="text-xs text-yellow-400 font-mono">
                Last clicked: ({clickedCoords.x}, {clickedCoords.y})
              </div>
            )}
          </div>
        </div>

        {/* Landmarks List */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Landmarks ({landmarks.length})</h2>
            <Button onClick={handleSave} className="bg-red-600 hover:bg-red-700">
              <Save className="h-4 w-4 mr-2" />
              Save to Database
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {landmarks.map((landmark) => (
              <div
                key={landmark.id}
                className={`p-4 rounded border-2 ${
                  landmark.type === 'demonic' ? 'border-red-500/50 bg-red-950/20' : 'border-cyan-500/50 bg-cyan-950/20'
                } ${selectedLandmark?.id === landmark.id ? 'ring-2 ring-yellow-500' : ''}`}
              >
                <div className="flex items-start gap-4">
                  {/* Cropped sprite preview */}
                  {landmarkPreviews[landmark.id] && (
                    <div className="flex-shrink-0">
                      <img
                        src={landmarkPreviews[landmark.id]}
                        alt={landmark.name}
                        className="w-24 h-24 object-contain border border-gray-600 rounded bg-black"
                        style={{
                          imageRendering: 'pixelated',
                          maxWidth: `${landmark.spriteWidth}px`,
                          maxHeight: `${landmark.spriteHeight}px`,
                        }}
                      />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-lg mb-2">{landmark.name}</div>
                    <div className="text-xs font-mono space-y-1">
                      <div>Sprite: ({landmark.spriteX}, {landmark.spriteY}) {landmark.spriteWidth}x{landmark.spriteHeight}</div>
                      <div className="font-bold text-yellow-400">Map: X: {landmark.mapX}, Y: {landmark.mapY}</div>
                      <div className={`text-xs mt-1 ${landmark.type === 'demonic' ? 'text-red-400' : 'text-cyan-400'}`}>
                        {landmark.type === 'demonic' ? '🔥 Demonic' : '✨ Angelic'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedLandmark(landmark)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(landmark)}
                      className="text-red-400 hover:text-red-300 hover:border-red-400"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

