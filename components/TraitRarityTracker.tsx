'use client'

import { useState, useEffect } from 'react'

interface TraitRarity {
  trait_type: string
  value: string
  floor_price?: number
  count?: number
  percentage?: number
}

interface TraitCategory {
  [traitType: string]: {
    [value: string]: {
      floor_price?: number
      count?: number
      percentage?: number
    }
  }
}

interface TraitRarityTrackerProps {
  collectionSymbol?: string
}

export default function TraitRarityTracker({ collectionSymbol = 'the-damned' }: TraitRarityTrackerProps) {
  const [traits, setTraits] = useState<TraitCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [selectedTrait, setSelectedTrait] = useState<{ category: string; value: string } | null>(null)

  useEffect(() => {
    fetchTraitRarity()
  }, [collectionSymbol])

  const fetchTraitRarity = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/magic-eden/traits?collectionSymbol=${encodeURIComponent(collectionSymbol)}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch trait rarity: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Process traits data if available
      if (data.traits && data.hasTraits && Object.keys(data.traits).length > 0) {
        setTraits(data.traits)
      } else if (data.error) {
        throw new Error(data.error || `API returned status ${response.status}`)
      } else {
        // No traits data available
        setTraits({})
        setError(null) // Don't treat this as an error, just no data
      }
    } catch (err) {
      console.error('Error fetching trait rarity:', err)
      setError(err instanceof Error ? err.message : 'Failed to load trait rarity')
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(category)) {
        newSet.delete(category)
      } else {
        newSet.add(category)
      }
      return newSet
    })
  }

  const getRarityColor = (percentage?: number) => {
    if (!percentage) return 'text-gray-400'
    if (percentage < 1) return 'text-purple-500'
    if (percentage < 5) return 'text-blue-500'
    if (percentage < 10) return 'text-green-500'
    if (percentage < 20) return 'text-yellow-500'
    return 'text-gray-400'
  }

  const getRarityLabel = (percentage?: number) => {
    if (!percentage) return 'Unknown'
    if (percentage < 1) return 'Ultra Rare'
    if (percentage < 5) return 'Very Rare'
    if (percentage < 10) return 'Rare'
    if (percentage < 20) return 'Uncommon'
    return 'Common'
  }

  if (loading) {
    return (
      <div className="bg-[rgba(20,20,20,0.95)] border-2 border-[#8B0000] rounded-lg p-6">
        <h2 className="text-[#ff0000] text-2xl font-bold mb-4">TRAIT RARITY TRACKER</h2>
        <div className="text-gray-400 text-center py-8">
          <div className="animate-pulse">Loading rarity data...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[rgba(20,20,20,0.95)] border-2 border-[#8B0000] rounded-lg p-6">
        <h2 className="text-[#ff0000] text-2xl font-bold mb-4">TRAIT RARITY TRACKER</h2>
        <div className="text-red-500 text-center py-8">
          <p>Error: {error}</p>
          <button
            onClick={fetchTraitRarity}
            className="mt-4 px-4 py-2 bg-[#8B0000] text-white rounded hover:bg-[#a00000] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!traits || Object.keys(traits).length === 0) {
    return (
      <div className="bg-[rgba(20,20,20,0.95)] border-2 border-[#8B0000] rounded-lg p-6">
        <h2 className="text-[#ff0000] text-2xl font-bold mb-4">TRAIT RARITY TRACKER</h2>
        <div className="text-gray-400 text-center py-8">
          <p>No trait rarity data available</p>
          <p className="text-sm mt-2">Data will appear when available from Magic Eden</p>
        </div>
      </div>
    )
  }

  const categories = Object.keys(traits).sort()

  return (
    <div className="bg-[rgba(20,20,20,0.95)] border-2 border-[#8B0000] rounded-lg p-6">
      <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-[#8B0000]">
        <h2 className="text-[#ff0000] text-2xl font-bold">TRAIT RARITY TRACKER</h2>
        <button
          onClick={fetchTraitRarity}
          className="text-[#ff0000] hover:text-[#ff4444] text-sm transition-colors"
          title="Refresh data"
        >
          🔄
        </button>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {categories.map(category => {
          const categoryTraits = traits[category]
          const traitValues = Object.entries(categoryTraits)
            .map(([value, data]) => ({
              value,
              ...data
            }))
            .sort((a, b) => {
              // Sort by rarity (lower percentage = rarer)
              const aPct = a.percentage || 100
              const bPct = b.percentage || 100
              return aPct - bPct
            })

          const isExpanded = expandedCategories.has(category)

          return (
            <div key={category} className="border border-[#8B0000]/50 rounded">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 bg-[#8B0000]/20 hover:bg-[#8B0000]/30 transition-colors flex justify-between items-center text-left"
              >
                <span className="text-[#ff0000] font-bold uppercase text-sm">
                  {category} ({traitValues.length})
                </span>
                <span className="text-[#ff0000]">{isExpanded ? '−' : '+'}</span>
              </button>

              {isExpanded && (
                <div className="p-4 space-y-2 bg-black/30">
                  {traitValues.map(({ value, count, percentage, floor_price }) => (
                    <div
                      key={value}
                      className={`p-3 rounded border ${
                        selectedTrait?.category === category && selectedTrait?.value === value
                          ? 'border-[#ff0000] bg-[#ff0000]/10'
                          : 'border-[#8B0000]/30 hover:border-[#8B0000]/50'
                      } transition-colors cursor-pointer`}
                      onClick={() => setSelectedTrait({ category, value })}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-white font-medium text-sm">{value}</span>
                        {percentage !== undefined && (
                          <span className={`text-xs font-bold ${getRarityColor(percentage)}`}>
                            {getRarityLabel(percentage)}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400">
                        {count !== undefined && (
                          <span>
                            {count.toLocaleString()} {count === 1 ? 'item' : 'items'}
                          </span>
                        )}
                        {percentage !== undefined && (
                          <span className={getRarityColor(percentage)}>
                            {percentage.toFixed(2)}%
                          </span>
                        )}
                        {floor_price !== undefined && floor_price > 0 && (
                          <span className="text-green-500 font-bold">
                            {floor_price.toLocaleString()} sats
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedTrait && (
        <div className="mt-4 p-4 bg-[#8B0000]/20 border border-[#ff0000] rounded">
          <p className="text-white text-sm">
            <span className="text-[#ff0000] font-bold">Selected:</span>{' '}
            {selectedTrait.category} → {selectedTrait.value}
          </p>
        </div>
      )}
    </div>
  )
}
