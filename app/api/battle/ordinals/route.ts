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
    const traitMap: Record<string, 'Angelic' | 'Demonic'> = {}
    const lifeForceCapMap: Record<string, number> = {}

    if (inscriptionIds.length > 0) {
      // First, check for any battle_ordinals records with these inscription_ids that belong to different wallets
      // This handles ownership transfers - update wallet_address to current owner
      const ownershipCheck = await client.query(
        `SELECT inscription_id, wallet_address, status, life_force
         FROM battle_ordinals 
         WHERE inscription_id = ANY($1) AND LOWER(wallet_address) != LOWER($2)`,
        [inscriptionIds, walletAddress]
      )

      // Update ownership for any ordinals that were transferred
      if (ownershipCheck.rows.length > 0) {
        const transferredIds = ownershipCheck.rows.map((row) => row.inscription_id)
        await client.query(
          `UPDATE battle_ordinals
           SET wallet_address = $1, updated_at = NOW()
           WHERE inscription_id = ANY($2) AND LOWER(wallet_address) != LOWER($1)`,
          [walletAddress, transferredIds]
        )
        console.log(`[battle/ordinals] Updated ownership for ${transferredIds.length} transferred ordinals`)
      }

      // Now fetch battle statuses, life force, life_force_cap, and trait for current wallet
      const statusResult = await client.query(
        `SELECT inscription_id, status, life_force, life_force_cap, trait
         FROM battle_ordinals 
         WHERE LOWER(wallet_address) = LOWER($1) AND inscription_id = ANY($2)`,
        [walletAddress, inscriptionIds]
      )

      statusResult.rows.forEach((row) => {
        statusMap[row.inscription_id] = row.status
        lifeForceMap[row.inscription_id] = row.life_force ?? 100
        lifeForceCapMap[row.inscription_id] = Number(row.life_force_cap ?? 100)
        if (row.trait) {
          traitMap[row.inscription_id] = row.trait as 'Angelic' | 'Demonic'
        }
      })
    }

    // Get block chance bonuses for inscriptions
    const blockChanceMap: Record<string, number> = {}
    if (inscriptionIds.length > 0) {
      const blockRes = await client.query(
        `
          SELECT inscription_id, SUM(reward_value)::int AS total
          FROM dungeon_crawl_rewards
          WHERE LOWER(wallet) = LOWER($1)
            AND inscription_id = ANY($2)
            AND reward_type = 'block_chance'
            AND is_active = TRUE
            AND (expires_at IS NULL OR expires_at > NOW())
          GROUP BY inscription_id
        `,
        [walletAddress, inscriptionIds]
      )
      blockRes.rows.forEach((row) => {
        blockChanceMap[row.inscription_id] = Number(row.total ?? 0)
      })
    }

    // Add status and life force to each ordinal (null if not in DB - requires manual ready action)
    // Use trait from database if available, otherwise use trait from Magic Eden metadata
    const ordinalsWithStatus = battleOrdinals.map((ordinal) => {
      const maxLifeForce = lifeForceCapMap[ordinal.inscriptionId] ?? 100
      const currentLifeForce = lifeForceMap[ordinal.inscriptionId] ?? 100
      const capIncrease = maxLifeForce - 100 // Calculate bonus for display
      const blockChance = blockChanceMap[ordinal.inscriptionId] ?? 0
      // Use trait from database if available, otherwise use trait from Magic Eden
      const trait = traitMap[ordinal.inscriptionId] || ordinal.trait
      return {
        ...ordinal,
        trait, // Override with database trait if available
        status: statusMap[ordinal.inscriptionId] || null,
        lifeForce: Math.min(currentLifeForce, maxLifeForce),
        maxLifeForce,
        blockChance,
        lifeForceCapBonus: capIncrease,
      }
    })

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

