'use client'

import { useState } from 'react'
import { Ordinal } from '@/types'

interface FiltersProps {
  ordinals: Ordinal[]
  filters: Record<string, Set<string>>
  onFilterChange: (category: string, traitName: string, checked: boolean) => void
  onClearAll: () => void
}

export default function Filters({ ordinals, filters, onFilterChange, onClearAll }: FiltersProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const categories = new Set<string>()
  ordinals.forEach(ordinal => {
    Object.keys(ordinal.traits).forEach(category => {
      categories.add(category)
    })
  })

  const getTraitsForCategory = (category: string) => {
    const traits = new Set<string>()
    ordinals.forEach(ordinal => {
      const trait = ordinal.traits[category]?.name
      if (trait) {
        traits.add(trait)
      }
    })
    return Array.from(traits).sort()
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

  return (
    <aside className="bg-[rgba(20,20,20,0.95)] border-2 border-[#8B0000] rounded-lg p-4 sm:p-6 h-fit sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-2 border-b-2 border-[#8B0000] gap-3 sm:gap-0">
        <h2 className="text-[#ff0000] text-xl sm:text-2xl font-bold">FILTERS</h2>
        <button
          onClick={onClearAll}
          className="w-full sm:w-auto px-4 py-2 bg-[#8B0000] text-white rounded hover:bg-[#ff0000] hover:shadow-[0_0_15px_rgba(255,0,0,0.5)] font-bold text-sm uppercase transition-all"
        >
          Clear All
        </button>
      </div>

      <div className="space-y-4">
        {Array.from(categories).sort().map(category => {
          const traits = getTraitsForCategory(category)
          const isExpanded = expandedCategories.has(category)
          const activeCount = filters[category]?.size || 0

          return (
            <div key={category} className="border-b border-gray-700 pb-4">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex justify-between items-center text-[#ff6b6b] font-bold uppercase tracking-wide hover:text-[#ff0000] transition-colors mb-2"
              >
                <span>{category} {activeCount > 0 && `(${activeCount})`}</span>
                <span className="text-lg">{isExpanded ? '−' : '+'}</span>
              </button>

              {isExpanded && (
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {traits.map(traitName => (
                    <label
                      key={`${category}-${traitName}`}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-all ${
                        filters[category]?.has(traitName)
                          ? 'bg-[rgba(255,0,0,0.2)] border-l-[3px] border-[#ff0000] text-[#ff6b6b]'
                          : 'hover:bg-[rgba(139,0,0,0.3)] border-l-[3px] border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={filters[category]?.has(traitName) || false}
                        onChange={(e) => onFilterChange(category, traitName, e.target.checked)}
                        className="cursor-pointer"
                      />
                      <span className="text-sm">{traitName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
