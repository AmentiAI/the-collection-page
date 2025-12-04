import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let client
  try {
    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Get all dead armies for this wallet
    const result = await client.query(
      `SELECT 
        bo.inscription_id,
        bo.death_time,
        bo.resurrection_time,
        bo.status
       FROM battle_ordinals bo
       WHERE LOWER(bo.wallet_address) = LOWER($1)
         AND bo.is_dead = true
       ORDER BY bo.death_time DESC`,
      [walletAddress]
    )

    // Fetch image URLs and traits from Magic Eden
    const deadArmies = await Promise.all(
      result.rows.map(async (row) => {
        try {
          const magicEdenResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/magic-eden?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned&fetchAll=true`,
            {
              method: 'GET',
              headers: { Accept: 'application/json' },
              cache: 'no-store',
            }
          )

          if (magicEdenResponse.ok) {
            const magicEdenData = await magicEdenResponse.json()
            const tokens = Array.isArray(magicEdenData.tokens) ? magicEdenData.tokens : []
            const token = tokens.find((t: any) => (t.id || t.inscriptionId) === row.inscription_id)

            if (token) {
              let attributes: Array<{ trait_type?: string; traitType?: string; value?: string }> = []
              if (token.meta?.attributes) attributes = token.meta.attributes
              else if (token.metadata?.attributes) attributes = token.metadata.attributes
              else if (token.attributes) attributes = token.attributes

              const ascendedTrait = attributes.find(
                (attr) =>
                  (attr.trait_type === 'Ascended' || attr.traitType === 'Ascended') &&
                  (attr.value === 'Angelic' || attr.value === 'Demonic')
              )

              const imageUrl =
                token.contentURI ||
                token.imageURI ||
                `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(row.inscription_id)}`

              const resurrectionTime = row.resurrection_time ? new Date(row.resurrection_time) : null
              const now = new Date()
              const canResurrect = resurrectionTime !== null && now >= resurrectionTime

              let timeRemaining: string | null = null
              if (resurrectionTime && !canResurrect) {
                const msRemaining = resurrectionTime.getTime() - now.getTime()
                const hours = Math.floor(msRemaining / (1000 * 60 * 60))
                const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60))
                timeRemaining = `${hours}h ${minutes}m`
              }

              return {
                inscriptionId: row.inscription_id,
                imageUrl,
                trait: (ascendedTrait?.value as 'Angelic' | 'Demonic') || 'Demonic',
                deathTime: row.death_time,
                resurrectionTime: row.resurrection_time,
                canResurrect,
                timeRemaining,
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching token ${row.inscription_id}:`, error)
        }

        // Fallback
        return {
          inscriptionId: row.inscription_id,
          imageUrl: `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(row.inscription_id)}`,
          trait: 'Demonic' as const,
          deathTime: row.death_time,
          resurrectionTime: row.resurrection_time,
          canResurrect: false,
          timeRemaining: null,
        }
      })
    )

    return NextResponse.json({
      success: true,
      deadArmies,
    })
  } catch (error) {
    console.error('Error fetching dead armies:', error)
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

