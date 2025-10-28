'use client'

import { useRef, useState, useEffect } from 'react'
import BloodCanvas from './BloodCanvas'

interface SplashScreenProps {
  onEnter: () => void
}

export default function SplashScreen({ onEnter }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    const shakeInterval = setInterval(() => {
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }, 4000)

    return () => clearInterval(shakeInterval)
  }, [])

  const handleEnterClick = async () => {
    // Start music before entering
    const audio = document.querySelector('audio') as HTMLAudioElement
    if (audio) {
      try {
        await audio.play()
      } catch (err) {
        console.log('Music play failed:', err)
      }
    }
    onEnter()
  }

  return (
    <>
      <BloodCanvas />
      <div className={`fixed inset-0 z-40 flex flex-col items-center justify-center ${shake ? 'shake' : ''}`} style={{ background: 'transparent' }}>
        {/* Title */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black uppercase tracking-widest text-[#ff0000] mb-8 relative z-10 animate-pulse"
            style={{ 
              textShadow: '-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 0 0 20px rgba(255,0,0,0.8)',
              filter: 'drop-shadow(0 0 10px #8B0000)'
            }}>
          THE DAMNED
        </h1>

        <div className="aspect-video w-full max-w-3xl mx-auto px-8 relative z-10">
          <video
            ref={videoRef}
            src="/splash/Untitled video - Made with Clipchamp (33).mp4"
            className="w-full h-full object-contain"
            autoPlay
            muted
            playsInline
            loop
          />
        </div>
        
        <button
          onClick={handleEnterClick}
          className="absolute bottom-20 px-12 py-4 text-4xl font-black uppercase tracking-widest bg-[#ff0000] text-white border-4 border-black shadow-[0_0_30px_rgba(255,0,0,0.8)] hover:bg-[#8B0000] hover:shadow-[0_0_40px_rgba(255,0,0,1)] cursor-pointer animate-pulse transition-all"
          style={{ textShadow: '-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000' }}
        >
          ENTER
        </button>
      </div>
    </>
  )
}