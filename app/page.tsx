'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useLaserEyes } from '@omnisat/lasereyes'
import dynamicImport from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import BloodCanvas from '@/components/BloodCanvas'
import Header from '@/components/Header'
import Filters from '@/components/Filters'
import Gallery from '@/components/Gallery'
import Modal from '@/components/Modal'
import SplashScreen from '@/components/SplashScreen'
import FighterSelect from '@/components/FighterSelect'
import { Ordinal, Trait } from '@/types'

// ─── Active queue banner ───────────────────────────────────────────────────────

function FighterThumb({ f }: { f: any }) {
  const isImage = f?.contentType?.startsWith('image/') || f?.content_type?.startsWith('image/')
  const imgUrl = f?.contentUrl ?? f?.content_url
  const name = f?.name ?? f?.meta_name ?? (f?.collection_name ? `${f.collection_name} #${f.inscription_number}` : `#${f?.inscription_number}`)
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      {isImage && imgUrl ? (
        <img src={imgUrl} alt={name} className="w-10 h-10 rounded-lg object-contain"
          style={{ filter: 'drop-shadow(0 0 6px rgba(204,34,0,0.5))' }} />
      ) : (
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(120,10,10,0.3)' }}>
          <span className="text-[9px] font-black" style={{ color: '#cc2200' }}>ORD</span>
        </div>
      )}
      <div className="text-[9px] font-black truncate max-w-[72px] text-center" style={{ color: '#e8eef7' }}>{name}</div>
    </div>
  )
}

function ActiveQueueBanner({ onFound }: { onFound: (found: boolean) => void }) {
  const router = useRouter()
  const { address } = useLaserEyes()
  const [entry, setEntry] = useState<{ queue_id: string; status: string; fighter_data: any; opponent: any } | null>(null)

  useEffect(() => {
    if (!address) return
    fetch(`/api/matchmaking/player?player_id=${encodeURIComponent(address)}`)
      .then(r => r.json())
      .then(d => {
        if (d.found) { setEntry(d); onFound(true) }
        else onFound(false)
      })
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
    onFound(false)
  }

  if (!entry) return null

  const matched = entry.status === 'matched'

  return (
    <div
      className="mb-6 rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap"
      style={{
        background: 'linear-gradient(135deg, rgba(185,28,28,0.12), rgba(5,2,2,0.9))',
        border: `1px solid ${matched ? 'rgba(34,197,94,0.4)' : 'rgba(185,28,28,0.35)'}`,
        boxShadow: `0 0 20px ${matched ? 'rgba(34,197,94,0.1)' : 'rgba(185,28,28,0.1)'}`,
      }}
    >
      {/* My fighter */}
      <FighterThumb f={entry.fighter_data} />

      {matched && entry.opponent ? (
        <>
          <div className="text-lg font-black" style={{ color: '#cc2200' }}>VS</div>
          {/* Opponent fighter */}
          <FighterThumb f={entry.opponent} />
        </>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest font-black" style={{ color: '#7f1d1d' }}>⏳ Searching for Opponent</div>
        </div>
      )}

      {matched && (
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest font-black" style={{ color: '#22c55e' }}>⚔️ Match Found!</div>
          <div className="text-[10px] mt-0.5" style={{ color: '#4a1515' }}>Your fighters are committed</div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        <button
          onClick={() => router.push(matched ? '/battle' : '/lobby')}
          className="px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded transition-all hover:scale-105"
          style={{
            background: matched ? 'linear-gradient(135deg, #15803d, #14532d)' : 'rgba(185,28,28,0.2)',
            color: '#fff',
            border: `1px solid ${matched ? 'rgba(34,197,94,0.5)' : 'rgba(185,28,28,0.4)'}`,
          }}
        >
          {matched ? '⚔️ Enter Battle' : 'Return to Lobby'}
        </button>
        {!matched && (
          <button onClick={handleCancel}
            className="px-2 py-1.5 text-xs font-bold uppercase tracking-widest rounded transition-opacity hover:opacity-60"
            style={{ color: '#4a1515', border: '1px solid rgba(185,28,28,0.12)' }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// March 13 2026 12:00 PM EST = 16:00 UTC
const LAUNCH_TIME = new Date('2026-03-13T16:00:00Z')

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

      <div className="flex items-end gap-1.5 sm:gap-4 lg:gap-8 px-2">
        {[
          { value: days, label: 'Days' },
          { value: hours, label: 'Hrs' },
          { value: mins, label: 'Min' },
          { value: secs, label: 'Sec' },
        ].map(({ value, label }, i) => (
          <div key={label} className="flex items-end gap-1.5 sm:gap-4 lg:gap-8">
            {i > 0 && (
              <span
                className="text-2xl sm:text-5xl lg:text-8xl font-black pb-4 sm:pb-7 lg:pb-10"
                style={{ color: '#3d0a0a' }}
              >
                :
              </span>
            )}
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <div
                className="text-4xl sm:text-7xl lg:text-[10rem] font-black tabular-nums leading-none"
                style={{
                  color: '#cc2200',
                  textShadow: '0 0 60px rgba(185,28,28,0.5), 0 0 120px rgba(185,28,28,0.2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {pad(value)}
              </div>
              <div
                className="text-[9px] sm:text-xs font-black uppercase tracking-widest"
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
        March 13th · 12:00 PM EST
      </div>
    </div>
  )
}

// ─── Arena Live Stats ─────────────────────────────────────────────────────────

interface ArenaStats {
  in_queue: number
  active_matches: number
  total_fights: number
  total_fighters: number
}

function ArenaLiveStats() {
  const [stats, setStats] = useState<ArenaStats | null>(null)
  const [pulse, setPulse] = useState(false)

  const load = () => {
    fetch('/api/arena/stats')
      .then(r => r.json())
      .then(d => {
        if (d.success) { setStats(d); setPulse(true); setTimeout(() => setPulse(false), 600) }
      })
      .catch(() => {})
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [])

  const items = [
    { icon: '⏳', label: 'In Queue',        value: stats?.in_queue      ?? '—', color: '#f59e0b' },
    { icon: '⚔️', label: 'Active Matches',  value: stats?.active_matches ?? '—', color: '#cc2200' },
    { icon: '💀', label: 'Total Fights',     value: stats?.total_fights   ?? '—', color: '#a855f7' },
    { icon: '🔥', label: 'Total Fighters',  value: stats?.total_fighters  ?? '—', color: '#22c55e' },
  ]

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 transition-all duration-300 ${pulse ? 'opacity-80' : 'opacity-100'}`}
    >
      {items.map(({ icon, label, value, color }) => (
        <div
          key={label}
          className="rounded-xl px-4 py-4 flex flex-col items-center gap-1 text-center"
          style={{
            background: 'rgba(5,2,2,0.85)',
            border: `1px solid ${color}25`,
            boxShadow: `0 0 18px ${color}10`,
          }}
        >
          <div className="text-2xl leading-none">{icon}</div>
          <div className="text-3xl sm:text-4xl font-black tabular-nums mt-1" style={{ color, textShadow: `0 0 20px ${color}60` }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          <div className="text-[10px] uppercase tracking-widest font-black" style={{ color: '#4a1515' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Battle Stats + Leaderboard Widget ────────────────────────────────────────

interface BattleLeader {
  wallet_address: string
  wins: number
  losses: number
  win_pct: number
}

interface MyStats {
  wallet_address: string
  wins: number
  losses: number
  win_pct: number
  rank: number
}

function BattleStatsWidget({ address }: { address: string | undefined }) {
  const [leaders, setLeaders] = useState<BattleLeader[]>([])
  const [myStats, setMyStats] = useState<MyStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = address
      ? `/api/battle/leaderboard?limit=10&wallet=${encodeURIComponent(address)}`
      : '/api/battle/leaderboard?limit=10'
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLeaders(d.leaders ?? [])
          setMyStats(d.myStats ?? null)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  const fmt = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`

  return (
    <div className="w-full">
      {/* Personal stats row */}
      {myStats && (
        <div
          className="mb-6 rounded-xl px-5 py-4 grid grid-cols-3 gap-4 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(185,28,28,0.12), rgba(5,2,2,0.9))',
            border: '1px solid rgba(185,28,28,0.35)',
            boxShadow: '0 0 20px rgba(185,28,28,0.08)',
          }}
        >
          <div>
            <div className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: '#7f1d1d' }}>Wins</div>
            <div className="text-lg font-black tabular-nums" style={{ color: '#22c55e', textShadow: '0 0 20px rgba(34,197,94,0.4)' }}>{myStats.wins}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: '#7f1d1d' }}>Losses</div>
            <div className="text-lg font-black tabular-nums" style={{ color: '#cc2200', textShadow: '0 0 20px rgba(185,28,28,0.4)' }}>{myStats.losses}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: '#7f1d1d' }}>Win Rate</div>
            <div className="text-base font-black tabular-nums" style={{ color: '#e8eef7', textShadow: '0 0 20px rgba(200,200,255,0.2)' }}>{myStats.win_pct}%</div>
          </div>
          {myStats.rank && (myStats.wins > 0 || myStats.losses > 0) && (
            <div className="col-span-3 text-[10px] uppercase tracking-widest font-black" style={{ color: '#4a1515' }}>
              Your global rank: #{myStats.rank}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard widget */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: '1px solid rgba(185,28,28,0.3)',
          background: 'rgba(5,2,2,0.85)',
        }}
      >
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(185,28,28,0.2)' }}>
          <div className="text-[11px] uppercase tracking-[0.3em] font-black" style={{ color: '#cc2200' }}>⚔️ Battle Leaderboard</div>
          <Link
            href="/battle/leaderboard"
            className="text-[10px] uppercase tracking-widest font-black transition-opacity hover:opacity-60"
            style={{ color: '#7f1d1d' }}
          >
            View All →
          </Link>
        </div>

        {loading ? (
          <div className="py-8 text-center text-[10px] uppercase tracking-widest font-black" style={{ color: '#3d0a0a' }}>Loading…</div>
        ) : leaders.length === 0 ? (
          <div className="py-8 text-center text-[10px] uppercase tracking-widest font-black" style={{ color: '#3d0a0a' }}>No battles yet</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(185,28,28,0.12)' }}>
                <th className="px-4 py-2 text-left font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>#</th>
                <th className="px-4 py-2 text-left font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>Wallet</th>
                <th className="px-3 py-2 text-right font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>W</th>
                <th className="px-3 py-2 text-right font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>L</th>
                <th className="px-4 py-2 text-right font-black uppercase tracking-widest" style={{ color: '#4a1515', fontSize: 9 }}>Win%</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((l, i) => {
                const isMe = address && l.wallet_address.toLowerCase() === address.toLowerCase()
                return (
                  <tr
                    key={l.wallet_address}
                    style={{
                      borderBottom: '1px solid rgba(185,28,28,0.06)',
                      background: isMe ? 'rgba(185,28,28,0.08)' : undefined,
                    }}
                  >
                    <td className="px-4 py-2 font-black tabular-nums" style={{ color: i < 3 ? '#cc2200' : '#4a1515' }}>
                      {i === 0 ? '👑' : i + 1}
                    </td>
                    <td className="px-4 py-2 font-mono" style={{ color: isMe ? '#e8eef7' : '#9ca3af' }}>
                      {fmt(l.wallet_address)}{isMe ? ' (you)' : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-black tabular-nums" style={{ color: '#22c55e' }}>{l.wins}</td>
                    <td className="px-3 py-2 text-right font-black tabular-nums" style={{ color: '#cc2200' }}>{l.losses}</td>
                    <td className="px-4 py-2 text-right font-black tabular-nums" style={{ color: '#e8eef7' }}>{l.win_pct}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// LaserEyesWrapper is already provided by app/layout.tsx, no need to wrap again

export default function Home() {
  const searchParams = useSearchParams()
  const devMode = searchParams.get('battle') === '1'
  const isLaunched = devMode || Date.now() >= LAUNCH_TIME.getTime()
  const { address } = useLaserEyes()

  const [ordinals, setOrdinals] = useState<Ordinal[]>([])
  const [filteredOrdinals, setFilteredOrdinals] = useState<Ordinal[]>([])
  const [filters, setFilters] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [selectedOrdinal, setSelectedOrdinal] = useState<Ordinal | null>(null)
  const [showSplash, setShowSplash] = useState(false)
  const [userInteracted, setUserInteracted] = useState(false)
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)
  const [showEnter, setShowEnter] = useState(false)
  const [hasActiveQueue, setHasActiveQueue] = useState(false)

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
          <main className="min-h-screen relative overflow-x-hidden">
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
              {/* Hub stats — always at the top */}
              <div className="mb-8">
                <ArenaLiveStats />
              </div>
              <div className="mt-10">
                {isLaunched ? (
                  <>
                    <ActiveQueueBanner onFound={setHasActiveQueue} />
                    <div className="flex gap-6 items-start">
                      <div className="flex-1 min-w-0">
                        <FighterSelect disabled={hasActiveQueue} />
                      </div>
                      <div className="w-80 flex-shrink-0 hidden lg:block">
                        <BattleStatsWidget address={address || undefined} />
                      </div>
                    </div>
                    {/* Mobile: leaderboard below */}
                    <div className="lg:hidden mt-8">
                      <BattleStatsWidget address={address || undefined} />
                    </div>
                  </>
                ) : (
                  <>
                    <BattleCountdown />
                    <div className="mt-8">
                      <BattleStatsWidget address={address || undefined} />
                    </div>
                  </>
                )}
              </div>
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
