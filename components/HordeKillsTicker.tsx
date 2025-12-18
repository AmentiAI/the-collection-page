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
    <div className="w-full bg-gradient-to-r from-red-950/30 via-red-900/40 to-red-950/30 border-y border-red-500/30 py-3 overflow-hidden relative z-10">
      <div className="flex items-center gap-8 animate-scroll-infinite whitespace-nowrap">
        {duplicatedKills.map((kill, index) => (
          <div
            key={`${kill.monsterId}-${index}`}
            className="flex items-center gap-3 px-4"
          >
            {/* Killer Avatar */}
            {kill.killerAvatar ? (
              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-red-500/50 flex-shrink-0">
                <Image
                  src={kill.killerAvatar}
                  alt={kill.killerUsername || 'Unknown'}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-800 border-2 border-red-500/50 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-gray-400">?</span>
              </div>
            )}

            {/* Killer Username */}
            <span className="text-red-400 font-bold text-sm">
              {kill.killerUsername || kill.inscriptionId.slice(0, 8)}
            </span>

            {/* Slain Text */}
            <span className="text-gray-400 text-xs uppercase tracking-wider">
              slain
            </span>

            {/* Monster Image */}
            {kill.monsterImage ? (
              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-red-500/50 flex-shrink-0">
                <Image
                  src={kill.monsterImage}
                  alt={kill.monsterName || 'Monster'}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-800 border-2 border-red-500/50 flex-shrink-0" />
            )}

            {/* Monster Name */}
            {kill.monsterName && (
              <span className="text-red-300 font-semibold text-sm">
                {kill.monsterName}
              </span>
            )}

            {/* Separator */}
            <span className="text-red-500/30 text-2xl">•</span>
          </div>
        ))}
      </div>
    </div>
  )
}
