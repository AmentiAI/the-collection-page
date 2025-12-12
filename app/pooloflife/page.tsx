'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Loader2, Heart, Clock, Shield } from 'lucide-react'
import GlobalStartTimeLock from '@/components/GlobalStartTimeLock'
// LaserEyesWrapper is already provided by app/layout.tsx, no need to wrap again

interface ArmyStatus {
  inscriptionId: string
  imageUrl: string
  trait: 'Angelic' | 'Demonic'
  lifeForce: number
  maxLifeForce?: number
  status?: 'ready' | 'sanctuary' | null
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
  const [healHistory, setHealHistory] = useState<Array<{ id: string; healed_count: number; healed_at: string }>>([])

  // Use refs to track previous values and prevent unnecessary re-renders
  const addressRef = useRef<string | null | undefined>(undefined)
  const connectedRef = useRef<boolean>(false)

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const handleConnectedChange = useCallback((connected: boolean) => {
    if (!connected) {
      setIsHolder(undefined)
      setIsVerifying(false)
      setArmies([])
      setHealHistory([])
      setCanHealToday(true)
      setLastHealTime(null)
    }
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
      // Include both ready and sanctuary armies (like battle page does)
      const armiesData = (data.ordinals || [])
        .filter((ord: any) => {
          // Explicitly check: if lifeForce is 0, hide it. If null/undefined, default to 100 and show it.
          const lifeForce = ord.lifeForce != null ? ord.lifeForce : 100
          return lifeForce > 0
        })
        .map((ord: any) => {
          // Preserve 0 if it's 0, otherwise default to 100 for null/undefined
          const lifeForce = ord.lifeForce != null ? ord.lifeForce : 100
          const maxLifeForce = ord.maxLifeForce ?? 100
          const status = ord.status || null
          // Can heal if below max (accounting for health cap bonuses)
          const canHeal = lifeForce < maxLifeForce
          return {
            inscriptionId: ord.inscriptionId,
            imageUrl: ord.imageUrl,
            trait: ord.trait,
            lifeForce,
            maxLifeForce,
            status,
            canHeal,
          }
        })

      setArmies(armiesData)

      // Check last heal time
      const healResponse = await fetch(`/api/pooloflife/status?walletAddress=${encodeURIComponent(address)}`)
      if (healResponse.ok) {
        const healData = await healResponse.json()
        // Use the canHealToday value directly from the API (it handles null lastHealTime correctly)
        setCanHealToday(healData.canHealToday ?? true)
        
        if (healData.lastHealTime) {
          const lastHeal = new Date(healData.lastHealTime)
          setLastHealTime(lastHeal)
        } else {
          setLastHealTime(null)
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

  const fetchHealHistory = useCallback(async () => {
    if (!address) {
      setHealHistory([])
      return
    }

    try {
      const response = await fetch(
        `/api/pooloflife/history?walletAddress=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      )

      if (response.ok) {
        const data = await response.json()
        setHealHistory(data.history || [])
      }
    } catch (error) {
      console.error('Error fetching heal history:', error)
    }
  }, [address])

  // Only fetch when address or connected state actually changes
  useEffect(() => {
    const addressChanged = addressRef.current !== address
    const connectedChanged = connectedRef.current !== connected
    
    // Update refs after checking for changes
    const prevAddress = addressRef.current
    const prevConnected = connectedRef.current
    addressRef.current = address
    connectedRef.current = connected

    // Clear data when disconnected or address removed
    if (!connected || !address) {
      if (prevConnected || prevAddress) {
        // Only clear if we were previously connected/had address
        setArmies([])
        setHealHistory([])
      }
      return
    }

    // Only fetch if we have a valid connection and address, and something actually changed
    if ((addressChanged || connectedChanged)) {
      fetchArmies()
      fetchHealHistory()
    }
  }, [connected, address, fetchArmies, fetchHealHistory])

  const handleHeal = useCallback(async () => {
    if (!address) {
      toast.error('Please connect your wallet')
      return
    }

    if (!canHealToday) {
      toast.error('You can only use the Pool of Life once every 5 hours')
      return
    }

    // Filter out dead armies (lifeForce === 0) - they can't be healed, only resurrected
    // Check against maxLifeForce (which includes health cap bonuses)
    const armiesNeedingHeal = armies.filter(a => {
      const maxHealth = a.maxLifeForce ?? 100
      return a.lifeForce > 0 && a.lifeForce < maxHealth
    })
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
      await fetchHealHistory()
    } catch (error) {
      console.error('Error healing armies:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to heal armies')
    } finally {
      setHealing(false)
    }
  }, [address, armies, canHealToday, toast, fetchArmies, fetchHealHistory])

  const getTimeUntilNextHeal = () => {
    if (!lastHealTime || canHealToday) return null
    
    const now = new Date()
    const nextHealTime = new Date(lastHealTime.getTime() + 5 * 60 * 60 * 1000) // 5 hours
    const msUntilNext = nextHealTime.getTime() - now.getTime()
    
    if (msUntilNext <= 0) return null
    
    const hours = Math.floor(msUntilNext / (1000 * 60 * 60))
    const minutes = Math.floor((msUntilNext % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}h ${minutes}m`
  }

  const timeUntilNext = getTimeUntilNextHeal()
  const armiesNeedingHeal = armies.filter(a => {
    const maxHealth = a.maxLifeForce ?? 100
    return a.lifeForce < maxHealth
  })

  return (
    <GlobalStartTimeLock>
      <div className="min-h-screen bg-black text-white">
        <Header
          isHolder={isHolder}
          isVerifying={isVerifying}
          connected={connected}
          onHolderVerified={handleHolderVerified}
          onVerifyingStart={handleVerifyingStart}
          onConnectedChange={handleConnectedChange}
        />

        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-black uppercase mb-4 text-cyan-400 flex items-center justify-center gap-3">
              <Heart className="h-12 w-12" />
              Pool of Life
            </h1>
            <p className="text-xl text-gray-400">
              Restore your armies to full health. Can be used once every 5 hours.
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
                          {army.status && (
                            <div className="flex items-center justify-center mb-1">
                              {army.status === 'ready' ? (
                                <div className="flex items-center gap-1 bg-red-900/60 px-2 py-0.5 rounded border border-red-500/50">
                                  <span className="text-[9px] text-red-300 font-bold uppercase">Ready</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 bg-red-900/50 px-2 py-0.5 rounded border border-red-500/50">
                                  <Shield className="h-3 w-3 text-red-300" />
                                  <span className="text-[9px] text-red-300 font-bold uppercase">Sanctuary</span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-bold ${army.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`}>
                              {army.trait}
                            </span>
                            <span className="text-gray-300">
                              {army.lifeForce}/{army.maxLifeForce ?? 100}
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                army.lifeForce > (army.maxLifeForce ?? 100) * 0.5 
                                  ? 'bg-green-500' 
                                  : army.lifeForce > (army.maxLifeForce ?? 100) * 0.25 
                                  ? 'bg-yellow-500' 
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${(army.lifeForce / (army.maxLifeForce ?? 100)) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Heal History */}
              <div className="bg-black/60 border-2 border-cyan-500/50 rounded-lg p-6 mt-6">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">Heal History</h2>
                {healHistory.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No heal history yet</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {healHistory.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between p-3 bg-black/40 rounded border border-cyan-500/30"
                      >
                        <div className="flex items-center gap-3">
                          <Heart className="h-5 w-5 text-cyan-400" />
                          <div>
                            <span className="text-white font-semibold">
                              Healed {record.healed_count} {record.healed_count === 1 ? 'army' : 'armies'}
                            </span>
                          </div>
                        </div>
                        <div className="text-gray-400 text-sm">
                          {new Date(record.healed_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
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
    </GlobalStartTimeLock>
  )
}

