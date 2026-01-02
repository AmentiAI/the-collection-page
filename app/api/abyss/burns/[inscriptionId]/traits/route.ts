import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    // Try to fetch the token directly by inscription ID
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
        { success: false, error: `Magic Eden API returned ${response.status}` },
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
    })
  } catch (error) {
    console.error(`Error fetching traits from Magic Eden for ${params.inscriptionId}:`, error)
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

