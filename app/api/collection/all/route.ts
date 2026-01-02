import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

interface CollectionItem {
  id: string
  meta?: {
    name?: string
    attributes?: Array<{ trait_type: string; value: string }>
  }
}

interface TraitRarity {
  [traitType: string]: {
    [value: string]: {
      count: number
      percentage: number
    }
  }
}

// Cache for collection data and rarity calculations
let collectionCache: CollectionItem[] | null = null
let rarityCache: TraitRarity | null = null
let totalItems = 0

function loadCollection(): CollectionItem[] {
  if (collectionCache) {
    return collectionCache
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'collection.json')
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const collection = JSON.parse(fileContent) as CollectionItem[]
    collectionCache = collection
    totalItems = collection.length
    return collection
  } catch (error) {
    console.error('Error loading collection.json:', error)
    return []
  }
}

function calculateTraitRarity(): TraitRarity {
  if (rarityCache) {
    return rarityCache
  }

  const collection = loadCollection()
  const traitCounts: TraitRarity = {}

  // Count occurrences of each trait value
  for (const item of collection) {
    const attributes = item.meta?.attributes || []
    for (const attr of attributes) {
      const traitType = attr.trait_type
      const value = attr.value

      if (!traitCounts[traitType]) {
        traitCounts[traitType] = {}
      }
      if (!traitCounts[traitType][value]) {
        traitCounts[traitType][value] = { count: 0, percentage: 0 }
      }
      traitCounts[traitType][value].count++
    }
  }

  // Calculate percentages
  for (const traitType in traitCounts) {
    for (const value in traitCounts[traitType]) {
      const count = traitCounts[traitType][value].count
      traitCounts[traitType][value].percentage = totalItems > 0 ? (count / totalItems) * 100 : 0
    }
  }

  rarityCache = traitCounts
  return traitCounts
}

function calculateRarityScore(attributes: Array<{ trait_type: string; value: string }>, traitRarity: TraitRarity): number {
  if (attributes.length === 0) return 0

  let totalScore = 0
  let validTraits = 0

  for (const attr of attributes) {
    const traitType = attr.trait_type
    const value = attr.value

    // Skip special traits that shouldn't affect rarity
    if (traitType === 'Ascended' || traitType === 'Silver' || traitType === 'Glow' || traitType === 'Horde') {
      continue
    }

    const rarity = traitRarity[traitType]?.[value]
    if (rarity) {
      // Lower percentage = rarer = higher score
      // Use inverse percentage as score (100 - percentage)
      totalScore += 100 - rarity.percentage
      validTraits++
    }
  }

  // Return average score, or 0 if no valid traits
  return validTraits > 0 ? totalScore / validTraits : 0
}

export async function GET(request: NextRequest) {
  try {
    const collection = loadCollection()
    const traitRarity = calculateTraitRarity()

    // Calculate scores for all items
    const itemsWithScores = collection.map((item) => ({
      id: item.id,
      name: item.meta?.name || `The Damned #${item.id.slice(-4)}`,
      attributes: item.meta?.attributes || [],
      rarityScore: calculateRarityScore(item.meta?.attributes || [], traitRarity),
    }))

    // Sort by rarity score (descending) to calculate rank
    const sorted = itemsWithScores.sort((a, b) => b.rarityScore - a.rarityScore)

    // Add rank to each item
    const itemsWithRank = sorted.map((item, index) => ({
      ...item,
      rank: index + 1,
    }))

    return NextResponse.json({
      success: true,
      items: itemsWithRank,
      totalItems,
    })
  } catch (error) {
    console.error('Error loading all collection items:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load collection',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

