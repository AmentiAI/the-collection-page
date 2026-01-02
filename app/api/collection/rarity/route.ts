import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

interface CollectionItem {
  id: string
  meta?: {
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
    const { searchParams } = new URL(request.url)
    const inscriptionId = searchParams.get('inscriptionId')

    // Load collection and calculate rarity
    const traitRarity = calculateTraitRarity()

    if (inscriptionId) {
      // Calculate rarity for a specific inscription
      const collection = loadCollection()
      const item = collection.find((i) => i.id === inscriptionId)

      if (!item) {
        return NextResponse.json(
          { success: false, error: 'Inscription not found in collection' },
          { status: 404 },
        )
      }

      const attributes = item.meta?.attributes || []
      const rarityScore = calculateRarityScore(attributes, traitRarity)

      // Calculate rank (how many ordinals have a higher rarity score)
      const allScores = collection
        .map((i) => ({
          id: i.id,
          score: calculateRarityScore(i.meta?.attributes || [], traitRarity),
        }))
        .sort((a, b) => b.score - a.score) // Sort descending (highest score first)

      const rank = allScores.findIndex((s) => s.id === inscriptionId) + 1

      return NextResponse.json({
        success: true,
        inscriptionId,
        rarityScore: Math.round(rarityScore * 100) / 100,
        rank,
        totalItems,
        attributes,
      })
    }

    // Return trait rarity data
    return NextResponse.json({
      success: true,
      traitRarity,
      totalItems,
    })
  } catch (error) {
    console.error('Error calculating rarity:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to calculate rarity',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

// POST endpoint to calculate rarity for multiple inscriptions at once
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { inscriptionIds } = body

    if (!Array.isArray(inscriptionIds)) {
      return NextResponse.json(
        { success: false, error: 'inscriptionIds must be an array' },
        { status: 400 },
      )
    }

    const traitRarity = calculateTraitRarity()
    const collection = loadCollection()

    // Calculate scores for all items
    const allScores = collection
      .map((i) => ({
        id: i.id,
        score: calculateRarityScore(i.meta?.attributes || [], traitRarity),
      }))
      .sort((a, b) => b.score - a.score) // Sort descending

    // Get results for requested inscriptions
    const results = inscriptionIds.map((id: string) => {
      const item = collection.find((i) => i.id === id)
      if (!item) {
        return { inscriptionId: id, rarityScore: 0, rank: null, found: false }
      }

      const attributes = item.meta?.attributes || []
      const rarityScore = calculateRarityScore(attributes, traitRarity)
      const rank = allScores.findIndex((s) => s.id === id) + 1

      return {
        inscriptionId: id,
        rarityScore: Math.round(rarityScore * 100) / 100,
        rank,
        found: true,
      }
    })

    return NextResponse.json({
      success: true,
      results,
      totalItems,
    })
  } catch (error) {
    console.error('Error calculating batch rarity:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to calculate rarity',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

