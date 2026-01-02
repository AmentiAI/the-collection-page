import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Parse traits from prompt text (same function as admin/meta route)
function parseTraitsFromPrompt(prompt: string): Array<{ trait_type: string; value: string }> {
  const attributes: Array<{ trait_type: string; value: string }> = []
  
  // Find the ASSIGNED TRAITS section
  const traitsMatch = prompt.match(/ASSIGNED TRAITS:\n([\s\S]*?)(?:\n\nTRAIT RENDERING|$)/i)
  if (!traitsMatch) return attributes
  
  const traitsSection = traitsMatch[1]
  
  // Parse each trait line (format: "Type: Name - Description")
  const traitLines = traitsSection.split('\n').filter(line => line.trim())
  
  // Traits to exclude from metadata
  const excludedTraits = new Set([
    'CUSTOM RULES',
    'BORDER',
    'QUALITY',
    'TRAIT RENDERING'
  ])
  
  for (const line of traitLines) {
    // Match pattern: "Type: Name - Description"
    const match = line.match(/^([^:]+):\s*([^-]+)\s*-/)
    if (match) {
      let traitType = match[1].trim()
      const traitValue = match[2].trim()
      
      // Skip excluded traits
      if (excludedTraits.has(traitType)) {
        continue
      }
      
      // Normalize trait type names
      if (traitType.toLowerCase().includes('hand')) {
        traitType = 'Hands'
      } else if (traitType.toLowerCase() === 'body skin') {
        traitType = 'Body Skin'
      }
      
      attributes.push({
        trait_type: traitType,
        value: traitValue
      })
    }
  }
  
  return attributes
}

export async function GET(
  request: NextRequest,
  { params }: { params: { inscriptionId: string } },
) {
  try {
    const inscriptionId = params.inscriptionId

    if (!inscriptionId) {
      return NextResponse.json(
        { success: false, error: 'inscriptionId is required' },
        { status: 400 },
      )
    }

    const pool = getPool()

    // First, try to get the saved prompt from abyss_burns
    const burnResult = await pool.query(
      `SELECT generation_prompt FROM abyss_burns WHERE inscription_id = $1 LIMIT 1`,
      [inscriptionId],
    )

    if (burnResult.rows.length > 0 && burnResult.rows[0].generation_prompt) {
      // Parse traits from saved prompt
      const prompt = burnResult.rows[0].generation_prompt
      const attributes = parseTraitsFromPrompt(prompt)

      // Detect special traits from prompt content
      const isAngelic = prompt.toLowerCase().includes('angelic')
      const isDemonic = prompt.toLowerCase().includes('demonic')
      const hasSilver = prompt.toLowerCase().includes('silver plated') || prompt.toLowerCase().includes('silver border')
      const hasGlow = prompt.toLowerCase().includes('glow')

      return NextResponse.json({
        success: true,
        traits: {
          attributes,
          isAngelic,
          isDemonic,
          hasSilver,
          hasGlow,
          allAttributes: attributes, // Include all for display
        },
        source: 'saved_prompt',
      })
    }

    // Fallback: Try Magic Eden if no saved prompt
    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    const tokenUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens/${encodeURIComponent(inscriptionId)}`
    
    const response = await fetch(tokenUrl, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'TheDamned/1.0',
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    })

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `No saved prompt found and Magic Eden API returned ${response.status}` },
        { status: response.status },
      )
    }

    const token = await response.json()
    
    // Extract attributes from various possible locations
    let attributes: Array<{ trait_type?: string; traitType?: string; value?: string }> = []
    
    if (token.meta?.attributes) {
      attributes = token.meta.attributes
    } else if (token.metadata?.attributes) {
      attributes = token.metadata.attributes
    } else if (token.attributes) {
      attributes = token.attributes
    } else if (token.meta?.traits) {
      attributes = token.meta.traits
    } else if (token.metadata?.traits) {
      attributes = token.metadata.traits
    }

    // Normalize attributes to { trait_type, value } format
    const normalizedAttributes = attributes
      .filter(attr => attr.trait_type || attr.traitType)
      .map(attr => ({
        trait_type: attr.trait_type || attr.traitType || '',
        value: attr.value || '',
      }))
      .filter(attr => attr.trait_type && attr.value)

    // Detect special traits
    const ascendedTrait = normalizedAttributes.find(
      attr => attr.trait_type === 'Ascended' && (attr.value === 'Angelic' || attr.value === 'Demonic')
    )
    
    const silverTrait = normalizedAttributes.find(
      attr => (attr.trait_type === 'Silver' || attr.trait_type === 'Has Silver') && (attr.value === 'True' || attr.value === 'true')
    )
    
    const glowTrait = normalizedAttributes.find(
      attr => (attr.trait_type === 'Glow' || attr.trait_type === 'Has Glow') && (attr.value === 'True' || attr.value === 'true')
    )

    // Filter out special traits from regular attributes
    const regularAttributes = normalizedAttributes.filter(
      attr => attr.trait_type !== 'Ascended' && attr.trait_type !== 'Silver' && attr.trait_type !== 'Has Silver' && attr.trait_type !== 'Glow' && attr.trait_type !== 'Has Glow'
    )

    return NextResponse.json({
      success: true,
      traits: {
        attributes: regularAttributes,
        isAngelic: ascendedTrait?.value === 'Angelic',
        isDemonic: ascendedTrait?.value === 'Demonic',
        hasSilver: silverTrait !== undefined,
        hasGlow: glowTrait !== undefined,
        allAttributes: normalizedAttributes, // Include all for display
      },
      source: 'magic_eden',
    })
  } catch (error) {
    console.error(`Error fetching traits for ${params.inscriptionId}:`, error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch traits',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
