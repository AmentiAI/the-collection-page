'use client'

import Image from 'next/image'
import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react'

type Walker = {
  key: string
  src: string
  duration: number
  flip?: boolean
}

type FallenCharacter = {
  id: string
  src: string
  top: number
  left: number
  rotation: number
}

type ActiveWalker = {
  id: string
  walker: Walker
  slashTimeoutId?: number
}

const walkers: Walker[] = [
  { key: 'damned-1', src: '/fullguy1.png', duration: 7.4 },
  { key: 'damned-2', src: '/fullguy2.png', duration: 7.8, flip: true },
  { key: 'damned-3', src: '/fullguy3.png', duration: 7.6, flip: true },
  { key: 'damned-4', src: '/fullguys4.png', duration: 7.5 },
  { key: 'damned-5', src: '/fallguy5.png', duration: 7.3 },
  { key: 'damned-6', src: '/fallguy6.png', duration: 7.7, flip: true },
  { key: 'damned-7', src: '/fullguy7.png', duration: 7.5 },
  { key: 'damned-8', src: '/fullguy8.png', duration: 7.5 },
  { key: 'damned-9', src: '/fullguy9.png', duration: 7.4 },
]

const BASE_LEFT_PERCENT = 72
const BASE_TOP_PERCENT = 110
const HORIZONTAL_JITTER_PERCENT = 18
const HORIZONTAL_JITTER_FALLOFF_STEP = 20
const HORIZONTAL_JITTER_REDUCTION = 0.5
const MIN_HORIZONTAL_JITTER_PERCENT = 8
const VERTICAL_STEP_PERCENT = 0.5
const ROTATION_VARIANCE_DEGREES = 30

export default function AbyssPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const slashAudioRef = useRef<HTMLAudioElement>(null)
  const [showEntryModal, setShowEntryModal] = useState(true)
  const [volume, setVolume] = useState(35)
  const [isMuted, setIsMuted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [fallenPile, setFallenPile] = useState<FallenCharacter[]>([])
  const [activeWalkers, setActiveWalkers] = useState<ActiveWalker[]>([])
  const audioSrc = '/music/abyss.mp3'

  const handleEnter = () => {
    setShowEntryModal(false)
    setTimeout(() => {
      if (audioRef.current) {
        if (audioRef.current.readyState === 0) {
          audioRef.current.load()
        }

        const playAudio = () => {
          audioRef.current
            ?.play()
            .then(() => setIsPlaying(true))
            .catch((error) => {
              console.error('Audio playback failed:', error)
              setTimeout(() => {
                audioRef.current
                  ?.play()
                  .then(() => setIsPlaying(true))
                  .catch((err) => console.error('Retry audio playback failed:', err))
              }, 400)
            })
        }

        if (audioRef.current.readyState >= 2) {
          playAudio()
        } else {
          audioRef.current.addEventListener('canplay', playAudio, { once: true })
        }
      }
    }, 120)
  }

  useEffect(() => {
    if (!audioRef.current) return
    const audio = audioRef.current
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [])

  useEffect(() => {
    const main = audioRef.current
    const slash = slashAudioRef.current
    const level = isMuted ? 0 : volume / 100
    if (main) {
      main.volume = level
    }
    if (slash) {
      slash.volume = level
    }
  }, [volume, isMuted])

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

      constructor(canvasWidth: number, canvasHeight: number, options?: { x?: number; y?: number; burst?: boolean }) {
        const isBurst = Boolean(options?.burst)
        this.x = options?.x ?? Math.random() * canvasWidth
        this.y = options?.y ?? canvasHeight + 10
        if (isBurst) {
          const angle = (Math.random() - 0.5) * Math.PI
          const speed = Math.random() * 6 + 4
          this.vx = Math.cos(angle) * speed
          this.vy = Math.sin(angle) * speed - 6
          this.maxLife = Math.random() * 40 + 40
        } else {
          this.vx = (Math.random() - 0.5) * 2
          this.vy = -Math.random() * 6 - 3
          this.maxLife = Math.random() * 100 + 60
        }
        this.life = 0
        this.size = isBurst ? Math.random() * 2.5 + 1.5 : Math.random() * 2 + 1

        const colors = [
          'rgba(255, 120, 0, ',
          'rgba(255, 160, 0, ',
          'rgba(255, 200, 40, ',
          'rgba(255, 255, 120, ',
          'rgba(255, 80, 0, ',
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

      draw(context: CanvasRenderingContext2D) {
        const opacity = Math.max(0, 1 - this.life / this.maxLife)
        context.fillStyle = this.color + opacity + ')'
        context.beginPath()
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        context.fill()
      }

      isDead() {
        return this.life >= this.maxLife
      }
    }

    const particles: Particle[] = []
    const maxParticles = 520

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

      requestAnimationFrame(animate)
    }

    animate()

    const emitBurst = (leftPercent = BASE_LEFT_PERCENT, topPercent = BASE_TOP_PERCENT) => {
      const originX = (leftPercent / 100) * canvas.width
      const originY = (topPercent / 100) * canvas.height
      const burstCount = 160
      for (let i = 0; i < burstCount; i++) {
        particles.push(
          new Particle(canvas.width, canvas.height, {
            x: originX + (Math.random() - 0.5) * 80,
            y: originY - Math.random() * 20,
            burst: true,
          }),
        )
      }
    }

    emitBurstRef.current = emitBurst

    return () => {
      emitBurstRef.current = undefined
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

const emitBurstRef = useRef<(leftPercent?: number, topPercent?: number) => void>()

  const playSlash = useCallback(() => {
    const slash = slashAudioRef.current
    if (slash) {
      slash.currentTime = 0
      const promise = slash.play()
      if (promise) {
        promise.catch((error) => console.error('Slash audio play failed:', error))
      }
    }
  }, [])

  const handleWalkerFall = useCallback((walker: Walker) => {
    let impactLeft = BASE_LEFT_PERCENT
    let impactTop = BASE_TOP_PERCENT
    setFallenPile((prev) => {
      const index = prev.length
      const jitterReduction = Math.floor(index / HORIZONTAL_JITTER_FALLOFF_STEP) * HORIZONTAL_JITTER_REDUCTION
      const jitter = Math.max(MIN_HORIZONTAL_JITTER_PERCENT, HORIZONTAL_JITTER_PERCENT - jitterReduction)
      const left = BASE_LEFT_PERCENT + (Math.random() * 2 - 1) * jitter
      const top = BASE_TOP_PERCENT - index * VERTICAL_STEP_PERCENT
      impactLeft = left
      impactTop = top
      const rotation =
        84 + (Math.random() * 2 - 1) * ROTATION_VARIANCE_DEGREES

      const entry: FallenCharacter = {
        id: `${walker.key}-${Date.now()}-${index}`,
        src: walker.src,
        top,
        left,
        rotation,
      }

      return [...prev, entry]
    })
    emitBurstRef.current?.(impactLeft, impactTop)
  }, [])

  const walkerIndexRef = useRef(0)
  const SPAWN_SLASH_RATIO = 0.92

  const spawnWalker = useCallback(() => {
    const walker = walkers[walkerIndexRef.current % walkers.length]
    walkerIndexRef.current = (walkerIndexRef.current + 1) % walkers.length
    const id = `${walker.key}-${Date.now()}-${Math.random()}`
    const impactDelayMs = Math.max(0, walker.duration * SPAWN_SLASH_RATIO * 1000)
    const slashTimeoutId = window.setTimeout(() => playSlash(), impactDelayMs)
    setActiveWalkers((prev) => [...prev, { id, walker, slashTimeoutId }])
  }, [playSlash])

  const handleAnimationEnd = useCallback(
    (active: ActiveWalker) => {
      if (typeof active.slashTimeoutId === 'number') {
        window.clearTimeout(active.slashTimeoutId)
      }
      handleWalkerFall(active.walker)
      setActiveWalkers((prev) => prev.filter((entry) => entry.id !== active.id))
    },
    [handleWalkerFall],
  )

  useEffect(() => {
    if (showEntryModal) return

    spawnWalker()
    const SPAWN_INTERVAL_MS = 2400
    const intervalId = window.setInterval(spawnWalker, SPAWN_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [showEntryModal, spawnWalker])

  const fallenCount = fallenPile.length
  const totalDamned = 666
  const progressPercent = Math.min(100, (fallenCount / totalDamned) * 100)
  const remaining = Math.max(0, totalDamned - fallenCount)

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <audio
        ref={audioRef}
        src={audioSrc}
        loop
        preload="auto"
        onError={(e) => {
          console.error('Audio load error:', e)
          if (e.currentTarget.error) {
            console.error('Error code:', e.currentTarget.error.code)
            console.error('Error message:', e.currentTarget.error.message)
          }
        }}
      />
      <audio ref={slashAudioRef} src="/music/slash.mp3" preload="auto" />

      {/* Volume Control */}
      <div className="absolute top-4 right-4 z-30 flex flex-col items-center gap-1 rounded-lg border-2 border-red-600/50 bg-black/40 ">
      {/* Burn Counter + Warnings */}
      <div className="pointer-events-none z-30 flex   flex-col gap-4 ">
        <div className="pointer-events-auto w-full rounded-lg border border-red-700 bg-black/80 p-2 shadow-[0_0_25px_rgba(220,38,38,0.35)] backdrop-blur-sm">
          <div className="font-mono text-xs uppercase tracking-[0.4em] text-red-600">Abyssal Burn</div>
          <div className="mt-2 flex items-end gap-3">
            <div className="text-4xl font-black text-red-500">{fallenCount}</div>
            <div className="pb-[6px] text-sm text-gray-400">/ {totalDamned}</div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-red-900/50">
            <div
              className="h-full rounded bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 transition-[width] duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-red-400">
            <span>{progressPercent.toFixed(1)}% consumed</span>
            <span>{remaining} remain</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-red-500/80">
          <div className="rounded border border-red-700/50 bg-black/70 px-6 py-2 shadow-[0_0_22px_rgba(220,38,38,0.45)]">
            ⚠ Danger Zone ⚠
          </div>
          <div className="rounded border border-red-700/40 bg-black/60 px-5 py-1.5 text-red-400">
            Ordinals Lost Ahead
          </div>
          <div className="rounded border border-red-700/30 bg-black/50 px-4 py-1 text-orange-400">
            No Return Beyond This Edge
          </div>
        </div>
      </div>
        <button
          onClick={() => {
            if (!audioRef.current) return
            if (audioRef.current.paused) {
              audioRef.current
                .play()
                .then(() => setIsPlaying(true))
                .catch((error) => console.error('Audio play failed:', error))
            } else {
              audioRef.current.pause()
              setIsPlaying(false)
            }
          }}
          className="text-red-600 transition-colors hover:text-red-500"
          aria-label="Play/Pause"
        >
          {!isPlaying ? (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="text-red-600 transition-colors hover:text-red-500"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
        <div className="flex h-32 items-center">
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
        <span className="font-mono text-xs text-red-600">{isMuted ? 'MUTED' : `${volume}%`}</span>
      </div>

      {/* Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md">
          <div className="mx-4 w-full max-w-md rounded-lg border-2 border-red-600/50 bg-black/95 p-8">
            <div className="space-y-4 text-center">
              <h2 className="text-3xl font-bold font-mono">
                <span className="bg-gradient-to-r from-red-600 via-orange-500 to-red-600 bg-clip-text text-transparent">
                  DESCEND INTO THE ABYSS
                </span>
              </h2>
              <div className="space-y-4 pt-4 font-mono text-gray-400">
                <div className="text-lg">The cliff edge beckons the damned.</div>
                <div className="text-sm">Step forward and tumble with the rest.</div>
                <div className="text-xs italic text-red-600/70">&quot;Gravity claims all souls in time.&quot;</div>
              </div>
            </div>
            <div className="flex justify-center pt-4">
              <button
                onClick={handleEnter}
                className="w-full rounded border-2 border-red-600/50 bg-red-600 px-6 py-3 text-xl font-mono tracking-wider text-white transition-colors hover:bg-red-700"
              >
                ACCEPT THE FALL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background */}
      <div
        className="absolute inset-0 z-0 bg-left-top bg-no-repeat"
        style={{ backgroundImage: "url('/abyssbg.png')", backgroundSize: '100% 100%' }}
      />

      {/* Ember Canvas */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10" />

      {/* Characters marching and falling */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <div className="absolute left-[58%] top-[68%] h-40 w-40 rounded-full bg-red-900/25 blur-3xl" />
        <div className="relative h-full w-full translate-y-[15vh] md:translate-y-[10vh]">
          {fallenPile.map((fallen) => (
            <div
              className="pointer-events-none absolute z-30"
              style={{
                width: 'clamp(6rem, 8vw, 9rem)',
                height: 'clamp(10rem, 14vw, 16rem)',
                top: `${fallen.top}%`,
                left: `${fallen.left}%`,
                transform: `translateX(-50%) rotate(${fallen.rotation}deg)`,
              }}
              key={fallen.id}
            >
              <div className="relative h-full w-full">
                <Image
                  src={fallen.src}
                  alt="Fallen damned soul"
                  fill
                  sizes="(max-width: 768px) 96px, 128px"
                  className="object-contain opacity-95"
                  priority={false}
                />
              </div>
            </div>
          ))}
          {activeWalkers.map((active) => (
            <div
              key={active.id}
              className={`abyss-character ${active.walker.flip ? 'abyss-character--flipped' : ''}`}
              onAnimationEnd={() => handleAnimationEnd(active)}
              style={
                {
                  '--delay': '0s',
                  '--duration': `${active.walker.duration}s`,
                  animationIterationCount: 1,
                  animationFillMode: 'forwards',
                } as CSSProperties
              }
            >
              <div className="abyss-character-inner animate-tilt-run" style={{ transform: 'scaleX(1)', position: 'relative' }}>
                <Image
                  src={active.walker.src}
                  alt="Damned soul marching"
                  fill
                  sizes="(max-width: 768px) 96px, 140px"
                  className="object-contain"
                  priority={false}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

