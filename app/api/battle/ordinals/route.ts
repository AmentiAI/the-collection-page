import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface MagicEdenToken {
  inscriptionId?: string
  id?: string
  listed?: boolean
  listedPrice?: number
  priceInfo?: {
    price?: number
  }
  meta?: {
    attributes?: Array<{
      trait_type?: string
      traitType?: string
      value?: string
    }>
  }
  metadata?: {
    attributes?: Array<{
      trait_type?: string
      traitType?: string
      value?: string
    }>
  }
  contentURI?: string
  imageURI?: string
  attributes?: Array<{
    trait_type?: string
    traitType?: string
    value?: string
  }>
}

export async function GET(request: NextRequest) {
  let client
  try {
    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('walletAddress')?.trim()

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Fetch ordinals from Magic Eden
    const magicEdenResponse = await fetch(
      `${request.nextUrl.origin}/api/magic-eden?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned&fetchAll=true`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    )

    if (!magicEdenResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch ordinals from Magic Eden' },
        { status: 500 }
      )
    }

    const magicEdenData = await magicEdenResponse.json()
    const tokens: MagicEdenToken[] = Array.isArray(magicEdenData.tokens)
      ? magicEdenData.tokens
      : []

    // Check for any listed ordinals
    const hasListed = tokens.some((token) => {
      const isListed = token.listed === true
      const hasListedPrice = token.listedPrice && Number(token.listedPrice) > 0
      const hasPrice =
        token.priceInfo?.price && Number(token.priceInfo.price) > 0
      return isListed || hasListedPrice || hasPrice
    })

    if (hasListed) {
      return NextResponse.json(
        {
          error: 'You have listed ordinals. Please delist them before entering battle.',
          hasListed: true,
        },
        { status: 403 }
      )
    }

    // Filter for ordinals with Angelic or Demonic trait
    const battleOrdinals = tokens
      .map((token) => {
        // Get inscription ID - Magic Eden uses 'id' field
        const inscriptionId = token.id || token.inscriptionId
        if (!inscriptionId) return null

        // Try multiple ways to get attributes from Magic Eden API response
        // Based on actual API response: attributes are in token.meta.attributes
        let attributes: Array<{
          trait_type?: string
          traitType?: string
          value?: string
        }> = []

        // First check token.meta.attributes (primary location in Magic Eden response)
        if (token.meta?.attributes && Array.isArray(token.meta.attributes)) {
          attributes = token.meta.attributes
        }

        // Fallback to token.metadata.attributes
        if ((!attributes || attributes.length === 0) && token.metadata?.attributes && Array.isArray(token.metadata.attributes)) {
          attributes = token.metadata.attributes
        }

        // Fallback to direct properties
        if ((!attributes || attributes.length === 0) && token.attributes && Array.isArray(token.attributes)) {
          attributes = token.attributes
        }

        // Check if metadata is a string that needs parsing
        if ((!attributes || attributes.length === 0) && token.metadata && typeof token.metadata === 'string') {
          try {
            const parsed = JSON.parse(token.metadata)
            if (Array.isArray(parsed.attributes)) {
              attributes = parsed.attributes
            } else if (Array.isArray(parsed.traits)) {
              attributes = parsed.traits
            }
          } catch (e) {
            // Not JSON, skip
          }
        }

        // Check for inscription metadata (if token has inscription property)
        if ((!attributes || attributes.length === 0) && (token as any).inscription) {
          const inscription = (token as any).inscription
          if (inscription.metadata) {
            if (Array.isArray(inscription.metadata.attributes)) {
              attributes = inscription.metadata.attributes
            } else if (Array.isArray(inscription.metadata.traits)) {
              attributes = inscription.metadata.traits
            } else if (typeof inscription.metadata === 'string') {
              try {
                const parsed = JSON.parse(inscription.metadata)
                if (Array.isArray(parsed.attributes)) {
                  attributes = parsed.attributes
                } else if (Array.isArray(parsed.traits)) {
                  attributes = parsed.traits
                }
              } catch (e) {
                // Not JSON, skip
              }
            }
          }
        }

        // Ensure attributes is an array
        if (!Array.isArray(attributes)) {
          attributes = []
        }

        const ascendedTrait = attributes.find(
          (attr) =>
            (attr.trait_type === 'Ascended' || attr.traitType === 'Ascended') &&
            (attr.value === 'Angelic' || attr.value === 'Demonic')
        )

        if (!ascendedTrait) return null

        return {
          inscriptionId,
          imageUrl:
            token.contentURI ||
            token.imageURI ||
            `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(inscriptionId)}`,
          trait: ascendedTrait.value as 'Angelic' | 'Demonic',
        }
      })
      .filter((ordinal): ordinal is NonNullable<typeof ordinal> => ordinal !== null)

    // Fetch battle statuses and life force from database
    const inscriptionIds = battleOrdinals.map((o) => o.inscriptionId)
    let statusMap: Record<string, 'ready' | 'sanctuary'> = {}
    let lifeForceMap: Record<string, number> = {}

    if (inscriptionIds.length > 0) {
      const statusResult = await client.query(
        `SELECT inscription_id, status, life_force 
         FROM battle_ordinals 
         WHERE wallet_address = $1 AND inscription_id = ANY($2)`,
        [walletAddress, inscriptionIds]
      )

      statusResult.rows.forEach((row) => {
        statusMap[row.inscription_id] = row.status
        lifeForceMap[row.inscription_id] = row.life_force ?? 100
      })
    }

    // Add status and life force to each ordinal (null if not in DB - requires manual ready action)
    const ordinalsWithStatus = battleOrdinals.map((ordinal) => ({
      ...ordinal,
      status: statusMap[ordinal.inscriptionId] || null,
      lifeForce: lifeForceMap[ordinal.inscriptionId] ?? 100,
    }))

    return NextResponse.json({
      success: true,
      ordinals: ordinalsWithStatus,
      hasListed: false,
    })
  } catch (error) {
    console.error('Error fetching battle ordinals:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

