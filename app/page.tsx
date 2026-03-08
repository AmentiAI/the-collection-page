'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useLaserEyes } from '@omnisat/lasereyes'
import dynamicImport from 'next/dynamic'
import Image from 'next/image'
import BloodCanvas from '@/components/BloodCanvas'
import Header from '@/components/Header'
import Filters from '@/components/Filters'
import Gallery from '@/components/Gallery'
import Modal from '@/components/Modal'
import SplashScreen from '@/components/SplashScreen'
import FighterSelect from '@/components/FighterSelect'
import { Ordinal, Trait } from '@/types'

// ─── Active queue banner ───────────────────────────────────────────────────────

function ActiveQueueBanner() {
  const router = useRouter()
  const { address } = useLaserEyes()
  const [entry, setEntry] = useState<{ queue_id: string; status: string; fighter_data: any } | null>(null)

  useEffect(() => {
    if (!address) return
    fetch(`/api/matchmaking/player?player_id=${encodeURIComponent(address)}`)
      .then(r => r.json())
      .then(d => { if (d.found) setEntry(d) })
      .catch(() => {})
  }, [address])

  const handleCancel = async () => {
    if (!entry) return
    await fetch('/api/matchmaking/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue_id: entry.queue_id }),
    }).catch(() => {})
    setEntry(null)
  }

  if (!entry) return null

  const f = entry.fighter_data
  const matched = entry.status === 'matched'
  const name = f?.name ?? f?.meta_name ?? (f?.collection_name ? `${f.collection_name} #${f.inscription_number}` : `#${f?.inscription_number}`)
  const isImage = f?.contentType?.startsWith('image/') || f?.content_type?.startsWith('image/')
  const imgUrl = f?.contentUrl ?? f?.content_url

  return (
    <div
      className="mb-6 rounded-xl px-4 py-3 flex items-center gap-4"
      style={{
        background: 'linear-gradient(135deg, rgba(185,28,28,0.12), rgba(5,2,2,0.9))',
        border: `1px solid ${matched ? 'rgba(34,197,94,0.4)' : 'rgba(185,28,28,0.35)'}`,
        boxShadow: `0 0 20px ${matched ? 'rgba(34,197,94,0.1)' : 'rgba(185,28,28,0.1)'}`,
      }}
    >
      {isImage && imgUrl ? (
        <img src={imgUrl} alt={name} className="w-12 h-12 rounded-lg object-contain flex-shrink-0"
          style={{ filter: 'drop-shadow(0 0 8px rgba(204,34,0,0.5))' }} />
      ) : (
        <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(120,10,10,0.3)' }}>
          <span className="text-xs font-black" style={{ color: '#cc2200' }}>ORD</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest font-black mb-0.5" style={{ color: matched ? '#22c55e' : '#7f1d1d' }}>
          {matched ? '⚔️ Match Found!' : '⏳ Searching for Opponent'}
        </div>
        <div className="text-sm font-black truncate" style={{ color: '#e8eef7' }}>{name}</div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => router.push('/lobby')}
          className="px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded transition-all hover:scale-105"
          style={{
            background: matched ? 'linear-gradient(135deg, #15803d, #14532d)' : 'rgba(185,28,28,0.2)',
            color: '#fff',
            border: `1px solid ${matched ? 'rgba(34,197,94,0.5)' : 'rgba(185,28,28,0.4)'}`,
          }}
        >
          {matched ? '⚔️ Enter Battle' : 'Return to Lobby'}
        </button>
        <button onClick={handleCancel}
          className="px-2 py-1.5 text-xs font-bold uppercase tracking-widest rounded transition-opacity hover:opacity-60"
          style={{ color: '#4a1515', border: '1px solid rgba(185,28,28,0.12)' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// March 9 2026 11:00 AM EST = 16:00 UTC
const LAUNCH_TIME = new Date('2026-03-09T16:00:00Z')

function useCountdown(target: Date) {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, target.getTime() - Date.now()))
  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(Math.max(0, target.getTime() - Date.now()))
    }, 1000)
    return () => clearInterval(id)
  }, [target])
  return timeLeft
}

function BattleCountdown() {
  const ms = useCountdown(LAUNCH_TIME)
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  const secs = Math.floor((ms % 60000) / 1000)

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 py-16 select-none">
      <div
        className="text-sm font-black uppercase tracking-[0.3em]"
        style={{ color: '#7f1d1d' }}
      >
        Battle begins in
      </div>

      <div className="flex items-end gap-4 sm:gap-8">
        {[
          { value: days, label: 'Days' },
          { value: hours, label: 'Hours' },
          { value: mins, label: 'Min' },
          { value: secs, label: 'Sec' },
        ].map(({ value, label }, i) => (
          <div key={label} className="flex items-end gap-4 sm:gap-8">
            {i > 0 && (
              <span
                className="text-4xl sm:text-6xl lg:text-8xl font-black pb-6 sm:pb-8 lg:pb-10"
                style={{ color: '#3d0a0a' }}
              >
                :
              </span>
            )}
            <div className="flex flex-col items-center gap-2">
              <div
                className="text-6xl sm:text-8xl lg:text-[10rem] font-black tabular-nums leading-none"
                style={{
                  color: '#cc2200',
                  textShadow: '0 0 60px rgba(185,28,28,0.5), 0 0 120px rgba(185,28,28,0.2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {pad(value)}
              </div>
              <div
                className="text-xs sm:text-sm font-black uppercase tracking-widest"
                style={{ color: '#4a1515' }}
              >
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="text-xs font-bold uppercase tracking-widest mt-4"
        style={{ color: '#3d0a0a' }}
      >
        March 9th · 11:00 AM EST
      </div>
    </div>
  )
}

// LaserEyesWrapper is already provided by app/layout.tsx, no need to wrap again

export default function Home() {
  const searchParams = useSearchParams()
  const devMode = searchParams.get('battle') === '1'
  const isLaunched = devMode || Date.now() >= LAUNCH_TIME.getTime()

  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [filteredOrdinals, setFilteredOrdinals] = useState<Ordinal[]>([])
  const [filters, setFilters] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [shake, setShake] = useState(false)
  const [selectedOrdinal, setSelectedOrdinal] = useState<Ordinal | null>(null)
  const [showSplash, setShowSplash] = useState(false)
  const [userInteracted, setUserInteracted] = useState(false)
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)
  const [showEnter, setShowEnter] = useState(false)

  useEffect(() => {
    setShowEnter(true)
  }, [])

  const handleEnterSite = () => {
    setShowEnter(false)
  }

  const handleEnter = () => {
    setUserInteracted(true)
    setShowSplash(false)
  }

  const handleHolderVerified = (holder: boolean, address?: string) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }

  const handleVerifyingStart = () => {
    setIsVerifying(true)
  }


  useEffect(() => {
    const shakeInterval = setInterval(() => {
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }, 4000)

    return () => clearInterval(shakeInterval)
  }, [])

  useEffect(() => {
    fetch('/collection_metadata.json')
      .then(res => res.json())
      .then(data => {
        // Transform slim metadata back to Ordinal format for compatibility
        const ordinalData = data.ordinals.map((item: any) => ({
          ...item,
          // Expand traits from slim format { category: "name" } to full format { category: { name: "name" } }
          traits: Object.fromEntries(
            Object.entries(item.traits).map(([category, name]) => [
              category,
              { name: name as string }
            ])
          )
        }))
        setOrdinals(ordinalData)
        setFilteredOrdinals(ordinalData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading data:', err)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    let filtered = [...ordinals]

    Object.keys(filters).forEach(category => {
      const traitNames = filters[category]
      if (traitNames.size > 0) {
        filtered = filtered.filter(ordinal => {
          const trait = ordinal.traits[category]?.name
          return trait && traitNames.has(trait)
        })
      }
    })

    setFilteredOrdinals(filtered)
  }, [filters, ordinals])

  const updateFilters = (category: string, traitName: string, checked: boolean) => {
    setFilters(prev => {
      const newFilters = { ...prev }
      if (!newFilters[category]) {
        newFilters[category] = new Set()
      }
      if (checked) {
        newFilters[category].add(traitName)
      } else {
        newFilters[category].delete(traitName)
        if (newFilters[category].size === 0) {
          delete newFilters[category]
        }
      }
      return newFilters
    })
  }

  const clearAllFilters = () => {
    setFilters({})
  }

  // Ensure we always render something
  if (!showSplash && ordinals.length === 0 && !loading) {
    return (
      <>
        {showEnter && (
          <div
            className="fixed inset-0 z-[999] flex flex-col items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(4px)' }}
          >
            <div className="flex flex-col items-center gap-8 text-center px-4">
              <div className="text-7xl sm:text-9xl font-black select-none" style={{ color: '#cc2200', textShadow: '0 0 80px rgba(185,28,28,0.7)' }}>💀</div>
              <div className="text-2xl sm:text-4xl font-black uppercase tracking-[0.2em]" style={{ color: '#cc2200' }}>The Damned</div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#4a1515' }}>Sound on for best experience</p>
              <button onClick={handleEnterSite} className="mt-4 px-12 py-4 font-black uppercase tracking-[0.3em] text-sm transition-all hover:scale-105" style={{ background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)', color: '#fff', borderRadius: '4px', boxShadow: '0 0 40px rgba(185,28,28,0.4)' }}>Enter</button>
            </div>
          </div>
        )}
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="text-[#ff6b6b] text-xl">Loading The Damned...</div>
        </div>
      </>
    )
  }

  return (
    <>
      {showEnter && (
        <div
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(4px)' }}
        >
          <div className="flex flex-col items-center gap-8 text-center px-4">
            <div
              className="text-7xl sm:text-9xl font-black uppercase tracking-widest select-none"
              style={{
                color: '#cc2200',
                textShadow: '0 0 80px rgba(185,28,28,0.7), 0 0 160px rgba(185,28,28,0.3)',
              }}
            >
              💀
            </div>
            <div
              className="text-2xl sm:text-4xl font-black uppercase tracking-[0.2em]"
              style={{ color: '#cc2200', textShadow: '0 0 40px rgba(185,28,28,0.5)' }}
            >
              The Damned
            </div>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-widest" style={{ color: '#4a1515' }}>
              Sound on for best experience
            </p>
            <button
              onClick={handleEnterSite}
              className="mt-4 px-12 py-4 font-black uppercase tracking-[0.3em] text-sm sm:text-base transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
                color: '#fff',
                border: '1px solid rgba(185,28,28,0.5)',
                borderRadius: '4px',
                boxShadow: '0 0 40px rgba(185,28,28,0.4)',
              }}
            >
              Enter
            </button>
          </div>
        </div>
      )}
      {showSplash ? (
        <SplashScreen onEnter={handleEnter} />
      ) : (
        <>
          <BloodCanvas />
          <main className={`min-h-screen relative overflow-x-hidden ${shake ? 'shake' : ''}`}>
            <Header 
              isHolder={isHolder} 
              isVerifying={isVerifying}
              connected={connected}
              onHolderVerified={handleHolderVerified}
              onVerifyingStart={handleVerifyingStart}
              onConnectedChange={setConnected}
              showMusicControls={true}
            />
            {/* Battle UI or countdown */}
            <div className="container mx-auto px-4 py-8 relative z-10 max-w-7xl">
              {isLaunched ? (
                <>
                  <ActiveQueueBanner />
                  <FighterSelect />
                </>
              ) : <BattleCountdown />}
            </div>

            {/* Ordinal collection hidden - just showing video */}
            {/* <div className="container mx-auto px-4 py-8 relative z-10 max-w-7xl">
              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 sm:gap-6 lg:gap-8">
                <aside className="order-2 lg:order-1">
                  <Filters
                    ordinals={ordinals}
                    filters={filters}
                    onFilterChange={updateFilters}
                    onClearAll={clearAllFilters}
                  />
                </aside>
                <main className="order-1 lg:order-2">
                  <Gallery
                    ordinals={filteredOrdinals}
                    loading={loading}
                    onOrdinalClick={setSelectedOrdinal}
                  />
                </main>
              </div>
            </div> */}
          </main>
          {selectedOrdinal && (
            <Modal ordinal={selectedOrdinal} onClose={() => setSelectedOrdinal(null)} />
          )}
        </>
      )}
    </>
  )
}
