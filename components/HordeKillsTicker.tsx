'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface HordeKill {
  monsterId: string
  monsterName: string | null
  monsterImage: string | null
  inscriptionId: string
  killerUsername: string | null
  killerAvatar: string | null
  killTime: string
}

export default function HordeKillsTicker() {
  const [kills, setKills] = useState<HordeKill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/horde/kills')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.kills) {
          setKills(data.kills)
        }
      })
      .catch(err => {
        console.error('Error loading horde kills:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || kills.length === 0) {
    return null
  }

  // Duplicate the kills array to create seamless loop
  const duplicatedKills = [...kills, ...kills]

  return (
    <div className="w-full bg-gradient-to-r from-red-900/95 via-red-800/95 to-red-900/95 border-b-2 border-red-600/80 shadow-lg relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/20 to-transparent animate-pulse" />

      <div className="relative z-10 py-2">
        <div className="flex items-center gap-6 animate-scroll-infinite whitespace-nowrap" style={{ display: 'inline-flex' }}>
          {duplicatedKills.map((kill, index) => (
            <div
              key={`${kill.monsterId}-${index}`}
              className="flex items-center gap-3 px-2 flex-shrink-0"
            >
              {/* Killer Username */}
              <span className="text-red-100 font-bold text-sm uppercase tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {kill.killerUsername || kill.inscriptionId.slice(0, 8)}
              </span>

              {/* Slain Text */}
              <span className="text-red-200/70 text-xs uppercase tracking-wider">
                slain
              </span>

              {/* Monster Image */}
              {kill.monsterImage ? (
                <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-red-500/50 flex-shrink-0">
                  <Image
                    src={kill.monsterImage}
                    alt={kill.monsterName || 'Monster'}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-800 border-2 border-red-500/50 flex-shrink-0" />
              )}

              {/* Monster Name */}
              {kill.monsterName && (
                <span className="text-red-50 font-semibold text-sm uppercase">
                  {kill.monsterName}
                </span>
              )}

              {/* Separator */}
              <span className="text-red-500/50 text-xl">•</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
