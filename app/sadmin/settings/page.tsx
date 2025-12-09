'use client'

import { useState, useEffect } from 'react'
import { Settings, Save, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/Toast'
import Link from 'next/link'

export default function SettingsPage() {
  const toast = useToast()
  const [globalStartTime, setGlobalStartTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timeInput, setTimeInput] = useState('')
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  useEffect(() => {
    if (globalStartTime) {
      const interval = setInterval(() => {
        const now = new Date()
        const start = new Date(globalStartTime)
        const remaining = start.getTime() - now.getTime()
        setTimeRemaining(remaining > 0 ? remaining : 0)
      }, 1000)

      return () => clearInterval(interval)
    } else {
      setTimeRemaining(null)
    }
  }, [globalStartTime])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/sadmin/settings')
      const data = await response.json()

      if (data.success) {
        setGlobalStartTime(data.globalStartTime)
        if (data.globalStartTime) {
          setTimeInput(new Date(data.globalStartTime).toISOString().slice(0, 16))
        } else {
          setTimeInput('')
        }
      } else {
        toast.error('Failed to load settings')
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      const valueToSave = timeInput.trim() ? timeInput : null

      const response = await fetch('/api/sadmin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalStartTime: valueToSave })
      })

      const data = await response.json()

      if (data.success) {
        setGlobalStartTime(data.globalStartTime)
        toast.success('Settings saved successfully')
        await fetchSettings()
      } else {
        toast.error(data.error || 'Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setTimeInput('')
  }

  const formatTimeRemaining = (ms: number) => {
    if (ms <= 0) return '0s'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const isAccessible = timeRemaining === null || timeRemaining <= 0

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/sadmin" className="text-gray-400 hover:text-white mb-4 inline-block">
            ← Back to Super Admin
          </Link>
          <div className="flex items-center gap-4 mb-4">
            <Settings className="h-10 w-10 text-red-500" />
            <h1 className="text-4xl font-bold text-red-500">Global Settings</h1>
          </div>
          <p className="text-gray-400">
            Configure global start time for game pages. Pages will be inaccessible until this time passes.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            <p className="mt-4 text-gray-400">Loading settings...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Global Start Time Setting */}
            <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-6 w-6 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Global Start Time</h2>
              </div>

              <p className="text-gray-400 mb-6">
                Set a start time to restrict access to all game pages. Pages affected:
                <span className="block mt-2 text-sm text-gray-500">
                  /battlez, /battlefield, /leaderboard, /dungeon-crawl, /crystallizationz, /abyss-summon
                </span>
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Start Date & Time (UTC)
                  </label>
                  <input
                    type="datetime-local"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Leave empty to allow access immediately (no restriction)
                  </p>
                </div>

                {globalStartTime && (
                  <div className="mt-4 p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                    <div className="flex items-center gap-2 mb-2">
                      {isAccessible ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                          <span className="text-green-400 font-semibold">Pages are accessible</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-5 w-5 text-red-400" />
                          <span className="text-red-400 font-semibold">Pages are locked</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 space-y-1">
                      <p>
                        <span className="text-gray-500">Current start time:</span>{' '}
                        <span className="text-white">{new Date(globalStartTime).toLocaleString()}</span>
                      </p>
                      {!isAccessible && timeRemaining !== null && (
                        <p>
                          <span className="text-gray-500">Time remaining:</span>{' '}
                          <span className="text-red-400 font-mono">{formatTimeRemaining(timeRemaining)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                  <Button
                    onClick={handleClear}
                    disabled={saving || !timeInput}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className="rounded-2xl border border-blue-600/40 bg-blue-950/20 p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-blue-400 mb-2">How It Works</h3>
                  <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
                    <li>When a start time is set, all listed pages will show a "Coming Soon" message until the time passes</li>
                    <li>The abyss-summon timer will be disabled until the start time passes</li>
                    <li>Setting the start time to empty/null removes the restriction</li>
                    <li>Time is stored in UTC and compared against server time</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

