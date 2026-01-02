'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, Filter, X } from 'lucide-react'

interface OrdinalItem {
  id: string
  name: string
  attributes: Array<{ trait_type: string; value: string }>
  rarityScore: number
  rank: number
}

interface TraitFilter {
  trait_type: string
  value: string
}

export default function CollectionViewerPage() {
  const [items, setItems] = useState<OrdinalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<TraitFilter[]>([])
  const [availableTraitTypes, setAvailableTraitTypes] = useState<string[]>([])
  const [availableTraitValues, setAvailableTraitValues] = useState<Record<string, string[]>>({})
  const [sortBy, setSortBy] = useState<'rank' | 'score' | 'name'>('rank')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadCollection()
  }, [])

  const loadCollection = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/collection/all')
      const data = await response.json()

      if (data.success && Array.isArray(data.items)) {
        setItems(data.items)

        // Extract unique trait types and values
        const traitTypes = new Set<string>()
        const traitValues: Record<string, Set<string>> = {}

        data.items.forEach((item: OrdinalItem) => {
          item.attributes.forEach((attr) => {
            traitTypes.add(attr.trait_type)
            if (!traitValues[attr.trait_type]) {
              traitValues[attr.trait_type] = new Set()
            }
            traitValues[attr.trait_type].add(attr.value)
          })
        })

        setAvailableTraitTypes(Array.from(traitTypes).sort())
        setAvailableTraitValues(
          Object.fromEntries(
            Object.entries(traitValues).map(([key, values]) => [key, Array.from(values).sort()])
          )
        )
      } else {
        setError(data.error || 'Failed to load collection')
      }
    } catch (err) {
      console.error('Error loading collection:', err)
      setError('Failed to load collection')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const addFilter = () => {
    if (availableTraitTypes.length > 0) {
      setFilters([...filters, { trait_type: availableTraitTypes[0], value: '' }])
    }
  }

  const updateFilter = (index: number, field: 'trait_type' | 'value', newValue: string) => {
    setFilters((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: newValue }
      return updated
    })
  }

  const removeFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index))
  }

  const filteredAndSortedItems = useMemo(() => {
    let filtered = items

    // Apply filters
    if (filters.length > 0) {
      filtered = items.filter((item) => {
        return filters.every((filter) => {
          if (!filter.trait_type || !filter.value) return true
          return item.attributes.some(
            (attr) => attr.trait_type === filter.trait_type && attr.value === filter.value
          )
        })
      })
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0
      if (sortBy === 'rank') {
        comparison = a.rank - b.rank
      } else if (sortBy === 'score') {
        comparison = a.rarityScore - b.rarityScore
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name)
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [items, filters, sortBy, sortOrder])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="text-2xl">Loading collection...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="text-2xl text-red-500">Error: {error}</div>
            <button
              onClick={loadCollection}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Collection Viewer</h1>
          <p className="text-gray-400">
            View all {items.length} ordinals with rarity ranks and traits
          </p>
        </div>

        {/* Filters and Sorting */}
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={addFilter}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
            >
              <Filter className="h-4 w-4" />
              Add Filter
            </button>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rank' | 'score' | 'name')}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-white"
              >
                <option value="rank">Rank</option>
                <option value="score">Rarity Score</option>
                <option value="name">Name</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            <div className="text-sm text-gray-400">
              Showing {filteredAndSortedItems.length} of {items.length} ordinals
            </div>
          </div>

          {/* Filter inputs */}
          {filters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filters.map((filter, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-800 rounded border border-gray-700">
                  <select
                    value={filter.trait_type}
                    onChange={(e) => updateFilter(index, 'trait_type', e.target.value)}
                    className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                  >
                    {availableTraitTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filter.value}
                    onChange={(e) => updateFilter(index, 'value', e.target.value)}
                    className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                  >
                    <option value="">Any value</option>
                    {availableTraitValues[filter.trait_type]?.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeFilter(index)}
                    className="p-1 hover:bg-gray-700 rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAndSortedItems.map((item) => {
            const isExpanded = expandedItems.has(item.id)
            return (
              <div
                key={item.id}
                className="p-4 bg-gray-900 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="mb-3">
                  <div className="text-sm font-mono text-gray-400 mb-1 truncate" title={item.id}>
                    {item.id.slice(0, 16)}...
                  </div>
                  <div className="text-lg font-bold mb-2">{item.name}</div>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Rank:</span>{' '}
                      <span className="font-bold text-purple-400">#{item.rank}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Score:</span>{' '}
                      <span className="font-bold">{item.rarityScore.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => toggleExpanded(item.id)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
                >
                  <span>{isExpanded ? 'Hide' : 'Show'} Traits ({item.attributes.length})</span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {item.attributes.map((attr, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-gray-800 rounded text-xs border border-gray-700"
                      >
                        <div className="text-gray-400 text-xs mb-1">{attr.trait_type}</div>
                        <div className="text-white font-medium">{attr.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredAndSortedItems.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            No ordinals match the current filters
          </div>
        )}
      </div>
    </div>
  )
}

