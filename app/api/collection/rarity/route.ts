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

// Helper function to normalize trait values for comparison
function normalizeTraitValue(value: string): string {
  return value.trim().toLowerCase()
}

// Helper function to match traits - finds the best matching ordinal in collection
function findMatchingOrdinal(
  targetAttributes: Array<{ trait_type: string; value: string }>,
  collection: CollectionItem[],
): CollectionItem | null {
  // Normalize target attributes
  const targetNormalized = targetAttributes.map(attr => ({
    trait_type: attr.trait_type.trim(),
    value: normalizeTraitValue(attr.value),
  })).filter(attr => 
    attr.trait_type && 
    attr.value && 
    !['Ascended', 'Silver', 'Glow', 'Horde'].includes(attr.trait_type)
  )

  if (targetNormalized.length === 0) {
    return null
  }

  let bestMatch: CollectionItem | null = null
  let bestMatchScore = 0

  // Try to find exact match first
  for (const item of collection) {
    const itemAttributes = (item.meta?.attributes || []).map(attr => ({
      trait_type: attr.trait_type.trim(),
      value: normalizeTraitValue(attr.value),
    })).filter(attr => 
      attr.trait_type && 
      attr.value && 
      !['Ascended', 'Silver', 'Glow', 'Horde'].includes(attr.trait_type)
    )

    if (itemAttributes.length === 0) continue

    // Count matching traits
    let matchCount = 0
    for (const targetAttr of targetNormalized) {
      const found = itemAttributes.find(
        itemAttr => 
          itemAttr.trait_type === targetAttr.trait_type && 
          itemAttr.value === targetAttr.value
      )
      if (found) matchCount++
    }

    // Calculate match score (percentage of traits that match)
    const matchScore = matchCount / Math.max(targetNormalized.length, itemAttributes.length)

    // Exact match (all traits match)
    if (matchScore === 1 && matchCount === targetNormalized.length && matchCount === itemAttributes.length) {
      return item
    }

    // Track best partial match
    if (matchScore > bestMatchScore) {
      bestMatchScore = matchScore
      bestMatch = item
    }
  }

  // Return best match if it's a good match (at least 80% of traits match)
  return bestMatchScore >= 0.8 ? bestMatch : null
}

// POST endpoint to calculate rarity for multiple inscriptions at once
// Can accept either inscriptionIds (to look up in collection) or traits directly
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { inscriptionIds, traits } = body

    // Support two modes:
    // 1. inscriptionIds array - look up in collection.json
    // 2. traits array - array of { inscriptionId, attributes } objects
    if (inscriptionIds && !Array.isArray(inscriptionIds)) {
      return NextResponse.json(
        { success: false, error: 'inscriptionIds must be an array' },
        { status: 400 },
      )
    }

    if (traits && !Array.isArray(traits)) {
      return NextResponse.json(
        { success: false, error: 'traits must be an array' },
        { status: 400 },
      )
    }

    const traitRarity = calculateTraitRarity()
    const collection = loadCollection()

    // Calculate scores for all items in collection
    const allScores = collection
      .map((i) => ({
        id: i.id,
        score: calculateRarityScore(i.meta?.attributes || [], traitRarity),
      }))
      .sort((a, b) => b.score - a.score) // Sort descending

    const results: Array<{
      inscriptionId: string
      rarityScore: number
      rank: number | null
      found: boolean
      matchedInscriptionId?: string
    }> = []

    if (traits) {
      // Mode 2: Calculate rarity based on provided traits
      for (const traitData of traits as Array<{ inscriptionId: string; attributes: Array<{ trait_type: string; value: string }> }>) {
        const { inscriptionId, attributes } = traitData

        if (!attributes || attributes.length === 0) {
          results.push({ inscriptionId, rarityScore: 0, rank: null, found: false })
          continue
        }

        // Find matching ordinal in collection based on traits
        const matchedItem = findMatchingOrdinal(attributes, collection)

        if (matchedItem) {
          const rarityScore = calculateRarityScore(attributes, traitRarity)
          const rank = allScores.findIndex((s) => s.id === matchedItem.id) + 1

          results.push({
            inscriptionId,
            rarityScore: Math.round(rarityScore * 100) / 100,
            rank,
            found: true,
            matchedInscriptionId: matchedItem.id,
          })
        } else {
          // Still calculate rarity score even if not found in collection
          const rarityScore = calculateRarityScore(attributes, traitRarity)
          
          // Estimate rank by comparing score to all scores
          const estimatedRank = allScores.findIndex((s) => s.score < rarityScore) + 1
          const rank = estimatedRank > 0 ? estimatedRank : allScores.length + 1

          results.push({
            inscriptionId,
            rarityScore: Math.round(rarityScore * 100) / 100,
            rank,
            found: false, // Not found in collection, but rank estimated
          })
        }
      }
    } else if (inscriptionIds) {
      // Mode 1: Look up by inscription IDs in collection
      for (const id of inscriptionIds as string[]) {
        const item = collection.find((i) => i.id === id)
        if (!item) {
          results.push({ inscriptionId: id, rarityScore: 0, rank: null, found: false })
          continue
        }

        const attributes = item.meta?.attributes || []
        const rarityScore = calculateRarityScore(attributes, traitRarity)
        const rank = allScores.findIndex((s) => s.id === id) + 1

        results.push({
          inscriptionId: id,
          rarityScore: Math.round(rarityScore * 100) / 100,
          rank,
          found: true,
        })
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Either inscriptionIds or traits must be provided' },
        { status: 400 },
      )
    }

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

