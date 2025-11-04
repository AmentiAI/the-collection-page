'use client'

import { useState, useEffect } from 'react'

interface TaskbarProps {
  onOpenApp: (appName: string) => void
  openApps: string[]
}

export default function Taskbar({ onOpenApp, openApps }: TaskbarProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-12 bg-gray-900 border-t-2 border-red-600 shadow-[0_-4px_20px_rgba(255,0,0,0.5)] z-50 flex items-center justify-between px-4">
      {/* Start Button */}
      <button
        onClick={() => onOpenApp('start')}
        className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold text-sm uppercase transition-all shadow-[0_0_10px_rgba(255,0,0,0.5)]"
      >
        🔥 START
      </button>

      {/* Task Icons */}
      <div className="flex items-center gap-2 flex-1 px-4">
        {openApps.map((app) => (
          <button
            key={app}
            onClick={() => onOpenApp(app)}
            className={`px-3 py-1 rounded transition-all ${
              app === 'gates'
                ? 'bg-red-600 text-white shadow-[0_0_10px_rgba(255,0,0,0.8)]'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {app === 'gates' && '🔥 Gates of Hell'}
            {app === 'start' && '📋 Menu'}
          </button>
        ))}
      </div>

      {/* System Tray */}
      <div className="flex items-center gap-4 text-white text-sm">
        <div className="px-3 py-1 bg-gray-800 rounded">
          {formatTime(time)}
        </div>
      </div>
    </div>
  )
}

