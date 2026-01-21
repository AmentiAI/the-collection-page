'use client'

import { useState, useRef, useEffect } from 'react'

interface PlacementPosition {
  x: number // 0.0 to 1.0 (0.5 = center)
  y: number // 0.0 to 1.0 (0.5 = center)
  scale: number // Uniform scale (fallback)
  widthScale?: number // Independent width scaling
  heightScale?: number // Independent height scaling
  angle: number // Rotation in degrees
  lockAspectRatio?: boolean
}

interface ProductPlacementEditorProps {
  previewUrl: string // The design image URL
  productImages: string[] | null // Array of product mockup images [front, back, ...]
  placement: { positionsData: Record<string, PlacementPosition> }
  onPlacementChange: (changes: Partial<{ positionsData: Record<string, PlacementPosition> }>) => void
  position: string // Current position name ('front', 'back', etc.)
}

export default function ProductPlacementEditor({
  previewUrl,
  productImages,
  placement,
  onPlacementChange,
  position,
}: ProductPlacementEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const [showHandles, setShowHandles] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, offsetX: 0, offsetY: 0 })

  // Get current position data with defaults
  const posData = placement.positionsData[position] || {}
  const currentPosition: PlacementPosition = {
    x: posData.x ?? 0.5,
    y: posData.y ?? 0.5,
    scale: posData.scale ?? 1.0,
    widthScale: posData.widthScale ?? posData.scale ?? 1.0,
    heightScale: posData.heightScale ?? posData.scale ?? 1.0,
    angle: posData.angle ?? 0,
    lockAspectRatio: posData.lockAspectRatio ?? false,
  }

  // Use widthScale/heightScale if available, otherwise fall back to uniform scale
  const widthScale = currentPosition.widthScale ?? currentPosition.scale ?? 1.0
  const heightScale = currentPosition.heightScale ?? currentPosition.scale ?? 1.0

  // Get product mockup image for this position
  const getMockupImage = (): string => {
    if (!productImages || productImages.length === 0) {
      return '/placeholder-product.png' // Fallback - you can add a placeholder image
    }
    
    // Map position to image index (front=0, back=1, etc.)
    const positionIndexMap: Record<string, number> = {
      front: 0,
      back: 1,
      left: 2,
      right: 3,
    }
    
    const index = positionIndexMap[position] ?? 0
    return productImages[Math.min(index, productImages.length - 1)]
  }

  // Handle drag to position
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current || !overlayRef.current) return
    e.preventDefault()
    setIsDragging(true)
    setShowHandles(true)
    
    const rect = containerRef.current.getBoundingClientRect()
    const overlayRect = overlayRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    
    // Calculate offset from overlay center
    const overlayCenterX = (currentPosition.x * rect.width)
    const overlayCenterY = (currentPosition.y * rect.height)
    const offsetX = clickX - overlayCenterX
    const offsetY = clickY - overlayCenterY
    
    setDragStart({ x: clickX, y: clickY, offsetX, offsetY })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const newX = (e.clientX - rect.left - dragStart.offsetX) / rect.width
    const newY = (e.clientY - rect.top - dragStart.offsetY) / rect.height
    
    // Clamp values between 0 and 1
    const clampedX = Math.max(0, Math.min(1, newX))
    const clampedY = Math.max(0, Math.min(1, newY))
    
    onPlacementChange({
      positionsData: {
        ...placement.positionsData,
        [position]: { ...currentPosition, x: clampedX, y: clampedY }
      }
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragStart, currentPosition])

  // Handle resize (simplified - full implementation has 8 handles)
  const handleResizeStart = (handle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setIsResizing(true)
    setResizeHandle(handle)
    // Store initial values for resize calculation
  }

  const baseSize = 200 // Base size in pixels

  return (
    <div className="relative border-2 border-red-600/40 rounded-lg overflow-hidden bg-black/60">
      {/* Product Mockup Background */}
      <div className="relative w-full aspect-square bg-gray-900">
        <img
          src={getMockupImage()}
          alt={`${position} view`}
          className="w-full h-full object-contain opacity-50"
          onError={(e) => {
            // Fallback if image fails to load
            e.currentTarget.style.display = 'none'
          }}
        />
        
        {/* Design Overlay - Positioned and Scaled */}
        {previewUrl && (
          <div
            ref={containerRef}
            className="absolute inset-0 cursor-move"
            onMouseEnter={() => setShowHandles(true)}
            onMouseLeave={() => !isDragging && setShowHandles(false)}
          >
            <div
              ref={overlayRef}
              className="absolute border-2 border-red-500 bg-white bg-opacity-90 transition-all"
              style={{
                left: `${currentPosition.x * 100}%`,
                top: `${currentPosition.y * 100}%`,
                width: `${widthScale * baseSize}px`,
                height: `${heightScale * baseSize}px`,
                transform: `
                  translate(-50%, -50%)
                  rotate(${currentPosition.angle}deg)
                `,
                transformOrigin: 'center center',
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
              onMouseDown={handleMouseDown}
            >
              <img
                src={previewUrl}
                alt="Design"
                className="w-full h-full object-contain pointer-events-none"
              />
              
              {/* Resize Handles (shown on hover/click) */}
              {showHandles && (
                <>
                  {/* Corner handles */}
                  <div 
                    className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 border-2 border-white rounded-full cursor-nwse-resize z-10"
                    onMouseDown={(e) => handleResizeStart('nw', e)}
                  />
                  <div 
                    className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 border-2 border-white rounded-full cursor-nesw-resize z-10"
                    onMouseDown={(e) => handleResizeStart('ne', e)}
                  />
                  <div 
                    className="absolute -bottom-2 -left-2 w-4 h-4 bg-red-500 border-2 border-white rounded-full cursor-nesw-resize z-10"
                    onMouseDown={(e) => handleResizeStart('sw', e)}
                  />
                  <div 
                    className="absolute -bottom-2 -right-2 w-4 h-4 bg-red-500 border-2 border-white rounded-full cursor-nwse-resize z-10"
                    onMouseDown={(e) => handleResizeStart('se', e)}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Position Controls */}
      <div className="p-4 bg-black/80 border-t border-red-600/40 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-gray-400 font-mono uppercase mb-1">X: {currentPosition.x.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentPosition.x}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { ...currentPosition, x: Number(e.target.value) }
                }
              })}
              className="w-full accent-red-600"
            />
          </div>
          <div>
            <label className="block text-gray-400 font-mono uppercase mb-1">Y: {currentPosition.y.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentPosition.y}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { ...currentPosition, y: Number(e.target.value) }
                }
              })}
              className="w-full accent-red-600"
            />
          </div>
          <div>
            <label className="block text-gray-400 font-mono uppercase mb-1">Width: {widthScale.toFixed(2)}</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.05"
              value={widthScale}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { 
                    ...currentPosition, 
                    widthScale: Number(e.target.value),
                    scale: currentPosition.lockAspectRatio ? Number(e.target.value) : currentPosition.scale
                  }
                }
              })}
              className="w-full accent-red-600"
            />
          </div>
          <div>
            <label className="block text-gray-400 font-mono uppercase mb-1">Height: {heightScale.toFixed(2)}</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.05"
              value={heightScale}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { 
                    ...currentPosition, 
                    heightScale: Number(e.target.value),
                    scale: currentPosition.lockAspectRatio ? Number(e.target.value) : currentPosition.scale
                  }
                }
              })}
              className="w-full accent-red-600"
            />
          </div>
          <div>
            <label className="block text-gray-400 font-mono uppercase mb-1">Rotation: {currentPosition.angle}°</label>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={currentPosition.angle}
              onChange={(e) => onPlacementChange({
                positionsData: {
                  ...placement.positionsData,
                  [position]: { ...currentPosition, angle: Number(e.target.value) }
                }
              })}
              className="w-full accent-red-600"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={currentPosition.lockAspectRatio ?? false}
                onChange={(e) => onPlacementChange({
                  positionsData: {
                    ...placement.positionsData,
                    [position]: { 
                      ...currentPosition, 
                      lockAspectRatio: e.target.checked,
                      // When locking, sync scales
                      scale: e.target.checked ? widthScale : currentPosition.scale,
                      widthScale: e.target.checked ? widthScale : currentPosition.widthScale,
                      heightScale: e.target.checked ? widthScale : currentPosition.heightScale,
                    }
                  }
                })}
                className="w-4 h-4 accent-red-600"
              />
              <span className="text-gray-400 font-mono uppercase text-xs">Lock Aspect</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
