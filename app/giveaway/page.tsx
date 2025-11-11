'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Skull, Zap, Trophy, Volume2, VolumeX } from 'lucide-react'

import { CountdownTimer } from '@/components/countdown-timer'

const ORDINAL_IMAGES = [
  {
    src: '/fcb5dff4cd2c43d4987c1508bcb1baa1eb382a46244bcb072462fab66cea7113i0.png',
    alt: 'The Damned Ordinal #1',
  },
  {
    src: '/ae6e5504a1a9119205ec50a796bdceca92671215407423bd0c3e3357d6c8c0c0i0.png',
    alt: 'The Damned Ordinal #2',
  },
  {
    src: '/65641758b5c5d64d11c72650dd832446beb9ee16a39c4597c70387b9e8006116i0.png',
    alt: 'The Damned Ordinal #3',
  },
  {
    src: '/324de14bd6840ad9d11d37f0ec4f220e725b08a492857cf540213607929dd81fi0.png',
    alt: 'The Damned Ordinal #4',
  },
  {
    src: '/42c883408e2cce2f4eed7bc34a722490d1b90d6b90e414de9f456d3dd8232de4i0.png',
    alt: 'The Damned Ordinal #5',
  },
]

export default function GiveawayPage() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(45)

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = isMuted ? 0 : volume / 100
  }, [volume, isMuted])

  const targetDate = useMemo(() => new Date('2025-11-11T04:00:00Z'), [])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <audio
        ref={audioRef}
        src="/music/The Damned.mp3"
        loop
        preload="auto"
        autoPlay
        onError={(event) => {
          const error = event.currentTarget.error
          console.error('Giveaway audio failed to load', error)
        }}
      />

      <div className="fixed inset-0 z-0 overflow-hidden">
        <video
          className="absolute left-1/2 top-1/2 h-full w-auto min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
          src="/construction.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.25),transparent_55%)]" />
      </div>

      <div className="absolute right-4 top-4 z-50 flex flex-col items-center gap-3 rounded-lg border border-red-600/40 bg-black/70 p-3 shadow-[0_0_15px_rgba(220,38,38,0.35)]">
        <button
          onClick={() => setIsMuted((prev) => !prev)}
          className="text-red-400 transition hover:text-red-200"
          aria-label={isMuted ? 'Unmute soundtrack' : 'Mute soundtrack'}
        >
          {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          className="h-[120px] w-1 accent-red-600"
          style={{ writingMode: 'vertical-rl' }}
          disabled={isMuted}
        />
        <span className="text-xs font-mono tracking-[0.35em] text-red-300">{isMuted ? 'MUTED' : `${volume}%`}</span>
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-16 md:px-8">
        <HeaderSection />
        <ContentCard targetDate={targetDate} />
        <footer className="mt-16 text-center text-xs uppercase tracking-[0.35em] text-red-300">
          The Damned Collection © {new Date().getFullYear()} • All rites reserved.
        </footer>
      </main>
    </div>
  )
}

function HeaderSection() {
  return (
    <section className="mb-12 text-center">
      <div className="mb-6 flex items-center justify-center gap-4">
        <Skull className="h-10 w-10 text-red-500 drop-shadow-[0_0_12px_rgba(220,38,38,0.65)] animate-pulse" />
        <h1 className="font-mono text-5xl font-bold tracking-[0.35em] text-white drop-shadow-[0_0_26px_rgba(220,38,38,0.75)] md:text-7xl">
          THE DAMNED
        </h1>
        <Skull className="h-10 w-10 text-red-500 drop-shadow-[0_0_12px_rgba(220,38,38,0.65)] animate-pulse" />
      </div>
      <p className="text-lg uppercase tracking-[0.5em] text-red-300 md:text-xl">
        Exclusive Ordinal Giveaway • Limited Time
      </p>
    </section>
  )
}

interface ContentCardProps {
  targetDate: Date
}

function ContentCard({ targetDate }: ContentCardProps) {
  return (
    <section className="mx-auto w-full max-w-5xl rounded-3xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_30px_rgba(220,38,38,0.35)] backdrop-blur md:p-10">
      <div className="mb-6 rounded-2xl border border-red-600/50 bg-red-900/20 p-4 text-center shadow-[0_0_20px_rgba(220,38,38,0.35)]">
        <div className="flex items-center justify-center gap-3 text-sm uppercase tracking-[0.45em] text-red-200">
          <Zap className="h-5 w-5 text-red-400" />
          Limited Time Offer — Act Before The Countdown Ends
          <Zap className="h-5 w-5 text-red-400" />
        </div>
      </div>

      <div className="mb-10 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-4 rounded-2xl border border-red-600/40 bg-red-900/25 px-8 py-4 shadow-[0_0_20px_rgba(220,38,38,0.3)]">
          <Trophy className="h-10 w-10 text-red-400" />
          <div className="text-left">
            <p className="text-5xl font-black text-red-500 md:text-6xl">5</p>
            <p className="text-xs uppercase tracking-[0.4em] text-red-200/90">Rare Ordinals</p>
          </div>
        </div>
        <h2 className="text-3xl font-bold text-white md:text-4xl">
          Win Exclusive Ordinals from <span className="text-red-400">The Damned</span> Collection
        </h2>
        <p className="mt-4 text-lg text-red-200/80 md:text-xl">
          Any purchase within the next hour automatically enters you to win one of five hand-selected ordinals.
        </p>
      </div>

      <OrdinalGallery />

      <div className="mt-10">
        <CountdownTimer
          targetDate={targetDate}
          label="Giveaway ends in"
          className="rounded-2xl border border-red-600/40 bg-black/60 p-6 shadow-[0_0_20px_rgba(220,38,38,0.25)]"
        />
      </div>

      <div className="mt-10 text-center">
        <Link
          href="https://magiceden.us/ordinals/marketplace/the-damned"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500 bg-red-600 px-10 py-5 text-lg font-semibold tracking-[0.35em] text-red-100 shadow-[0_0_22px_rgba(220,38,38,0.45)] transition duration-300 hover:scale-[1.03] hover:bg-red-500"
        >
          Buy Now &amp; Enter Giveaway
        </Link>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <InfoCard
          icon={<Trophy className="h-6 w-6 text-red-400" />}
          title="Five Winners"
          description="Each winner receives a legendary ordinal from The Damned vault."
        />
        <InfoCard
          icon={<Zap className="h-6 w-6 text-red-400" />}
          title="Auto Entry"
          description="Every qualifying purchase automatically enters you—no extra steps."
        />
        <InfoCard
          icon={<Skull className="h-6 w-6 text-red-400" />}
          title="Rare Provenance"
          description="Curated pieces destined for those ready to walk beyond the veil."
        />
      </div>
    </section>
  )
}

function OrdinalGallery() {
  return (
    <div>
      <h3 className="mb-6 text-center text-xl font-semibold uppercase tracking-[0.35em] text-red-200">
        Win One of These 5 Ordinals
      </h3>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {ORDINAL_IMAGES.map((ordinal, index) => (
          <div
            key={ordinal.src}
            className="group relative aspect-square overflow-hidden rounded-lg border border-red-600/30 bg-black/60 shadow-[0_0_20px_rgba(220,38,38,0.25)] transition duration-300 hover:-translate-y-1 hover:border-red-500"
            style={{ transitionDelay: `${index * 40}ms` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-red-900/50 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
            <Image
              src={ordinal.src}
              alt={ordinal.alt}
              fill
              className="object-cover transition duration-500 group-hover:scale-110"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

interface InfoCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

function InfoCard({ icon, title, description }: InfoCardProps) {
  return (
    <div className="rounded-2xl border border-red-600/30 bg-black/60 p-5 text-center shadow-[0_0_18px_rgba(220,38,38,0.25)] transition hover:-translate-y-1">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/40">{icon}</div>
      <h4 className="text-lg font-semibold text-red-200">{title}</h4>
      <p className="mt-2 text-sm text-red-200/70">{description}</p>
    </div>
  )
}


