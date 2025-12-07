'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Edit, Trash2, ChevronDown, ChevronUp, BarChart3, Users, Gift, Clock, AlertTriangle } from 'lucide-react'

interface DungeonCrawl {
  id: string
  name: string
  description?: string
  requiredParticipants: number
  allowMultipleFromStock: boolean
  allowedTraits: 'all' | 'angelic' | 'demonic'
  restartAfterFailureHours: number
  cooldownHours: number
  neverRestartAfterCompletion: boolean
  rewardType: 'block_chance' | 'life_force_cap'
  rewardValue: number
  rewardDropChance1Ordinal: number
  rewardDropChance2Ordinals: number
  rewardDropChance3PlusOrdinals: number
  level1WindowStartMinutes: number
  level1WindowDurationMinutes: number
  level2WindowStartMinutes: number
  level2WindowDurationMinutes: number
  level3WindowStartMinutes: number
  level3WindowDurationMinutes: number
  minParticipationPercent: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string
  activeInstances: number
  completedInstances: number
}

export default function AdminDungeonCrawlsPage() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [crawls, setCrawls] = useState<DungeonCrawl[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCrawl, setEditingCrawl] = useState<DungeonCrawl | null>(null)
  const [expandedCrawl, setExpandedCrawl] = useState<string | null>(null)
  const [instances, setInstances] = useState<Record<string, any[]>>({})
  const [stats, setStats] = useState<Record<string, any>>({})
  const [loadingInstances, setLoadingInstances] = useState<Record<string, boolean>>({})
  const [updating, setUpdating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [showWipeConfirm, setShowWipeConfirm] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    requiredParticipants: 60,
    allowMultipleFromStock: false,
    allowedTraits: 'all' as 'all' | 'angelic' | 'demonic',
    restartAfterFailureHours: 2,
    cooldownHours: 168, // 7 days in hours
    neverRestartAfterCompletion: false,
    rewardType: 'block_chance' as 'block_chance' | 'life_force_cap',
    rewardValue: 10,
    rewardDropChance1Ordinal: 20,
    rewardDropChance2Ordinals: 10,
    rewardDropChance3PlusOrdinals: 5,
    level1WindowStartMinutes: 0,
    level1WindowDurationMinutes: 2,
    level2WindowStartMinutes: 4,
    level2WindowDurationMinutes: 2,
    level3WindowStartMinutes: 8,
    level3WindowDurationMinutes: 2,
    minParticipationPercent: 80,
  })

  const handleHolderVerified = useCallback((holder: boolean) => {
    setIsHolder(holder)
    setIsVerifying(false)
  }, [])

  const handleVerifyingStart = useCallback(() => {
    setIsVerifying(true)
  }, [])

  const fetchCrawls = useCallback(async () => {
    if (!address) return

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/dungeon-crawls`)
      if (!response.ok) {
        throw new Error('Failed to fetch dungeon crawls')
      }
      const data = await response.json()
      if (data.success) {
        setCrawls(data.crawls || [])
      }
    } catch (error) {
      console.error('Error fetching crawls:', error)
      toast.error('Failed to load dungeon crawls')
    } finally {
      setLoading(false)
    }
  }, [address, toast])

  // Optimized form update handler - just updates state, no side effects
  const updateFormField = useCallback((field: keyof typeof formData, value: any) => {
    setFormData((prev) => {
      // Only update if value actually changed to prevent unnecessary re-renders
      if (prev[field] === value) return prev
      return { ...prev, [field]: value }
    })
  }, [])

  useEffect(() => {
    if (connected && address) {
      fetchCrawls()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, address])

  const handleCreate = async () => {
    if (!address || creating || updating) return

    setCreating(true)
    try {
      const response = await fetch('/api/admin/dungeon-crawls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          ...formData,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success('Dungeon crawl created!')
        setShowCreateForm(false)
        setEditingCrawl(null)
        setFormData({
          name: '',
          description: '',
          requiredParticipants: 60,
          allowMultipleFromStock: false,
          allowedTraits: 'all' as 'all' | 'angelic' | 'demonic',
          restartAfterFailureHours: 2,
          cooldownHours: 168,
          neverRestartAfterCompletion: false,
          rewardType: 'block_chance',
          rewardValue: 10,
          rewardDropChance1Ordinal: 20,
          rewardDropChance2Ordinals: 10,
          rewardDropChance3PlusOrdinals: 5,
          level1WindowStartMinutes: 0,
          level1WindowDurationMinutes: 2,
          level2WindowStartMinutes: 4,
          level2WindowDurationMinutes: 2,
          level3WindowStartMinutes: 8,
          level3WindowDurationMinutes: 2,
          minParticipationPercent: 80,
        })
        await fetchCrawls()
      } else {
        toast.error(data.error || 'Failed to create dungeon crawl')
      }
    } catch (error) {
      console.error('Error creating crawl:', error)
      toast.error('Failed to create dungeon crawl')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = async (crawlId: string, updates: Partial<DungeonCrawl>) => {
    if (!address || updating) return

    setUpdating(true)
    try {
      const response = await fetch('/api/admin/dungeon-crawls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          crawlId,
          updates,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success('Dungeon crawl updated!')
        setEditingCrawl(null)
        setShowCreateForm(false)
        await fetchCrawls()
      } else {
        toast.error(data.error || 'Failed to update dungeon crawl')
      }
    } catch (error) {
      console.error('Error updating crawl:', error)
      toast.error('Failed to update dungeon crawl')
    } finally {
      setUpdating(false)
    }
  }

  const handleWipeData = async () => {
    if (!address || wiping) return

    setWiping(true)
    try {
      const response = await fetch('/api/admin/dungeon-crawls/wipe', {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.success) {
        toast.success('All dungeon crawl data wiped successfully!')
        setShowWipeConfirm(false)
        await fetchCrawls()
      } else {
        toast.error(data.error || 'Failed to wipe dungeon crawl data')
      }
    } catch (error) {
      console.error('Error wiping data:', error)
      toast.error('Failed to wipe dungeon crawl data')
    } finally {
      setWiping(false)
    }
  }

  const fetchInstances = async (crawlId: string) => {
    setLoadingInstances((prev) => ({ ...prev, [crawlId]: true }))
    try {
      const response = await fetch(
        `/api/admin/dungeon-crawls/${crawlId}/instances`
      )
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setInstances((prev) => ({ ...prev, [crawlId]: data.instances || [] }))
        }
      }
    } catch (error) {
      console.error('Error fetching instances:', error)
    } finally {
      setLoadingInstances((prev) => ({ ...prev, [crawlId]: false }))
    }
  }

  const fetchStats = async (crawlId: string) => {
    try {
      const response = await fetch(
        `/api/admin/dungeon-crawls/${crawlId}/stats`
      )
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setStats((prev) => ({ ...prev, [crawlId]: data.stats }))
        }
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const toggleExpand = (crawlId: string) => {
    if (expandedCrawl === crawlId) {
      setExpandedCrawl(null)
    } else {
      setExpandedCrawl(crawlId)
      fetchInstances(crawlId)
      fetchStats(crawlId)
    }
  }

  const startEdit = (crawl: DungeonCrawl) => {
    setEditingCrawl(crawl)
    setFormData({
      name: crawl.name,
      description: crawl.description || '',
      requiredParticipants: crawl.requiredParticipants,
      allowMultipleFromStock: crawl.allowMultipleFromStock,
      allowedTraits: crawl.allowedTraits || 'all',
      restartAfterFailureHours: crawl.restartAfterFailureHours,
      cooldownHours: crawl.cooldownHours,
      neverRestartAfterCompletion: crawl.neverRestartAfterCompletion,
      rewardType: crawl.rewardType,
      rewardValue: crawl.rewardValue,
      rewardDropChance1Ordinal: crawl.rewardDropChance1Ordinal,
      rewardDropChance2Ordinals: crawl.rewardDropChance2Ordinals,
      rewardDropChance3PlusOrdinals: crawl.rewardDropChance3PlusOrdinals,
      level1WindowStartMinutes: crawl.level1WindowStartMinutes,
      level1WindowDurationMinutes: crawl.level1WindowDurationMinutes,
      level2WindowStartMinutes: crawl.level2WindowStartMinutes,
      level2WindowDurationMinutes: crawl.level2WindowDurationMinutes,
      level3WindowStartMinutes: crawl.level3WindowStartMinutes,
      level3WindowDurationMinutes: crawl.level3WindowDurationMinutes,
      minParticipationPercent: crawl.minParticipationPercent,
    })
    setShowCreateForm(true)
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

        <main className="container mx-auto px-4 py-8">
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">Admin: Dungeon Crawls</h1>
              <p className="text-gray-400">Create and manage dungeon crawl configurations</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowWipeConfirm(true)}
                className="border-2 border-red-600 hover:border-red-500 bg-red-900/30 hover:bg-red-900/50 text-white"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Wipe All Data
              </Button>
              <Button onClick={() => {
              setShowCreateForm(true)
              setEditingCrawl(null)
        setFormData({
          name: '',
          description: '',
          requiredParticipants: 60,
          allowMultipleFromStock: false,
          allowedTraits: 'all' as 'all' | 'angelic' | 'demonic',
          restartAfterFailureHours: 2,
          cooldownHours: 168,
          neverRestartAfterCompletion: false,
          rewardType: 'block_chance',
          rewardValue: 10,
          rewardDropChance1Ordinal: 20,
          rewardDropChance2Ordinals: 10,
          rewardDropChance3PlusOrdinals: 5,
          level1WindowStartMinutes: 0,
          level1WindowDurationMinutes: 2,
          level2WindowStartMinutes: 4,
          level2WindowDurationMinutes: 2,
          level3WindowStartMinutes: 8,
          level3WindowDurationMinutes: 2,
          minParticipationPercent: 80,
        })
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Dungeon Crawl
            </Button>
            </div>
          </div>

          {/* Wipe Confirmation Modal */}
          {showWipeConfirm && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
              <div className="bg-gray-900 border-2 border-red-600 rounded-lg p-6 max-w-md">
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                  <h2 className="text-2xl font-bold text-red-500">Warning!</h2>
                </div>
                <p className="text-white mb-6">
                  This will permanently delete <strong>ALL</strong> dungeon crawl data including:
                  <ul className="list-disc list-inside mt-2 text-gray-300">
                    <li>All crawl configurations</li>
                    <li>All instances</li>
                    <li>All participants</li>
                    <li>All rewards and reward items</li>
                  </ul>
                  <strong className="text-red-400">This action cannot be undone!</strong>
                </p>
                <div className="flex gap-4">
                  <Button
                    onClick={handleWipeData}
                    disabled={wiping}
                    className="flex-1 border-2 border-red-600 hover:border-red-500 bg-red-900/50 hover:bg-red-900/70 text-white font-bold"
                  >
                    {wiping ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Wiping...
                      </>
                    ) : (
                      'Yes, Wipe Everything'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowWipeConfirm(false)}
                    disabled={wiping}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {showCreateForm && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4">
                {editingCrawl ? 'Edit Dungeon Crawl' : 'Create New Dungeon Crawl'}
              </h2>
              <form onSubmit={async (e) => {
                e.preventDefault()
                e.stopPropagation()
                if (editingCrawl && !updating && !creating) {
                  await handleUpdate(editingCrawl.id, formData)
                } else if (!editingCrawl && !creating && !updating) {
                  await handleCreate()
                }
              }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => updateFormField('name', e.target.value)}
                    placeholder="Dungeon Crawl Name"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => updateFormField('description', e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <Label>Required Participants</Label>
                  <Input
                    type="number"
                    value={formData.requiredParticipants}
                    onChange={(e) => updateFormField('requiredParticipants', parseInt(e.target.value) || 60)}
                  />
                </div>
                <div>
                  <Label>Allow Multiple From Stock</Label>
                  <select
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
                    style={{ color: 'white' }}
                    value={formData.allowMultipleFromStock ? 'true' : 'false'}
                    onChange={(e) => updateFormField('allowMultipleFromStock', e.target.value === 'true')}
                  >
                    <option value="false" style={{ backgroundColor: '#1f2937', color: 'white' }}>No</option>
                    <option value="true" style={{ backgroundColor: '#1f2937', color: 'white' }}>Yes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Allowed Traits</label>
                  <select
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white appearance-none"
                    value={formData.allowedTraits}
                    onChange={(e) => updateFormField('allowedTraits', e.target.value as 'all' | 'angelic' | 'demonic')}
                    style={{ backgroundColor: '#1f2937', color: 'white' }}
                  >
                    <option value="all" style={{ backgroundColor: '#1f2937', color: 'white' }}>All (Angelic & Demonic)</option>
                    <option value="angelic" style={{ backgroundColor: '#1f2937', color: 'white' }}>Angelic Only</option>
                    <option value="demonic" style={{ backgroundColor: '#1f2937', color: 'white' }}>Demonic Only</option>
                  </select>
                </div>
                <div>
                  <Label>Restart After Failure (hours)</Label>
                  <Input
                    type="number"
                    value={formData.restartAfterFailureHours}
                    onChange={(e) => updateFormField('restartAfterFailureHours', parseInt(e.target.value) || 2)}
                  />
                </div>
                <div>
                  <Label>Cooldown Hours (after completion)</Label>
                  <Input
                    type="number"
                    value={formData.cooldownHours}
                    onChange={(e) => updateFormField('cooldownHours', parseInt(e.target.value) || 168)}
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.neverRestartAfterCompletion}
                      onChange={(e) => updateFormField('neverRestartAfterCompletion', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Never restart after completion
                  </Label>
                </div>
                <div>
                  <Label>Reward Type</Label>
                  <select
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
                    style={{ color: 'white' }}
                    value={formData.rewardType}
                    onChange={(e) => updateFormField('rewardType', e.target.value as 'block_chance' | 'life_force_cap')}
                  >
                    <option value="block_chance" style={{ backgroundColor: '#1f2937', color: 'white' }}>Block Chance %</option>
                    <option value="life_force_cap" style={{ backgroundColor: '#1f2937', color: 'white' }}>Life Force Cap Increase</option>
                  </select>
                </div>
                <div>
                  <Label>Reward Value</Label>
                  <Input
                    type="number"
                    value={formData.rewardValue}
                    onChange={(e) => updateFormField('rewardValue', parseInt(e.target.value) || 10)}
                    placeholder={formData.rewardType === 'block_chance' ? '10 = +10%' : '20 = +20 cap'}
                  />
                </div>
              </div>

              <h3 className="text-lg font-bold mb-4 text-yellow-400">Reward Drop Chances</h3>
              <p className="text-sm text-gray-400 mb-4">
                Control the probability (0-100%) that each ordinal wins a reward based on how many ordinals a wallet uses
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <Label>1 Ordinal (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.rewardDropChance1Ordinal}
                    onChange={(e) => updateFormField('rewardDropChance1Ordinal', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    placeholder="20"
                  />
                  <p className="text-xs text-gray-500 mt-1">Drop chance when wallet uses 1 ordinal</p>
                </div>
                <div>
                  <Label>2 Ordinals (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.rewardDropChance2Ordinals}
                    onChange={(e) => updateFormField('rewardDropChance2Ordinals', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    placeholder="10"
                  />
                  <p className="text-xs text-gray-500 mt-1">Drop chance per ordinal when wallet uses 2</p>
                </div>
                <div>
                  <Label>3+ Ordinals (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.rewardDropChance3PlusOrdinals}
                    onChange={(e) => updateFormField('rewardDropChance3PlusOrdinals', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    placeholder="5"
                  />
                  <p className="text-xs text-gray-500 mt-1">Drop chance per ordinal when wallet uses 3+</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-6">
                <div>
                  <Label>Min Participation %</Label>
                  <Input
                    type="number"
                    value={formData.minParticipationPercent}
                    onChange={(e) => updateFormField('minParticipationPercent', parseInt(e.target.value) || 80)}
                  />
                </div>
                <div>
                  <Label>Level 1 Window Start (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.level1WindowStartMinutes}
                    onChange={(e) => updateFormField('level1WindowStartMinutes', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Level 1 Window Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.level1WindowDurationMinutes}
                    onChange={(e) => updateFormField('level1WindowDurationMinutes', parseInt(e.target.value) || 2)}
                  />
                </div>
                <div>
                  <Label>Level 2 Window Start (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.level2WindowStartMinutes}
                    onChange={(e) => updateFormField('level2WindowStartMinutes', parseInt(e.target.value) || 4)}
                  />
                </div>
                <div>
                  <Label>Level 2 Window Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.level2WindowDurationMinutes}
                    onChange={(e) => updateFormField('level2WindowDurationMinutes', parseInt(e.target.value) || 2)}
                  />
                </div>
                <div>
                  <Label>Level 3 Window Start (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.level3WindowStartMinutes}
                    onChange={(e) => updateFormField('level3WindowStartMinutes', parseInt(e.target.value) || 8)}
                  />
                </div>
                <div>
                  <Label>Level 3 Window Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.level3WindowDurationMinutes}
                    onChange={(e) => updateFormField('level3WindowDurationMinutes', parseInt(e.target.value) || 2)}
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <Button 
                  type="submit"
                  disabled={updating || creating}
                >
                  {updating || creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingCrawl ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    editingCrawl ? 'Update' : 'Create'
                  )}
                </Button>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => {
                    setShowCreateForm(false)
                    setEditingCrawl(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {crawls.map((crawl) => (
                <div key={crawl.id} className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold">{crawl.name}</h3>
                      {crawl.description && <p className="text-gray-400 text-sm mt-1">{crawl.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="text-sm px-3 py-1.5" onClick={() => startEdit(crawl)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        className="text-sm px-3 py-1.5"
                        onClick={() => handleUpdate(crawl.id, { isActive: !crawl.isActive })}
                      >
                        {crawl.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="outline"
                        className="text-sm px-3 py-1.5"
                        onClick={() => toggleExpand(crawl.id)}
                      >
                        {expandedCrawl === crawl.id ? (
                          <>
                            <ChevronUp className="w-4 h-4 mr-2" />
                            Hide Details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4 mr-2" />
                            View Details
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Participants:</span> {crawl.requiredParticipants}
                    </div>
                    <div>
                      <span className="text-gray-400">Reward:</span> +{crawl.rewardValue}
                      {crawl.rewardType === 'block_chance' ? '% Block' : ' Life Force'}
                    </div>
                    <div>
                      <span className="text-gray-400">Restart After Failure:</span> {crawl.restartAfterFailureHours}h
                    </div>
                    <div>
                      <span className="text-gray-400">Cooldown:</span> {crawl.cooldownHours}h
                    </div>
                    {crawl.neverRestartAfterCompletion && (
                      <div>
                        <span className="text-gray-400">Never Restart:</span> <span className="text-yellow-400">Yes</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400">Active Instances:</span> {crawl.activeInstances}
                    </div>
                    <div>
                      <span className="text-gray-400">Completed:</span> {crawl.completedInstances}
                    </div>
                    <div>
                      <span className="text-gray-400">Status:</span>{' '}
                      <span className={crawl.isActive ? 'text-green-400' : 'text-red-400'}>
                        {crawl.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedCrawl === crawl.id && (
                    <div className="mt-6 pt-6 border-t border-gray-700 space-y-6">
                      {/* Statistics */}
                      {stats[crawl.id] && (
                        <div className="bg-gray-800 rounded-lg p-4">
                          <h4 className="font-bold mb-3 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" />
                            Statistics
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400">Success Rate:</span>{' '}
                              <span className="font-bold">{stats[crawl.id].successRate}%</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Avg Completion:</span>{' '}
                              <span className="font-bold">{stats[crawl.id].avgCompletionTimeMinutes}m</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Unique Wallets:</span>{' '}
                              <span className="font-bold">{stats[crawl.id].uniqueWallets}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Avg Participants:</span>{' '}
                              <span className="font-bold">{stats[crawl.id].avgParticipantsPerInstance}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Level 1 Avg:</span>{' '}
                              <span className="font-bold">{stats[crawl.id].avgLevel1Percent}%</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Level 2 Avg:</span>{' '}
                              <span className="font-bold">{stats[crawl.id].avgLevel2Percent}%</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Level 3 Avg:</span>{' '}
                              <span className="font-bold">{stats[crawl.id].avgLevel3Percent}%</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Reward Items:</span>{' '}
                              <span className="font-bold">
                                {stats[crawl.id].appliedRewardItems} / {stats[crawl.id].totalRewardItems} applied
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Instances List */}
                      <div>
                        <h4 className="font-bold mb-3 flex items-center gap-2">
                          <Clock className="w-5 h-5" />
                          Recent Instances
                        </h4>
                        {loadingInstances[crawl.id] ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-6 h-6 animate-spin" />
                          </div>
                        ) : instances[crawl.id] && instances[crawl.id].length > 0 ? (
                          <div className="space-y-2">
                            {instances[crawl.id].slice(0, 10).map((instance: any) => (
                              <div
                                key={instance.id}
                                className="bg-gray-800 rounded-lg p-3 text-sm"
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <span className="font-mono text-xs text-gray-400">
                                      {instance.id.slice(0, 8)}...
                                    </span>
                                    <span
                                      className={`ml-3 px-2 py-1 rounded text-xs ${
                                        instance.status === 'completed'
                                          ? 'bg-green-900/50 text-green-400'
                                          : instance.status === 'failed' || instance.status === 'expired'
                                            ? 'bg-red-900/50 text-red-400'
                                            : 'bg-blue-900/50 text-blue-400'
                                      }`}
                                    >
                                      {instance.status}
                                    </span>
                                  </div>
                                  <span className="text-gray-500 text-xs">
                                    {instance.startedAt ? new Date(instance.startedAt).toLocaleString() : 'N/A'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                                  <div>
                                    <Users className="w-3 h-3 inline mr-1" />
                                    {instance.participantCount} participants
                                  </div>
                                  <div>
                                    Level 1: {instance.level1CompletedCount || 0} ({instance.participantCount > 0 ? Math.round(((instance.level1CompletedCount || 0) / instance.participantCount) * 100) : 0}%)
                                  </div>
                                  <div>
                                    Level 2: {instance.level2CompletedCount || 0} ({instance.participantCount > 0 ? Math.round(((instance.level2CompletedCount || 0) / instance.participantCount) * 100) : 0}%)
                                  </div>
                                  <div>
                                    Level 3: {instance.level3CompletedCount || 0} ({instance.participantCount > 0 ? Math.round(((instance.level3CompletedCount || 0) / instance.participantCount) * 100) : 0}%)
                                  </div>
                                  <div>
                                    <Gift className="w-3 h-3 inline mr-1" />
                                    {instance.rewardItemsDropped} items
                                  </div>
                                </div>
                                {instance.completedAt && (
                                  <div className="mt-2 text-xs text-gray-500">
                                    Completed: {new Date(instance.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm">No instances found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
  )
}

