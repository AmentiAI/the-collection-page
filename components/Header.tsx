'use client'

import { useEffect, useState } from 'react'
import dynamicImport from 'next/dynamic'
import Link from 'next/link'

// Lazy load WalletConnect to prevent LaserEyes from loading immediately
const WalletConnect = dynamicImport(() => import('./WalletConnect'), {
  ssr: false,
  loading: () => <div className="px-4 py-2 bg-[#8B0000] text-white rounded font-bold text-sm uppercase">Loading...</div>
})

interface HeaderProps {
  isHolder?: boolean
  isVerifying?: boolean
  connected?: boolean
  onHolderVerified?: (isHolder: boolean, address?: string) => void
  onVerifyingStart?: () => void
  onConnectedChange?: (connected: boolean) => void
  musicVolume?: number
  onMusicVolumeChange?: (volume: number) => void
  isMusicMuted?: boolean
  onMusicMutedChange?: (muted: boolean) => void
}

export default function Header({ 
  isHolder, 
  isVerifying, 
  connected, 
  onHolderVerified, 
  onVerifyingStart, 
  onConnectedChange,
  musicVolume = 30,
  onMusicVolumeChange,
  isMusicMuted = false,
  onMusicMutedChange
}: HeaderProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [shake, setShake] = useState(false)
  const title = 'THE DAMNED'

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % title.length)
    }, 200)

    return () => clearInterval(interval)
  }, [title.length])

  useEffect(() => {
    const shakeInterval = setInterval(() => {
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }, 6000)

    return () => clearInterval(shakeInterval)
  }, [])

  return (
    <header className="relative z-20 text-center py-3 px-4 bg-gradient-to-b from-[rgba(139,0,0,0.9)] to-[rgba(0,0,0,0.9)] border-b-[3px] border-[#8B0000] shadow-[0_4px_20px_rgba(139,0,0,0.5)]">
      <div className="flex justify-center items-center gap-2 sm:gap-4 flex-wrap">
        <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black uppercase tracking-widest mb-1">
          {title.split('').map((letter, index) => (
            <span
              key={index}
              className={index === currentIndex ? 'text-[#ff0000] drop-shadow-[0_0_15px_#ff0000]' : 'text-[#ff0000]'}
              style={{ textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000' }}
            >
              {letter === ' ' ? '\u00A0' : letter}
            </span>
          ))}
        </h1>
        <a 
          href="https://x.com/The__Damned__" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[#ff0000] hover:text-[#ff6b6b] transition-colors duration-200 animate-pulse"
          style={{ filter: 'drop-shadow(2px 2px 0 #000) drop-shadow(-2px -2px 0 #000) drop-shadow(2px -2px 0 #000) drop-shadow(-2px 2px 0 #000)' }}
          aria-label="Follow on X"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            className="sm:w-8 sm:h-8 drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]"
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M13.317 10.774c2.412-.005 4.165-1.99 4.38-2.274-.218.11-.46.205-.696.276a5.51 5.51 0 0 1-.746.34 3.62 3.62 0 0 0 1.41-1.996c-.698.42-1.476.707-2.306.868a3.48 3.48 0 0 0-5.926 3.174 9.875 9.875 0 0 1-7.176-3.636 3.49 3.49 0 0 0 1.076 4.645 3.396 3.396 0 0 1-1.573-.434v.044c0 1.507 1.074 2.764 2.5 3.05a3.539 3.539 0 0 1-1.573.06c.444 1.379 1.73 2.393 3.26 2.422A6.961 6.961 0 0 1 3.5 17.99 9.952 9.952 0 0 0 10.075 21c6.591 0 10.183-5.46 10.183-10.19 0-.155-.003-.311-.01-.468.699-.498 1.304-1.125 1.782-1.843-.65.288-1.342.48-2.063.567a3.497 3.497 0 0 0 1.534-1.927 6.944 6.944 0 0 1-2.204.85 3.497 3.497 0 0 0-5.995 3.186 9.914 9.914 0 0 1-7.073 3.585z"/>
          </svg>
        </a>
        <a 
          href="https://discord.gg/vJ4yw9N55j" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[#ff0000] hover:text-[#ff6b6b] transition-colors duration-200 animate-pulse"
          style={{ filter: 'drop-shadow(2px 2px 0 #000) drop-shadow(-2px -2px 0 #000) drop-shadow(2px -2px 0 #000) drop-shadow(-2px 2px 0 #000)' }}
          aria-label="Join Discord"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            className="sm:w-8 sm:h-8 drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]"
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.128 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        </a>
        <a 
          href="https://magiceden.us/ordinals/marketplace/the-damned" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[#ff0000] hover:text-[#ff6b6b] transition-colors duration-200 animate-pulse"
          style={{ filter: 'drop-shadow(2px 2px 0 #000) drop-shadow(-2px -2px 0 #000) drop-shadow(2px -2px 0 #000) drop-shadow(-2px 2px 0 #000)' }}
          aria-label="View on Magic Eden"
          title="Magic Eden"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            className="sm:w-8 sm:h-8 drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]"
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </a>
        <Link 
          href="/gatesofthedamned"
          className="text-[#ff0000] hover:text-[#ff6b6b] transition-colors duration-200 font-bold text-sm sm:text-base md:text-lg uppercase tracking-wider px-3 py-1 border-2 border-[#ff0000] rounded hover:bg-[#ff0000]/20"
          style={{ filter: 'drop-shadow(2px 2px 0 #000) drop-shadow(-2px -2px 0 #000) drop-shadow(2px -2px 0 #000) drop-shadow(-2px 2px 0 #000)' }}
        >
          🔥 GATES
        </Link>
      </div>
      <div className="flex justify-center items-center gap-4 mt-2 flex-wrap">
        <p className="text-base text-[#ff6b6b] uppercase tracking-wide">Ordinals Collection</p>
        <WalletConnect 
          onHolderVerified={onHolderVerified}
          onVerifyingStart={onVerifyingStart}
          onConnectedChange={onConnectedChange}
        />
        {connected && (isVerifying || isHolder !== undefined) && (
          <div className="text-sm font-bold">
            {isVerifying ? (
              <span className="text-[#ff6b6b] animate-pulse">Verifying...</span>
            ) : isHolder ? (
              <span className="text-[#00ff00]">✓ The Damned Holder</span>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="text-[#ff6b6b]">Not A Holder</span>
                <span className="text-xs text-[#ff6b6b] opacity-80">Buy a The Damned Ordinal To Get Verified</span>
              </div>
            )}
          </div>
        )}
        {/* Music Volume Control */}
        <div className="flex items-center gap-2 bg-black/60 rounded-lg px-3 py-1 border border-[#8B0000]/50">
          <button
            onClick={() => onMusicMutedChange?.(!isMusicMuted)}
            className="text-[#ff0000] hover:text-[#ff6b6b] transition-colors"
            aria-label={isMusicMuted ? 'Unmute music' : 'Mute music'}
          >
            {isMusicMuted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={musicVolume}
            onChange={(e) => onMusicVolumeChange?.(Number(e.target.value))}
            disabled={isMusicMuted}
            className="w-20 accent-red-600"
          />
          <span className="text-xs text-[#ff6b6b] font-mono w-8">
            {isMusicMuted ? 'MUTED' : `${musicVolume}%`}
          </span>
        </div>
      </div>
    </header>
  )
}
