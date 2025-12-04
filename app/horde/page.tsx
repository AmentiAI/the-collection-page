'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Header from '@/components/Header'
import { Loader2, Skull, Sword } from 'lucide-react'

interface MegaMonster {
  id: string
  name: string | null
  prompt: string
  imageUrl: string | null
  fullBodyImageUrl: string | null
  createdAt: string
  updatedAt: string
  totalFights: number
}

export default function HordePage() {
  const [monsters, setMonsters] = useState<MegaMonster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/horde/monsters')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.monsters) {
          setMonsters(data.monsters)
        } else {
          setError(data.error || 'Failed to load monsters')
        }
      })
      .catch(err => {
        console.error('Error loading horde:', err)
        setError('Failed to load the horde')
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      <Header connected={false} showMusicControls={true} />
      
      <main className="max-w-7xl mx-auto px-4 py-8 md:px-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Skull className="h-12 w-12 md:h-16 md:w-16 text-red-500" />
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-wider text-red-500">
              The Horde
            </h1>
            <Skull className="h-12 w-12 md:h-16 md:w-16 text-red-500" />
          </div>
          <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto">
             These abominations attack all armies every hour.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-red-500" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-xl">{error}</p>
          </div>
        ) : monsters.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-xl">No monsters in the horde yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {monsters.map((monster) => (
              <div
                key={monster.id}
                className="relative bg-black/60 border-2 border-red-500/50 rounded-lg overflow-visible hover:border-red-500 transition-all hover:shadow-[0_0_20px_rgba(220,38,38,0.5)] group"
              >
                <div className="overflow-hidden rounded-t-lg">
                  {monster.imageUrl ? (
                    <div className="relative w-full aspect-square bg-black">
                      <Image
                        src={monster.imageUrl}
                        alt={monster.name || monster.prompt}
                        fill
                        className="object-cover"
                        unoptimized={monster.imageUrl.startsWith('data:')}
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-square bg-gray-900 flex items-center justify-center">
                      <Skull className="h-16 w-16 text-gray-600" />
                    </div>
                  )}
                </div>
                {/* Full body image on hover - positioned outside the card */}
                {monster.fullBodyImageUrl && (
                  <div className="absolute left-full top-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50 w-64 h-96">
                    <div className="bg-black/95 border-2 border-red-500/80 rounded-lg p-2 shadow-2xl w-full h-full">
                      <Image
                        src={monster.fullBodyImageUrl}
                        alt={`${monster.name || 'Monster'} - Full Body`}
                        width={256}
                        height={384}
                        className="w-full h-full object-contain"
                        unoptimized
                      />
                    </div>
                  </div>
                )}
                
                <div className="p-4">
                  {monster.name && (
                    <h3 className="text-lg font-bold text-red-400 mb-2">{monster.name}</h3>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <Sword className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-bold text-red-400">
                      {monster.totalFights.toLocaleString()} Fights
                    </span>
                  </div>
                
                  <p className="text-xs text-gray-500 mt-2">
                    Joined: {new Date(monster.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {monsters.length > 0 && (
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-4 bg-black/60 border-2 border-red-500/50 rounded-lg px-6 py-4">
              <div className="text-center">
                <div className="text-3xl font-black text-red-500">
                  {monsters.length}
                </div>
                <div className="text-sm text-gray-400 uppercase tracking-wider">
                  Monsters
                </div>
              </div>
              <div className="h-12 w-px bg-red-500/50" />
              <div className="text-center">
                <div className="text-3xl font-black text-red-500">
                  {monsters.reduce((sum, m) => sum + m.totalFights, 0).toLocaleString()}
                </div>
                <div className="text-sm text-gray-400 uppercase tracking-wider">
                  Total Fights
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

