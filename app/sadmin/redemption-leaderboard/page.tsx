'use client'

import { useState, useEffect } from 'react'
import { Trophy, Loader2, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import Image from 'next/image'
import Header from '@/components/Header'

type LeaderboardEntry = {
  wallet_address: string
  discord_username: string
  discord_avatar_url: string
  army_count: number
  angel_count: number
  demon_count: number
  battles_count: number
  heals_count: number
  crystallization_count: number
  ascension_circle_count: number
  resurrections_count: number
  killing_blows_count: number
  abyss_burns_count: number
  total_score: number
}

type ArmyDetail = {
  inscriptionId: string
  trait: 'Angelic' | 'Demonic'
  status: 'ready' | 'sanctuary' | null
  lifeForce: number
  lifeForceCap: number
  lifeForceCapBonus: number
  blockChanceBonus: number
  totalRewardsCount: number
  isDead: boolean
  resurrectionTime: string | null
  createdAt: string
  updatedAt: string
}

export default function RedemptionLeaderboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [armyDetails, setArmyDetails] = useState<Record<string, { loading: boolean; armies: ArmyDetail[]; error?: string }>>({})
  const [editingCell, setEditingCell] = useState<{ wallet: string; inscriptionId: string; field: string } | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null)

  const handleCopyWallet = async (walletAddress: string) => {
    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopiedWallet(walletAddress)
      setTimeout(() => setCopiedWallet(null), 2000)
    } catch (error) {
      console.error('Failed to copy wallet address:', error)
    }
  }

  const fetchLeaderboard = async () => {
    try {
      setError(null)
      const response = await fetch('/api/sadmin/redemption-leaderboard', {
        cache: 'no-store',
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch leaderboard')
      }

      setLeaderboard(result.leaderboard || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setLeaderboard([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchLeaderboard()
  }

  const truncateWallet = (wallet: string) => {
    if (wallet.length <= 12) return wallet
    return `${wallet.slice(0, 6)}...${wallet.slice(-6)}`
  }

  const truncateInscription = (inscriptionId: string) => {
    if (inscriptionId.length <= 16) return inscriptionId
    return `${inscriptionId.slice(0, 8)}...${inscriptionId.slice(-8)}`
  }

  const toggleRow = async (walletAddress: string) => {
    const isExpanded = expandedRows.has(walletAddress)
    
    if (isExpanded) {
      // Collapse
      const newExpanded = new Set(expandedRows)
      newExpanded.delete(walletAddress)
      setExpandedRows(newExpanded)
    } else {
      // Expand - fetch army details if not already loaded
      const newExpanded = new Set(expandedRows)
      newExpanded.add(walletAddress)
      setExpandedRows(newExpanded)
      
      if (!armyDetails[walletAddress]) {
        setArmyDetails(prev => ({
          ...prev,
          [walletAddress]: { loading: true, armies: [] }
        }))
        
        try {
          const response = await fetch(
            `/api/sadmin/redemption-leaderboard/${encodeURIComponent(walletAddress)}/armies`,
            { cache: 'no-store' }
          )
          const result = await response.json()
          
          if (result.success) {
            setArmyDetails(prev => ({
              ...prev,
              [walletAddress]: { loading: false, armies: result.armies || [] }
            }))
          } else {
            setArmyDetails(prev => ({
              ...prev,
              [walletAddress]: { loading: false, armies: [], error: result.error || 'Failed to load' }
            }))
          }
        } catch (err) {
          setArmyDetails(prev => ({
            ...prev,
            [walletAddress]: { loading: false, armies: [], error: 'Failed to fetch army details' }
          }))
        }
      }
    }
  }

  const startEditing = (wallet: string, inscriptionId: string, field: string, currentValue: any) => {
    setEditingCell({ wallet, inscriptionId, field })
    setEditingValue(String(currentValue ?? ''))
  }

  const saveEdit = async (wallet: string, inscriptionId: string, field: string) => {
    if (!editingCell) return
    
    const cellKey = `${wallet}-${inscriptionId}-${field}`
    setSaving(prev => {
      const newSaving = new Set(prev)
      newSaving.add(cellKey)
      return newSaving
    })
    
    try {
      const updateData: any = {}
      const value = field === 'status' || field === 'trait' 
        ? editingValue 
        : Number(editingValue) || 0
      
      updateData[field] = value

      const response = await fetch(
        `/api/sadmin/redemption-leaderboard/${encodeURIComponent(wallet)}/armies/${encodeURIComponent(inscriptionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        }
      )

      const result = await response.json()

      if (result.success) {
        // Update local state
        setArmyDetails(prev => {
          const details = prev[wallet]
          if (!details) return prev
          
          const updatedArmies = details.armies.map(army => {
            if (army.inscriptionId === inscriptionId) {
              return {
                ...army,
                [field]: result.army[field] ?? army[field as keyof ArmyDetail],
              }
            }
            return army
          })
          
          return {
            ...prev,
            [wallet]: { ...details, armies: updatedArmies }
          }
        })
      }
    } catch (err) {
      console.error('Error saving edit:', err)
    } finally {
      setSaving(prev => {
        const newSet = new Set(prev)
        newSet.delete(cellKey)
        return newSet
      })
      setEditingCell(null)
      setEditingValue('')
    }
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditingValue('')
  }

  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <Header connected={false} showMusicControls={false} />

      <main className="relative z-10 flex w-full flex-col gap-6 px-4 py-8 md:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8 text-red-500" />
            <h1 className="text-3xl font-bold text-red-500">Redemption Leaderboard</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 rounded-lg border border-red-600/40 bg-red-900/20 px-4 py-2 text-sm font-mono uppercase tracking-wider text-red-200 transition hover:bg-red-900/40 disabled:opacity-50"
          >
            {refreshing || loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-600/40 bg-red-900/20 p-4 text-red-200">
            {error}
          </div>
        )}

        {/* Points Breakdown Table */}
        <div className="rounded-xl border border-red-600/40 bg-black/60 overflow-hidden">
          <div className="bg-red-900/20 px-6 py-4 border-b border-red-800/50">
            <h2 className="text-lg font-bold text-red-200 uppercase tracking-wide">Points System Breakdown</h2>
            <p className="text-xs text-gray-400 mt-1">How points are calculated for the Redemption Leaderboard</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-red-800/50">
              <thead className="bg-red-900/10">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Category</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Action</th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Points</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-900/40">
                <tr className="hover:bg-red-900/10">
                  <td className="px-4 py-3 font-mono text-xs text-yellow-300 font-semibold">GAIN</td>
                  <td className="px-4 py-3 text-sm text-gray-200">Battles</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-green-400">+1.5 per battle</td>
                  <td className="px-4 py-3 text-xs text-gray-400">Each time your army participates in a horde attack (mega_monster_attack_logs)</td>
                </tr>
                <tr className="hover:bg-red-900/10">
                  <td className="px-4 py-3 font-mono text-xs text-yellow-300 font-semibold">GAIN</td>
                  <td className="px-4 py-3 text-sm text-gray-200">Heals</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-green-400">+1 per heal</td>
                  <td className="px-4 py-3 text-xs text-gray-400">Each army healed at the Pool of Life (heal_history.healed_count)</td>
                </tr>
                <tr className="hover:bg-red-900/10">
                  <td className="px-4 py-3 font-mono text-xs text-yellow-300 font-semibold">GAIN</td>
                  <td className="px-4 py-3 text-sm text-gray-200">Crystallizations</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-green-400">+1 per crystallization</td>
                  <td className="px-4 py-3 text-xs text-gray-400">Each distinct inscription crystallized (crystallization_records)</td>
                </tr>
                <tr className="hover:bg-red-900/10">
                  <td className="px-4 py-3 font-mono text-xs text-yellow-300 font-semibold">GAIN</td>
                  <td className="px-4 py-3 text-sm text-gray-200">Ascension Circles</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-green-400">+0.5 per circle</td>
                  <td className="px-4 py-3 text-xs text-gray-400">Each ascension circle created or participated in (summoning_powder_circles + summoning_powder_participants)</td>
                </tr>
                <tr className="hover:bg-red-900/10">
                  <td className="px-4 py-3 font-mono text-xs text-yellow-300 font-semibold">BONUS</td>
                  <td className="px-4 py-3 text-sm text-gray-200">Killing Blows</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-yellow-400">+50 per kill</td>
                  <td className="px-4 py-3 text-xs text-gray-400">Each mega monster killed (delivered the final blow - mega_monsters.killed_by matches your inscription)</td>
                </tr>
                <tr className="hover:bg-red-900/10">
                  <td className="px-4 py-3 font-mono text-xs text-red-300 font-semibold">DEDUCT</td>
                  <td className="px-4 py-3 text-sm text-gray-200">Resurrections</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-red-400">-10 per resurrection</td>
                  <td className="px-4 py-3 text-xs text-gray-400">Each army that was resurrected (battle_ordinals.resurrection_time IS NOT NULL)</td>
                </tr>
                <tr className="bg-red-950/30 border-t-2 border-red-800/50">
                  <td colSpan={4} className="px-4 py-4">
                    <div className="space-y-2">
                      <div className="text-xs font-mono text-red-200 font-semibold uppercase tracking-wide mb-2">Score Calculation Formula:</div>
                      <div className="text-sm font-mono text-gray-300 bg-black/40 p-3 rounded border border-red-800/30">
                        <div className="mb-2">
                          <span className="text-red-400">Total Score</span> = (
                            <span className="text-green-400">(Battles × 1.5) + Heals + Crystallizations + (Ascension Circles × 0.5)</span>
                            {' + '}
                            <span className="text-yellow-400">Killing Blows × 50</span>
                            {' - '}
                            <span className="text-red-400">Resurrections × 10</span>
                          ) ÷ <span className="text-yellow-400">Army Count<sup>0.4</sup></span>
                        </div>
                        <div className="text-xs text-gray-400 mt-2">
                          The efficiency curve (army_count^0.4) rewards smaller armies, allowing them to compete with larger armies. 
                          Killing blows (delivering the final blow to a mega monster) give a big 50 point bonus! 
                          Resurrections are penalized 10x to encourage keeping armies alive.
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-red-600/40 bg-black/60">
            <table className="w-full divide-y divide-red-800/50">
              <thead className="bg-red-900/20">
                <tr>
                  <th className="px-3 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200 w-12">
                    
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200 min-w-[140px]">
                    Wallet
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.3em] text-red-200 min-w-[180px]">
                    Discord
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Score
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Army
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Angels
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Demons
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Battles
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Heals
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Crystal
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Ascension
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-red-200">
                    Res
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-yellow-200">
                    Kills
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-mono uppercase tracking-[0.3em] text-purple-200">
                    Burns
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-900/40">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-4 py-8 text-center text-gray-400">
                      No data available
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((entry, index) => {
                    const isExpanded = expandedRows.has(entry.wallet_address)
                    const details = armyDetails[entry.wallet_address]
                    
                    return (
                      <>
                        <tr
                          key={entry.wallet_address}
                          onClick={(e) => {
                            // Don't toggle if clicking on a button or input
                            if ((e.target as HTMLElement).closest('button, input, select')) return
                            toggleRow(entry.wallet_address)
                          }}
                          className="transition hover:bg-red-900/20 cursor-pointer"
                        >
                          <td className="px-3 py-3 text-center">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-red-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-red-400" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs font-bold text-amber-400">
                            #{index + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-gray-200">
                                {truncateWallet(entry.wallet_address)}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyWallet(entry.wallet_address)
                                }}
                                className="text-gray-400 hover:text-white transition-colors"
                                title="Copy full wallet address"
                              >
                                {copiedWallet === entry.wallet_address ? (
                                  <Check className="h-3 w-3 text-green-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {entry.discord_avatar_url ? (
                                <Image
                                  src={entry.discord_avatar_url}
                                  alt={entry.discord_username || 'Discord'}
                                  width={24}
                                  height={24}
                                  className="rounded-full"
                                />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-gray-700 flex items-center justify-center">
                                  <span className="text-[10px] text-gray-400">?</span>
                                </div>
                              )}
                              <span className="text-xs text-gray-300">
                                {entry.discord_username || '-'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm font-bold text-amber-400">
                            {typeof entry.total_score === 'number' ? entry.total_score.toFixed(2) : Number(entry.total_score || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-200">
                            {entry.army_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-blue-300">
                            {entry.angel_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-red-300">
                            {entry.demon_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-yellow-300">
                            {entry.battles_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-green-300">
                            {entry.heals_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-purple-300">
                            {entry.crystallization_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-amber-300">
                            {entry.ascension_circle_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-cyan-300">
                            {entry.resurrections_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-bold text-yellow-400">
                            {entry.killing_blows_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-purple-300">
                            {entry.abyss_burns_count.toLocaleString()}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${entry.wallet_address}-details`} className="bg-red-950/30">
                            <td colSpan={15} className="px-4 py-6">
                              {details?.loading ? (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 className="h-6 w-6 animate-spin text-red-400" />
                                </div>
                              ) : details?.error ? (
                                <div className="text-center text-red-400 py-4">{details.error}</div>
                              ) : details?.armies && details.armies.length > 0 ? (
                                <div className="space-y-4">
                                  <h3 className="text-sm font-bold text-red-300 mb-3">
                                    Army Details ({details.armies.length} armies)
                                  </h3>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead className="bg-red-900/30">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-[9px] font-mono uppercase text-red-200">Inscription ID</th>
                                          <th className="px-3 py-2 text-left text-[9px] font-mono uppercase text-red-200">Trait</th>
                                          <th className="px-3 py-2 text-left text-[9px] font-mono uppercase text-red-200">Status</th>
                                          <th className="px-3 py-2 text-right text-[9px] font-mono uppercase text-red-200">Life Force</th>
                                          <th className="px-3 py-2 text-right text-[9px] font-mono uppercase text-red-200">Max Life Force</th>
                                          <th className="px-3 py-2 text-right text-[9px] font-mono uppercase text-red-200">HP Cap Bonus</th>
                                          <th className="px-3 py-2 text-right text-[9px] font-mono uppercase text-red-200">Block Bonus</th>
                                          <th className="px-3 py-2 text-right text-[9px] font-mono uppercase text-red-200">Total Rewards</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-red-900/40">
                                        {details.armies.map((army) => {
                                          const isEditing = editingCell?.wallet === entry.wallet_address && 
                                                           editingCell?.inscriptionId === army.inscriptionId
                                          const cellKey = (field: string) => `${entry.wallet_address}-${army.inscriptionId}-${field}`
                                          const isSaving = (field: string) => saving.has(cellKey(field))
                                          
                                          return (
                                            <tr key={army.inscriptionId} className="hover:bg-red-900/20">
                                              <td className="px-3 py-2 font-mono text-gray-300">
                                                {truncateInscription(army.inscriptionId)}
                                              </td>
                                              <td 
                                                className="px-3 py-2 cursor-pointer hover:bg-red-900/30 transition"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  if (!isEditing) startEditing(entry.wallet_address, army.inscriptionId, 'trait', army.trait)
                                                }}
                                              >
                                                {isEditing && editingCell?.field === 'trait' ? (
                                                  <select
                                                    value={editingValue}
                                                    onChange={(e) => setEditingValue(e.target.value)}
                                                    onBlur={() => saveEdit(entry.wallet_address, army.inscriptionId, 'trait')}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') saveEdit(entry.wallet_address, army.inscriptionId, 'trait')
                                                      if (e.key === 'Escape') cancelEdit()
                                                    }}
                                                    className="bg-red-900/50 border border-red-600 text-white rounded px-2 py-1 text-xs font-mono"
                                                    autoFocus
                                                  >
                                                    <option value="">None</option>
                                                    <option value="Angelic">Angelic</option>
                                                    <option value="Demonic">Demonic</option>
                                                  </select>
                                                ) : isSaving('trait') ? (
                                                  <Loader2 className="h-3 w-3 animate-spin text-red-400" />
                                                ) : (
                                                  <span className={`font-bold ${army.trait === 'Angelic' ? 'text-cyan-400' : 'text-red-400'}`}>
                                                    {army.trait || 'N/A'}
                                                  </span>
                                                )}
                                              </td>
                                              <td 
                                                className="px-3 py-2 cursor-pointer hover:bg-red-900/30 transition"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  if (!isEditing) startEditing(entry.wallet_address, army.inscriptionId, 'status', army.status)
                                                }}
                                              >
                                                {isEditing && editingCell?.field === 'status' ? (
                                                  <select
                                                    value={editingValue}
                                                    onChange={(e) => setEditingValue(e.target.value)}
                                                    onBlur={() => saveEdit(entry.wallet_address, army.inscriptionId, 'status')}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') saveEdit(entry.wallet_address, army.inscriptionId, 'status')
                                                      if (e.key === 'Escape') cancelEdit()
                                                    }}
                                                    className="bg-red-900/50 border border-red-600 text-white rounded px-2 py-1 text-xs font-mono"
                                                    autoFocus
                                                  >
                                                    <option value="">None</option>
                                                    <option value="ready">Ready</option>
                                                    <option value="sanctuary">Sanctuary</option>
                                                  </select>
                                                ) : isSaving('status') ? (
                                                  <Loader2 className="h-3 w-3 animate-spin text-red-400" />
                                                ) : (
                                                  <span className="text-gray-400">
                                                    {army.status || 'N/A'}
                                                  </span>
                                                )}
                                              </td>
                                              <td 
                                                className="px-3 py-2 text-right font-mono text-gray-200 cursor-pointer hover:bg-red-900/30 transition"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  if (!isEditing) startEditing(entry.wallet_address, army.inscriptionId, 'lifeForce', army.lifeForce)
                                                }}
                                              >
                                                {isEditing && editingCell?.field === 'lifeForce' ? (
                                                  <input
                                                    type="number"
                                                    value={editingValue}
                                                    onChange={(e) => setEditingValue(e.target.value)}
                                                    onBlur={() => saveEdit(entry.wallet_address, army.inscriptionId, 'lifeForce')}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') saveEdit(entry.wallet_address, army.inscriptionId, 'lifeForce')
                                                      if (e.key === 'Escape') cancelEdit()
                                                    }}
                                                    className="bg-red-900/50 border border-red-600 text-white rounded px-2 py-1 text-xs font-mono w-20 text-right"
                                                    autoFocus
                                                  />
                                                ) : isSaving('lifeForce') ? (
                                                  <Loader2 className="h-3 w-3 animate-spin text-red-400 ml-auto" />
                                                ) : (
                                                  army.lifeForce
                                                )}
                                              </td>
                                              <td 
                                                className="px-3 py-2 text-right font-mono text-gray-200 cursor-pointer hover:bg-red-900/30 transition"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  if (!isEditing) startEditing(entry.wallet_address, army.inscriptionId, 'lifeForceCap', army.lifeForceCap)
                                                }}
                                              >
                                                {isEditing && editingCell?.field === 'lifeForceCap' ? (
                                                  <input
                                                    type="number"
                                                    value={editingValue}
                                                    onChange={(e) => setEditingValue(e.target.value)}
                                                    onBlur={() => saveEdit(entry.wallet_address, army.inscriptionId, 'lifeForceCap')}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') saveEdit(entry.wallet_address, army.inscriptionId, 'lifeForceCap')
                                                      if (e.key === 'Escape') cancelEdit()
                                                    }}
                                                    className="bg-red-900/50 border border-red-600 text-white rounded px-2 py-1 text-xs font-mono w-20 text-right"
                                                    autoFocus
                                                  />
                                                ) : isSaving('lifeForceCap') ? (
                                                  <Loader2 className="h-3 w-3 animate-spin text-red-400 ml-auto" />
                                                ) : (
                                                  army.lifeForceCap
                                                )}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono text-green-400">
                                                {army.lifeForceCapBonus > 0 ? `+${army.lifeForceCapBonus}` : '-'}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono text-purple-400">
                                                {army.blockChanceBonus > 0 ? `+${army.blockChanceBonus}%` : '-'}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono text-amber-400">
                                                {army.totalRewardsCount}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center text-gray-400 py-4">No army details available</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

