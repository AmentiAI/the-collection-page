'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// Target: Nov 18, 2025 3:00 PM EST = 20:00 UTC
const GATES_EVENT_UTC = Date.parse('2025-11-18T20:00:00Z')

export default function GatesOfTheDamnedPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [showEntryModal, setShowEntryModal] = useState(true)
  const [volume, setVolume] = useState(30)
  const [isMuted, setIsMuted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [countdown, setCountdown] = useState<string | null>(null)
  const [eventStatus, setEventStatus] = useState<'upcoming' | 'active' | 'ended'>('upcoming')
  const isCountdownComplete = eventStatus === 'ended'
  const audioSrc = '/gates-audio.mp3'

  const handleEnter = () => {
    setShowEntryModal(false)
    // Small delay to ensure modal is closed before playing
    setTimeout(() => {
      if (audioRef.current) {
        console.log('Attempting to play audio...')
        console.log('Audio element readyState:', audioRef.current.readyState)
        console.log('Audio element src:', audioRef.current.src)
        
        // Ensure audio is loaded
        if (audioRef.current.readyState === 0) {
          audioRef.current.load()
        }

        // Wait for audio to be ready
        const playAudio = () => {
          audioRef.current?.play().then(() => {
            setIsPlaying(true)
            console.log('Audio started playing successfully')
          }).catch((error) => {
            console.error('Audio playback failed:', error)
            console.error('Error name:', error.name)
            console.error('Error message:', error.message)
            // Try to play again after a short delay
            setTimeout(() => {
              if (audioRef.current) {
                audioRef.current.play().then(() => {
                  setIsPlaying(true)
                  console.log('Audio started on retry')
                }).catch((err) => {
                  console.error('Retry audio playback failed:', err)
                })
              }
            }, 500)
          })
        }
        
        if (audioRef.current.readyState >= 2) {
          playAudio()
        } else {
          audioRef.current.addEventListener('canplay', playAudio, { once: true })
        }
      }

      if (videoRef.current) {
        const playVideoWithSound = () => {
          if (!videoRef.current) return
          videoRef.current.muted = isMuted
          if (!isMuted) {
            videoRef.current.volume = volume / 100
          }
          videoRef.current!.play().catch((err) => {
            console.error('Video playback failed:', err)
          })
        }

        if (videoRef.current.readyState >= 2) {
          playVideoWithSound()
        } else {
          videoRef.current.addEventListener('canplay', playVideoWithSound, { once: true })
        }
      }
    }, 100)
  }

  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current
      const handlePlay = () => setIsPlaying(true)
      const handlePause = () => setIsPlaying(false)
      
      audio.addEventListener('play', handlePlay)
      audio.addEventListener('pause', handlePause)
      
      return () => {
        audio.removeEventListener('play', handlePlay)
        audio.removeEventListener('pause', handlePause)
      }
    }
  }, [])

  useEffect(() => {
    if (!Number.isFinite(GATES_EVENT_UTC)) {
      return
    }

    const formatCountdown = (ms: number) => {
      if (ms <= 0) {
        return '00:00:00'
      }
      const totalSeconds = Math.floor(ms / 1000)
      const days = Math.floor(totalSeconds / 86_400)
      const hours = Math.floor((totalSeconds % 86_400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60

      const segments: string[] = []
      if (days > 0) {
        segments.push(days.toString().padStart(2, '0'))
      }
      segments.push(hours.toString().padStart(2, '0'))
      segments.push(minutes.toString().padStart(2, '0'))
      segments.push(seconds.toString().padStart(2, '0'))
      return segments.join(':')
    }

    const updateCountdown = () => {
      const now = Date.now()
      const diff = GATES_EVENT_UTC - now
      if (diff <= 0) {
        setCountdown('00:00:00')
        setEventStatus('ended')
        return false
      }
      setCountdown(formatCountdown(diff))
      setEventStatus('upcoming')
      return true
    }

    const continueUpdating = updateCountdown()
    if (!continueUpdating) {
      return
    }

    const intervalId = window.setInterval(() => {
      const shouldContinue = updateCountdown()
      if (!shouldContinue) {
        window.clearInterval(intervalId)
      }
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }

    if (videoRef.current) {
      videoRef.current.muted = showEntryModal || isMuted
      if (!showEntryModal && !isMuted) {
        videoRef.current.volume = volume / 100
      }
    }
  }, [volume, isMuted, showEntryModal])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    class Particle {
      x: number
      y: number
      vx: number
      vy: number
      life: number
      maxLife: number
      color: string
      size: number

      constructor(canvasWidth: number, canvasHeight: number) {
        this.x = Math.random() * canvasWidth
        this.y = canvasHeight + 10
        this.vx = (Math.random() - 0.5) * 2
        this.vy = -Math.random() * 6 - 3
        this.life = 0
        this.maxLife = Math.random() * 100 + 60
        this.size = Math.random() * 2 + 1

        const colors = [
          'rgba(255, 140, 0, ',
          'rgba(255, 165, 0, ',
          'rgba(255, 69, 0, ',
          'rgba(255, 200, 50, ',
          'rgba(220, 20, 60, ',
        ]
        this.color = colors[Math.floor(Math.random() * colors.length)]
      }

      update() {
        this.x += this.vx
        this.y += this.vy
        this.life++
        this.vy *= 0.98
        this.vx *= 0.99
      }

      draw(ctx: CanvasRenderingContext2D) {
        const opacity = Math.max(0, 1 - this.life / this.maxLife)
        ctx.fillStyle = this.color + opacity + ')'
        ctx.fillRect(this.x, this.y, this.size, this.size)
      }

      isDead() {
        return this.life >= this.maxLife
      }
    }

    const particles: Particle[] = []
    const maxParticles = 500

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (particles.length < maxParticles) {
        for (let i = 0; i < 10; i++) {
          particles.push(new Particle(canvas.width, canvas.height))
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update()
        particles[i].draw(ctx)

        if (particles[i].isDead()) {
          particles.splice(i, 1)
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <audio 
        ref={audioRef} 
        src={audioSrc}
        loop
        preload="auto"
        onError={(e) => {
          console.error('Audio load error:', e)
          console.error('Audio src attempted:', audioSrc)
          console.error('Audio element src:', audioRef.current?.src)
          if (e.currentTarget.error) {
            console.error('Error code:', e.currentTarget.error.code)
            console.error('Error message:', e.currentTarget.error.message)
          }
        }}
        onLoadedData={() => {
          console.log('Audio loaded successfully')
          console.log('Audio src:', audioRef.current?.src)
        }}
        onCanPlay={() => {
          console.log('Audio can play')
        }}
        onLoadStart={() => {
          console.log('Audio load started')
        }}
      />

      {/* Volume Control */}
      <div className="absolute top-4 right-4 z-30 flex flex-col items-center gap-2 bg-black/80 backdrop-blur-sm border-2 border-red-600/50 rounded-lg p-4">
        <button
          onClick={() => {
            const audio = audioRef.current
            const video = videoRef.current

            if (!audio) return

            if (audio.paused) {
              if (!isMuted) {
                audio.volume = volume / 100
              }
              audio
                .play()
                .then(() => {
                  setIsPlaying(true)
                  if (video && !isMuted) {
                    video.muted = false
                    video.volume = volume / 100
                    if (video.paused) {
                      video.play().catch((err) => {
                        console.error('Video play failed:', err)
                      })
                    }
                  }
                })
                .catch((error) => {
                  console.error('Audio play failed:', error)
                })
            } else {
              audio.pause()
              if (video) {
                video.muted = true
                video.volume = 0
              }
              setIsPlaying(false)
            }
          }}
          className="text-red-600 hover:text-red-500 transition-colors"
          aria-label="Play/Pause"
        >
          {!isPlaying ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="text-red-600 hover:text-red-500 transition-colors"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
        <div className="h-32 flex items-center">
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            disabled={isMuted}
            className="h-full w-2 accent-red-600"
            style={{ writingMode: 'vertical-lr' }}
          />
        </div>
        <span className="text-xs text-red-600 font-mono">{isMuted ? 'MUTED' : `${volume}%`}</span>
      </div>

      {/* Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md">
          <div className="bg-black/95 border-2 border-red-600/50 rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold font-mono">
                <span className="bg-gradient-to-r from-red-600 via-orange-600 to-red-600 bg-clip-text text-transparent">
                  GATES OF THE DAMNED
                </span>
              </h2>
              <div className="text-gray-400 font-mono pt-4 space-y-4">
                <div className="text-lg">You stand before the eternal gates.</div>
                <div className="text-sm">Once you enter, there is no turning back.</div>
                <div className="text-xs text-red-600/70 italic">&quot;Abandon all hope, ye who enter here...&quot;</div>
              </div>
            </div>
            <div className="flex justify-center pt-4">
              <button
                onClick={handleEnter}
                className="w-full px-6 py-3 text-xl font-mono tracking-wider bg-red-600 hover:bg-red-700 border-2 border-red-600/50 text-white rounded transition-colors"
              >
                ENTER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Video */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute left-1/2 top-1/2 h-full w-auto min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
          src="/construction.mp4"
          autoPlay
          loop
          muted={showEntryModal}
          playsInline
        />
      </div>

      {/* Particle Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none" />

      {/* Running Characters */}
      <div className="absolute inset-0 z-5 pointer-events-none overflow-hidden">
        {/* Character 1 - Right to Left at 0s */}
        <div
          className="absolute bottom-[-50px] w-32 h-64 md:w-40 md:h-72 animate-run-across"
          style={{ animationDelay: '0s', left: '100%' }}
        >
          <div className="relative w-full h-full overflow-hidden animate-tilt-run-fast">
            <img src="/damned-character-1.png" alt="" className="absolute top-0 left-0 w-full h-full object-contain" />
          </div>
        </div>

        {/* Character 2 - Right to Left at 2.5s */}
        <div
          className="absolute bottom-[-50px] w-32 h-64 md:w-40 md:h-72 animate-run-across"
          style={{ animationDelay: '2.5s', left: '100%' }}
        >
          <div className="relative w-full h-full overflow-hidden animate-tilt-run-slow">
            <img src="/damned-character-2.png" alt="" className="absolute top-0 left-0 w-full h-full object-contain" />
          </div>
        </div>

        {/* Character 3 - Left to Right at 5s */}
        <div
          className="absolute bottom-[-50px] w-32 h-64 md:w-40 md:h-72 animate-run-across-reverse"
          style={{ animationDelay: '5s', left: '-20%' }}
        >
          <div className="relative w-full h-full overflow-hidden animate-tilt-run">
            <img
              src="/damned-character-3.png"
              alt=""
              className="absolute top-0 left-0 w-full h-full object-contain"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>
        </div>

        {/* Character 4 - Right to Left at 7.5s */}
        <div
          className="absolute bottom-[-50px] w-32 h-64 md:w-40 md:h-72 animate-run-across"
          style={{ animationDelay: '7.5s', left: '100%' }}
        >
          <div className="relative w-full h-full overflow-hidden animate-tilt-run-slower">
            <img src="/damned-character-4.png" alt="" className="absolute top-0 left-0 w-full h-full object-contain" />
          </div>
        </div>

        {/* Character 6 - Left to Right at 10s */}
        <div
          className="absolute bottom-[-50px] w-32 h-64 md:w-40 md:h-72 animate-run-across-reverse"
          style={{ animationDelay: '10s', left: '-20%' }}
        >
          <div className="relative w-full h-full overflow-hidden animate-tilt-run-fast">
            <img
              src="/damned-character-6.png"
              alt=""
              className="absolute top-0 left-0 w-full h-full object-contain"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>
        </div>

        {/* Character 7 - Left to Right at 12.5s */}
        <div
          className="absolute bottom-[-50px] w-32 h-64 md:w-40 md:h-72 animate-run-across-reverse"
          style={{ animationDelay: '12.5s', left: '-20%' }}
        >
          <div className="relative w-full h-full overflow-hidden animate-tilt-run-slow">
            <img src="/damned-character-7.png" alt="" className="absolute top-0 left-0 w-full h-full object-contain" />
          </div>
        </div>

        {/* Character 8 - Left to Right at 2s */}
        <div
          className="absolute bottom-[-50px] w-32 h-64 md:w-40 md:h-72 animate-run-across-reverse"
          style={{ animationDelay: '2s', left: '-20%' }}
        >
          <div className="relative w-full h-full overflow-hidden animate-tilt-run-slower">
            <img src="/damned-character-8.png" alt="" className="absolute top-0 left-0 w-full h-full object-contain" />
          </div>
        </div>

        {/* Character 9 - Left to Right at 12s */}
        <div
          className="absolute bottom-[-50px] w-32 h-64 md:w-40 md:h-72 animate-run-across-reverse"
          style={{ animationDelay: '12s', left: '-20%' }}
        >
          <div className="relative w-full h-full overflow-hidden animate-tilt-run">
            <img src="/damned-character-9.png" alt="" className="absolute top-0 left-0 w-full h-full object-contain" />
          </div>
        </div>
      </div>


      {/* Main Content */}
      <div className="relative z-20 flex min-h-screen flex-col items-center justify-center p-4">
        <div className="max-w-4xl w-full space-y-8 text-center">
          <div className="space-y-8">
         

            <div className="bg-black/80 backdrop-blur-sm border-2 border-red-600/50 rounded-lg p-8 md:p-12 space-y-8">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-red-600 via-orange-600 to-red-600 bg-clip-text text-transparent">
                GATES OF THE DAMNED
              </span>
            </h1>
              <div className="space-y-6">
                <p className="text-base md:text-lg text-red-500 font-mono tracking-widest uppercase">
                  UNDER CONSTRUCTION 
                </p>
                <div className="space-y-2">
                  <p className="text-xs md:text-sm text-red-300 font-mono tracking-[0.45em] uppercase">
                    Gates reopen November 15 · 3:00 PM EST
                  </p>
                  <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center rounded-lg border border-red-600/60 bg-black/60 px-6 py-4">
                    <span className="text-[11px] font-mono uppercase tracking-[0.4em] text-red-400">
                      Countdown
                    </span>
                    <span className="mt-2 font-mono text-3xl tracking-[0.35em] text-red-200">
                      {isCountdownComplete ? '00:00:00' : countdown ?? '— — : — — : — —'}
                    </span>
                  </div>
                </div>
                {isCountdownComplete && (
                  <div className="space-y-4">
                    <p className="text-2xl md:text-3xl font-bold font-mono tracking-[0.4em] uppercase text-red-500">
                      STILL CLOSED!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

