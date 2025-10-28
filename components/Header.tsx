'use client'

import { useEffect, useState } from 'react'

export default function Header() {
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
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-widest mb-1">
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
      <p className="text-base text-[#ff6b6b] uppercase tracking-wide">Ordinals Collection</p>
    </header>
  )
}
