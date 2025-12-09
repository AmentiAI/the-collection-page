'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useLaserEyes } from '@omnisat/lasereyes'

export default function GlobalSettingsPage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [globalStartTime, setGlobalStartTime] = useState('')
  const [description, setDescription] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  
  // Date and time picker state
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')

  const handleHolderVerified = (holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }

  const handleVerifyingStart = () => {
    setIsVerifying(true)
  }

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/global-settings?key=global_start_time')
      
      if (!response.ok) {
        throw new Error('Failed to fetch settings')
      }

      const data = await response.json()
      if (data.success && data.setting) {
        const value = data.setting.setting_value || ''
        setGlobalStartTime(value)
        setDescription(data.setting.description || '')
        setLastUpdated(data.setting.updated_at)
        
        // Parse timestamp into date and time inputs
        if (value && value.trim() !== '') {
          try {
            const date = new Date(value.trim())
            if (!isNaN(date.getTime())) {
              // Format date as YYYY-MM-DD (local date)
              const year = date.getFullYear()
              const month = String(date.getMonth() + 1).padStart(2, '0')
              const day = String(date.getDate()).padStart(2, '0')
              setDateValue(`${year}-${month}-${day}`)
              
              // Format time as HH:mm (local time)
              const hours = String(date.getHours()).padStart(2, '0')
              const minutes = String(date.getMinutes()).padStart(2, '0')
              setTimeValue(`${hours}:${minutes}`)
            } else {
              setDateValue('')
              setTimeValue('')
            }
          } catch {
            setDateValue('')
            setTimeValue('')
          }
        } else {
          setDateValue('')
          setTimeValue('')
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDateTimeChange = (date: string, time: string) => {
    setDateValue(date)
    setTimeValue(time)
    
    // Combine date and time into ISO 8601 timestamp (UTC)
    if (date && time) {
      try {
        // Create date from local date/time, then convert to UTC ISO string
        const localDate = new Date(`${date}T${time}`)
        if (!isNaN(localDate.getTime())) {
          // Convert to UTC ISO string
          const isoString = localDate.toISOString()
          setGlobalStartTime(isoString)
        } else {
          setGlobalStartTime('')
        }
      } catch {
        setGlobalStartTime('')
      }
    } else {
      setGlobalStartTime('')
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // If date/time inputs are filled, use them to create timestamp
      let finalTimestamp = globalStartTime.trim()
      if (dateValue && timeValue && (!finalTimestamp || finalTimestamp === '')) {
        try {
          const localDate = new Date(`${dateValue}T${timeValue}`)
          if (!isNaN(localDate.getTime())) {
            finalTimestamp = localDate.toISOString()
          }
        } catch {
          // Fall through to validation
        }
      }

      // Validate timestamp if provided
      if (finalTimestamp !== '') {
        const timestamp = new Date(finalTimestamp)
        if (isNaN(timestamp.getTime())) {
          toast.error('Invalid date/time. Please check your inputs.')
          return
        }
      }

      const response = await fetch('/api/admin/global-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: 'global_start_time',
          value: finalTimestamp,
          description: description || 'Global start time for pages: /battlez, /battlefield, /leaderboard, /dungeon-crawl, /crystallizationz, /abyss-summon. ISO 8601 timestamp. Empty string means no restriction.'
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to save settings')
      }

      toast.success('Settings saved successfully')
      setLastUpdated(data.setting.updated_at)
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setGlobalStartTime('')
    setDateValue('')
    setTimeValue('')
  }

  // Calculate time until start (use dateValue/timeValue if globalStartTime is empty but inputs are filled)
  const effectiveTimestamp = (() => {
    if (globalStartTime.trim()) return globalStartTime.trim()
    if (dateValue && timeValue) {
      try {
        const localDate = new Date(`${dateValue}T${timeValue}`)
        if (!isNaN(localDate.getTime())) {
          return localDate.toISOString()
        }
      } catch {
        // Fall through
      }
    }
    return ''
  })()

  const timeUntilStart = effectiveTimestamp ? (() => {
    try {
      const startTime = new Date(effectiveTimestamp)
      if (isNaN(startTime.getTime())) return null
      const now = new Date()
      const diff = startTime.getTime() - now.getTime()
      return diff > 0 ? diff : 0
    } catch {
      return null
    }
  })() : null

  const formatTimeUntilStart = (ms: number): string => {
    if (ms <= 0) return 'Started'
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
          <h1 className="text-4xl font-bold mb-2">Global Settings</h1>
          <p className="text-gray-400">Configure global start time for game pages</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Global Start Time Setting */}
            <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-6 w-6 text-blue-400" />
                <h2 className="text-2xl font-bold">Global Start Time</h2>
              </div>

              <p className="text-sm text-gray-400 mb-6">
                Set a global start time that controls access to the following pages:
                <br />
                <span className="font-mono text-xs mt-2 block">
                  /battlez, /battlefield, /leaderboard, /dungeon-crawl, /crystallizationz, /abyss-summon
                </span>
                <br />
                <span className="text-yellow-400 mt-2 block">
                  Note: This will override the 6-hour timer on /abyss-summon until the start time passes.
                </span>
              </p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="start-time" className="text-gray-300 mb-2 block">
                    Start Time (ISO 8601 format)
                  </Label>
                  <Input
                    id="start-time"
                    type="text"
                    placeholder="2025-01-01T00:00:00Z or leave empty for no restriction"
                    value={globalStartTime}
                    onChange={(e) => setGlobalStartTime(e.target.value)}
                    className="bg-gray-800 border-gray-600 text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Format: YYYY-MM-DDTHH:mm:ssZ (UTC) or YYYY-MM-DDTHH:mm:ss (local time)
                    <br />
                    Leave empty to remove restriction
                  </p>
                </div>

                {effectiveTimestamp && (
                  <div className="rounded-lg border border-blue-600/40 bg-blue-950/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {timeUntilStart !== null && timeUntilStart > 0 ? (
                        <>
                          <AlertCircle className="h-5 w-5 text-yellow-400" />
                          <span className="font-semibold text-yellow-400">Pages are locked</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                          <span className="font-semibold text-green-400">Pages are accessible</span>
                        </>
                      )}
                    </div>
                    {timeUntilStart !== null && timeUntilStart > 0 && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-300">
                          Time until start: <span className="font-mono font-bold text-yellow-400">{formatTimeUntilStart(timeUntilStart)}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Start time: {new Date(effectiveTimestamp).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {timeUntilStart !== null && timeUntilStart === 0 && (
                      <p className="text-sm text-gray-300">
                        Start time has passed. Pages are now accessible.
                      </p>
                    )}
                  </div>
                )}

                {lastUpdated && (
                  <p className="text-xs text-gray-500">
                    Last updated: {new Date(lastUpdated).toLocaleString()}
                  </p>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Settings
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleClear}
                    disabled={saving || !globalStartTime.trim()}
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:bg-gray-800"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className="rounded-2xl border border-yellow-600/40 bg-yellow-950/20 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-400 mb-2">How It Works</h3>
                  <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                    <li>When a start time is set, all listed pages will show a &quot;locked&quot; message until the start time passes</li>
                    <li>The /abyss-summon page&apos;s 6-hour timer will be disabled until the global start time passes</li>
                    <li>Once the start time passes, pages become accessible and /abyss-summon resumes its normal 6-hour cycle</li>
                    <li>To remove the restriction, clear the start time field and save</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

