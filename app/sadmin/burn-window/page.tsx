'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Flame, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { useLaserEyes } from '@omnisat/lasereyes'

export default function BurnWindowPage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hours, setHours] = useState('20')
  const [creditsOnly, setCreditsOnly] = useState(true)
  const [currentWindow, setCurrentWindow] = useState<{
    active: boolean
    expiresAt: string | null
    creditsOnly: boolean
    remainingMs: number
  } | null>(null)

  const handleHolderVerified = (holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }

  const handleVerifyingStart = () => {
    setIsVerifying(true)
  }

  const fetchCurrentWindow = async () => {
    try {
      const response = await fetch('/api/abyss/burn-window', {
        headers: { 'Cache-Control': 'no-store' },
      })
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setCurrentWindow({
            active: data.active,
            expiresAt: data.expiresAt,
            creditsOnly: data.creditsOnly || false,
            remainingMs: data.remainingMs || 0,
          })
        }
      }
    } catch (error) {
      console.error('Error fetching burn window:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCurrentWindow()
    const interval = setInterval(fetchCurrentWindow, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [])

  const handleCreate = async () => {
    try {
      setSaving(true)
      const hoursNum = Number.parseInt(hours, 10)
      if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 168) {
        toast.error('Hours must be between 1 and 168 (7 days)')
        return
      }

      const response = await fetch('/api/admin/burn-window/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hours: hoursNum,
          creditsOnly,
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create burn window')
      }

      toast.success(`Burn window created for ${hoursNum} hours (credits-only: ${creditsOnly ? 'Yes' : 'No'})`)
      await fetchCurrentWindow()
    } catch (error) {
      console.error('Error creating burn window:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create burn window')
    } finally {
      setSaving(false)
    }
  }

  const formatTimeRemaining = (ms: number): string => {
    if (ms <= 0) return 'Expired'
    const totalSeconds = Math.ceil(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${hours}h ${minutes}m ${seconds}s`
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={connected}
        onHolderVerified={handleHolderVerified}
        onVerifyingStart={handleVerifyingStart}
        onConnectedChange={() => {}}
        showMusicControls={true}
      />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Flame className="h-10 w-10 text-red-400" />
            Abyss Burn Window
          </h1>
          <p className="text-gray-400">Manually create a burn window to open the abyss for bonus credits</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Window Status */}
            {currentWindow && (
              <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="h-6 w-6 text-blue-400" />
                  <h2 className="text-2xl font-bold">Current Status</h2>
                </div>

                {currentWindow.active ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                      <span className="font-semibold text-green-400">Burn window is ACTIVE</span>
                    </div>
                    <div className="rounded-lg border border-green-600/40 bg-green-950/20 p-4">
                      <div className="space-y-2">
                        <p className="text-sm text-gray-300">
                          <strong className="text-green-300">Expires at:</strong>{' '}
                          {currentWindow.expiresAt
                            ? new Date(currentWindow.expiresAt).toLocaleString()
                            : 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-300">
                          <strong className="text-green-300">Time remaining:</strong>{' '}
                          <span className="font-mono font-bold text-green-400">
                            {formatTimeRemaining(currentWindow.remainingMs)}
                          </span>
                        </p>
                        <p className="text-sm text-gray-300">
                          <strong className="text-green-300">Credits-only mode:</strong>{' '}
                          {currentWindow.creditsOnly ? (
                            <span className="text-amber-400">Yes (requires bonus credits)</span>
                          ) : (
                            <span className="text-blue-400">No (open to all)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-gray-400" />
                    <span className="font-semibold text-gray-400">No active burn window</span>
                  </div>
                )}
              </div>
            )}

            {/* Create New Window */}
            <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Flame className="h-6 w-6 text-red-400" />
                <h2 className="text-2xl font-bold">Create Burn Window</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="hours" className="text-gray-300 mb-2 block">
                    Duration (Hours)
                  </Label>
                  <Input
                    id="hours"
                    type="number"
                    min="1"
                    max="168"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="20"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter number of hours (1-168, max 7 days)
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="creditsOnly"
                    checked={creditsOnly}
                    onChange={(e) => setCreditsOnly(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-red-600 focus:ring-red-500"
                  />
                  <Label htmlFor="creditsOnly" className="text-gray-300 cursor-pointer">
                    Credits-only mode (requires bonus burn credits to burn)
                  </Label>
                </div>

                <div className="rounded-lg border border-blue-600/40 bg-blue-950/20 p-3">
                  <p className="text-xs text-gray-400 mb-1">
                    <strong className="text-blue-300">What this does:</strong>
                  </p>
                  <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                    <li>Opens the abyss page even when <code className="text-red-400">ABYSS_DISABLED = true</code></li>
                    <li>
                      {creditsOnly
                        ? 'Only allows burns if user has bonus burn credits (from completing portal circles)'
                        : 'Allows all burns regardless of cap or bonus credits'}
                    </li>
                    <li>Automatically expires after the specified duration</li>
                    <li>Deactivates any existing active burn windows</li>
                  </ul>
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={saving || !hours || Number.parseInt(hours, 10) <= 0}
                  className="bg-red-600 hover:bg-red-700 text-white w-full"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Flame className="h-4 w-4 mr-2" />
                      Create Burn Window
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

