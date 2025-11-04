'use client'

import { useState, useEffect, useRef } from 'react'

interface Slot {
  id: number
  name: string
  filled: boolean
  data?: any
}

export default function MoralLedgerPage() {
  const [blessedSlots, setBlessedSlots] = useState<Slot[]>(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Blessed Slot ${i + 1}`,
      filled: false
    }))
  )
  
  const [damnedSlots, setDamnedSlots] = useState<Slot[]>(
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `Damned Slot ${i + 1}`,
      filled: false
    }))
  )

  const blessedVideoRef = useRef<HTMLVideoElement>(null)
  const damnedVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // Auto-play videos
    const playVideos = async () => {
      try {
        if (blessedVideoRef.current) {
          blessedVideoRef.current.play().catch(err => console.log('Blessed video play failed:', err))
        }
        if (damnedVideoRef.current) {
          damnedVideoRef.current.play().catch(err => console.log('Damned video play failed:', err))
        }
      } catch (error) {
        console.log('Video autoplay blocked:', error)
      }
    }
    playVideos()
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* Background Videos */}
      <div className="fixed inset-0 z-0">
        {/* Blessed Side Background - Heaven Gate */}
        <div className="absolute left-0 top-0 w-1/2 h-full overflow-hidden">
          <video
            ref={blessedVideoRef}
            className="w-full h-full object-cover opacity-50"
            loop
            muted
            playsInline
            autoPlay
          >
            <source src={`/${encodeURIComponent('New folder (8)')}/Make_a_gate_202511041646_0jdzq.mp4`} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/40 via-blue-900/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
        </div>

        {/* Damned Side Background - Hell Gate */}
        <div className="absolute right-0 top-0 w-1/2 h-full overflow-hidden">
          <video
            ref={damnedVideoRef}
            className="w-full h-full object-cover opacity-50"
            loop
            muted
            playsInline
            autoPlay
          >
            <source src={`/${encodeURIComponent('New folder (8)')}/Make_a_gate_202511041646_j7tr4.mp4`} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-l from-red-900/40 via-orange-900/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
        </div>

        {/* Center Divider */}
        <div className="absolute left-1/2 top-0 w-1 h-full bg-gradient-to-b from-transparent via-[#ff0000]/50 to-transparent transform -translate-x-1/2" />
        <div className="absolute left-1/2 top-0 w-2 h-full bg-gradient-to-b from-transparent via-[#ff0000]/20 to-transparent transform -translate-x-1/2 blur-sm" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="text-center py-8 px-4">
          <h1 className="text-6xl md:text-8xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-500 to-red-600 bg-clip-text text-transparent animate-pulse">
            THE MORAL LEDGER
          </h1>
          <div className="w-48 h-1 bg-gradient-to-r from-transparent via-[#ff0000] to-transparent mx-auto mb-4" />
          <p className="text-xl text-[#ff6b6b] font-semibold tracking-wider">
            The Balance of Light and Darkness
          </p>
        </header>

                 {/* Main Content */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 px-4 pb-8">
          {/* Blessed Side */}
          <div className="relative">
            <div className="sticky top-8">
              <h2 className="text-3xl font-bold text-center mb-4 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                ✨ BLESSED ✨
              </h2>
              <div className="space-y-2">
                {blessedSlots.map((slot, index) => (
                  <div
                    key={slot.id}
                    className={`relative bg-gradient-to-r from-cyan-900/60 to-blue-900/60 border-2 rounded-lg p-2 transition-all duration-300 transform hover:scale-105 ${
                      slot.filled
                        ? 'border-cyan-400 shadow-lg shadow-cyan-500/50'
                        : 'border-cyan-700/50 hover:border-cyan-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                          slot.filled
                            ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-500/50'
                            : 'bg-cyan-900/50 text-cyan-400 border border-cyan-700'
                        }`}>
                          {slot.filled ? '✓' : index + 1}
                        </div>
                        <div>
                          <div className="text-white font-semibold text-sm">{slot.name}</div>
                          {slot.filled && slot.data && (
                            <div className="text-cyan-300 text-xs">{slot.data}</div>
                          )}
                        </div>
                      </div>
                      {!slot.filled && (
                        <div className="text-cyan-600/50 text-xs uppercase tracking-wider">
                          Empty
                        </div>
                      )}
                    </div>
                    {slot.filled && (
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent rounded-lg pointer-events-none" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Damned Side */}
          <div className="relative">
            <div className="sticky top-8">
              <h2 className="text-3xl font-bold text-center mb-4 text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.5)]">
                🔥 DAMNED 🔥
              </h2>
              <div className="space-y-2">
                {damnedSlots.map((slot, index) => (
                  <div
                    key={slot.id}
                    className={`relative bg-gradient-to-r from-red-900/60 to-orange-900/60 border-2 rounded-lg p-2 transition-all duration-300 transform hover:scale-105 ${
                      slot.filled
                        ? 'border-red-400 shadow-lg shadow-red-500/50'
                        : 'border-red-700/50 hover:border-red-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                          slot.filled
                            ? 'bg-red-400 text-black shadow-lg shadow-red-500/50'
                            : 'bg-red-900/50 text-red-400 border border-red-700'
                        }`}>
                          {slot.filled ? '✗' : index + 1}
                        </div>
                        <div>
                          <div className="text-white font-semibold text-sm">{slot.name}</div>
                          {slot.filled && slot.data && (
                            <div className="text-red-300 text-xs">{slot.data}</div>
                          )}
                        </div>
                      </div>
                      {!slot.filled && (
                        <div className="text-red-600/50 text-xs uppercase tracking-wider">
                          Empty
                        </div>
                      )}
                    </div>
                    {slot.filled && (
                      <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent rounded-lg pointer-events-none" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <footer className="text-center py-6 px-4 border-t border-[#ff0000]/30">
          <div className="flex justify-center gap-8 text-sm">
            <div className="text-cyan-400">
              <div className="text-2xl font-bold">{blessedSlots.filter(s => s.filled).length}/10</div>
              <div className="text-xs uppercase tracking-wider">Blessed</div>
            </div>
            <div className="text-[#ff0000]">|</div>
            <div className="text-red-400">
              <div className="text-2xl font-bold">{damnedSlots.filter(s => s.filled).length}/10</div>
              <div className="text-xs uppercase tracking-wider">Damned</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
