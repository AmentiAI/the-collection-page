'use client'

import { useState } from 'react'
import Header from '@/components/Header'

export default function ArmyPage() {
  const [connected, setConnected] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Video */}
      <div className="fixed inset-0 z-0 bg-black">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ objectFit: 'cover' }}
        >
          <source src="/New folder (19)/Marching_to_War_at_Damned_Gates.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        <Header connected={connected} showMusicControls={true} />
        
        {/* Nav Bar with Dropdown */}
        <nav className="relative z-20 w-full px-4 py-3">
          <div className="max-w-7xl mx-auto flex justify-center">
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="text-red-600 hover:text-red-500 font-bold text-lg md:text-xl uppercase tracking-wider px-6 py-2 border-2 border-red-600 rounded transition-all duration-200 hover:bg-red-600/20"
                style={{
                  textShadow: '0 0 10px rgba(220, 38, 38, 0.8), 2px 2px 4px rgba(0, 0, 0, 0.8)',
                  boxShadow: '0 0 20px rgba(220, 38, 38, 0.5)',
                }}
              >
                Army Lore ▼
              </button>
              
              {isDropdownOpen && (
                <div 
                  className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-96 max-w-[90vw] bg-black/95 border-2 border-red-600 rounded-lg p-6 shadow-xl z-30"
                  style={{
                    boxShadow: '0 0 30px rgba(220, 38, 38, 0.6)',
                  }}
                >
                  <p 
                    className="text-red-400 text-base md:text-lg font-mono leading-relaxed text-center"
                    style={{
                      textShadow: '0 0 10px rgba(220, 38, 38, 0.6), 1px 1px 2px rgba(0, 0, 0, 0.8)',
                    }}
                  >
                    Prepare Your Damned Armys Get As Many Soldies as You Can You Will Need Them
                  </p>
                </div>
              )}
            </div>
          </div>
        </nav>
      </div>
      
      {/* Click outside to close dropdown */}
      {isDropdownOpen && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  )
}

