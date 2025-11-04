'use client'

import { useState } from 'react'

interface AppWindowProps {
  appName: string
  onClose: () => void
  children: React.ReactNode
  title?: string
  icon?: string
}

export default function AppWindow({ appName, onClose, children, title, icon = '🔥' }: AppWindowProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls')) return
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  if (isMinimized) {
    return null
  }

  return (
    <div
      className="fixed bg-gray-900 border-2 border-red-600 shadow-[0_0_30px_rgba(255,0,0,0.8)] rounded-lg overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '600px',
        height: '500px',
        zIndex: 1000
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Title Bar */}
      <div className="bg-gradient-to-r from-red-600 to-red-800 p-2 flex items-center justify-between cursor-move">
        <div className="flex items-center gap-2 text-white font-bold">
          <span>{icon}</span>
          <span>{title || appName}</span>
        </div>
        <div className="flex items-center gap-2 window-controls">
          <button
            onClick={() => setIsMinimized(true)}
            className="w-6 h-6 bg-yellow-600 hover:bg-yellow-500 rounded text-xs font-bold"
            title="Minimize"
          >
            _
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 bg-red-600 hover:bg-red-500 rounded text-xs font-bold"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Window Content */}
      <div className="h-full bg-gray-950 text-white overflow-auto">
        {children}
      </div>
    </div>
  )
}

