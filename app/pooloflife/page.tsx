'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Loader2, Heart, Clock, Shield } from 'lucide-react'
import dynamicImport from 'next/dynamic'

const LaserEyesWrapper = dynamicImport(
  () => import('@/components/LaserEyesWrapper'),
  { ssr: false, loading: () => null },
)

interface ArmyStatus {
  inscriptionId: string
  imageUrl: string
  trait: 'Angelic' | 'Demonic'
  lifeForce: number
  canHeal: boolean
}

export default function PoolOfLifePage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [armies, setArmies] = useState<ArmyStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [healing, setHealing] = useState(false)
  const [lastHealTime, setLastHealTime] = useState<Date | null>(null)
  const [canHealToday, setCanHealToday] = useState(true)

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const fetchArmies = useCallback(async () => {
    if (!address) {
      setArmies([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `/api/battle/ordinals?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch armies')
      }

      const data = await response.json()
      // Filter out dead armies (lifeForce === 0) - they need to be resurrected, not healed
      const armiesData = (data.ordinals || [])
        .filter((ord: any) => {
          // Explicitly check: if lifeForce is 0, hide it. If null/undefined, default to 100 and show it.
          const lifeForce = ord.lifeForce != null ? ord.lifeForce : 100
          return lifeForce > 0
        })
        .map((ord: any) => {
          // Preserve 0 if it's 0, otherwise default to 100 for null/undefined
          const lifeForce = ord.lifeForce != null ? ord.lifeForce : 100
          return {
            inscriptionId: ord.inscriptionId,
            imageUrl: ord.imageUrl,
            trait: ord.trait,
            lifeForce,
            canHeal: lifeForce < 100,
          }
        })

      setArmies(armiesData)

      // Check last heal time
      const healResponse = await fetch(`/api/pooloflife/status?walletAddress=${encodeURIComponent(address)}`)
      if (healResponse.ok) {
        const healData = await healResponse.json()
        if (healData.lastHealTime) {
          const lastHeal = new Date(healData.lastHealTime)
          setLastHealTime(lastHeal)
          
          // Check if 6 hours have passed
          const now = new Date()
          const hoursSinceHeal = (now.getTime() - lastHeal.getTime()) / (1000 * 60 * 60)
          setCanHealToday(hoursSinceHeal >= 6)
        }
      }
    } catch (error) {
      console.error('Error fetching armies:', error)
      toast.error('Failed to load armies')
      setArmies([])
    } finally {
      setLoading(false)
    }
  }, [address, toast])

  useEffect(() => {
    if (connected && address) {
      fetchArmies()
    } else {
      setArmies([])
    }
  }, [connected, address, fetchArmies])

  const handleHeal = useCallback(async () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    if (!canHealToday) {
      toast.error('You can only use the Pool of Life once every 6 hours')
      return
    }

    // Filter out dead armies (lifeForce === 0) - they can't be healed, only resurrected
    const armiesNeedingHeal = armies.filter(a => a.lifeForce > 0 && a.lifeForce < 100)
    if (armiesNeedingHeal.length === 0) {
      toast.error('All your armies are at full health!')
      return
    }

    setHealing(true)
    try {
      const response = await fetch('/api/pooloflife/heal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to heal armies')
      }

      const data = await response.json()
      toast.success(`Healed ${data.healedCount} armies to full health!`)
      setCanHealToday(false)
      setLastHealTime(new Date())
      await fetchArmies()
    } catch (error) {
      console.error('Error healing armies:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to heal armies')
    } finally {
      setHealing(false)
    }
  }, [address, armies, canHealToday, toast, fetchArmies])

  const getTimeUntilNextHeal = () => {
    if (!lastHealTime || canHealToday) return null
    
    const now = new Date()
    const nextHealTime = new Date(lastHealTime.getTime() + 6 * 60 * 60 * 1000) // 6 hours
    const msUntilNext = nextHealTime.getTime() - now.getTime()
    
    if (msUntilNext <= 0) return null
    
    const hours = Math.floor(msUntilNext / (1000 * 60 * 60))
    const minutes = Math.floor((msUntilNext % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}h ${minutes}m`
  }

  const timeUntilNext = getTimeUntilNextHeal()
  const armiesNeedingHeal = armies.filter(a => a.lifeForce < 100)

  return (
    <LaserEyesWrapper>
      <div className="min-h-screen bg-black text-white">
        <Header
          isHolder={isHolder}
          isVerifying={isVerifying}
          connected={connected}
          onHolderVerified={handleHolderVerified}
          onVerifyingStart={handleVerifyingStart}
          onConnectedChange={() => {}}
        />

        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-black uppercase mb-4 text-cyan-400 flex items-center justify-center gap-3">
              <Heart className="h-12 w-12" />
              Pool of Life
            </h1>
            <p className="text-xl text-gray-400">
              Restore your armies to full health. Can be used once every 6 hours.
            </p>
          </div>

          {!connected ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-400 mb-4">Please connect your wallet to access the Pool of Life</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            </div>
          ) : (
            <>
              {/* Heal Status */}
              <div className="bg-black/60 border-2 border-cyan-500/50 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Shield className="h-6 w-6 text-cyan-400" />
                    <h2 className="text-2xl font-bold text-cyan-400">Healing Status</h2>
                  </div>
                  {timeUntilNext && (
                    <div className="flex items-center gap-2 text-yellow-400">
                      <Clock className="h-5 w-5" />
                      <span>Next heal available in: {timeUntilNext}</span>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Armies needing healing:</span>
                    <span className="font-bold text-red-400">{armiesNeedingHeal.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Can heal today:</span>
                    <span className={`font-bold ${canHealToday ? 'text-green-400' : 'text-red-400'}`}>
                      {canHealToday ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleHeal}
                  disabled={!canHealToday || armiesNeedingHeal.length === 0 || healing}
                  className="w-full mt-4 bg-cyan-600 hover:bg-cyan-700 text-white py-3 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {healing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Healing...
                    </>
                  ) : (
                    <>
                      <Heart className="h-5 w-5 mr-2" />
                      Heal All Armies
                    </>
                  )}
                </Button>
              </div>

              {/* Armies List */}
              <div className="bg-black/60 border-2 border-cyan-500/50 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">Your Armies</h2>
                {armies.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No armies found</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {armies.map((army) => (
                      <div
                        key={army.inscriptionId}
                        className={`border-2 rounded-lg p-3 ${
                          army.trait === 'Angelic'
                            ? 'border-cyan-500/50 bg-cyan-950/20'
                            : 'border-red-500/50 bg-red-950/20'
                        }`}
                      >
                        <img
                          src={army.imageUrl}
                          alt="Army"
                          className="w-full aspect-square object-cover rounded mb-2"
                        />
                        <div className="text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold ${army.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`}>
                              {army.trait}
                            </span>
                            <span className="text-gray-300">{army.lifeForce}/100</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                army.lifeForce > 50 ? 'bg-green-500' : army.lifeForce > 25 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${army.lifeForce}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </LaserEyesWrapper>
  )
}

