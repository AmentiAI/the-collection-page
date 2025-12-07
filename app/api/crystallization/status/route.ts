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

    // Get active crystallization records with calculated powder
    const result = await client.query(
      `SELECT 
         cr.id,
         cr.inscription_id,
         cr.entered_at,
         cr.status,
         FLOOR(EXTRACT(EPOCH FROM (NOW() - cr.entered_at)) / 60)::INTEGER as minutes_elapsed,
         FLOOR(EXTRACT(EPOCH FROM (NOW() - cr.entered_at)) / 1800)::INTEGER as powder_earned,
         (1800 - (EXTRACT(EPOCH FROM (NOW() - cr.entered_at))::INTEGER % 1800))::INTEGER as seconds_until_next_powder
       FROM crystallization_records cr
       WHERE LOWER(cr.wallet_address) = LOWER($1)
         AND cr.status = 'active'
       ORDER BY cr.entered_at ASC`,
      [walletAddress]
    )

    // Fetch ordinal details from Magic Eden for images and traits
    const inscriptionIds = result.rows.map((row) => row.inscription_id)
    const crystallizations = []

    if (inscriptionIds.length > 0) {
      // Get ordinal details from battle_ordinals
      const ordinalsResult = await client.query(
        `SELECT inscription_id, trait
         FROM battle_ordinals
         WHERE LOWER(wallet_address) = LOWER($1)
           AND inscription_id = ANY($2)`,
        [walletAddress, inscriptionIds]
      )

      const traitMap = new Map(
        ordinalsResult.rows.map((row) => [row.inscription_id, row.trait])
      )

      // Fetch images from Magic Eden API
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      
      try {
        const magicEdenResponse = await fetch(
          `${baseUrl}/api/magic-eden?ownerAddress=${encodeURIComponent(walletAddress)}&collectionSymbol=the-damned&fetchAll=true`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          }
        )

        const magicEdenData = magicEdenResponse.ok ? await magicEdenResponse.json() : { tokens: [] }
        const tokens = Array.isArray(magicEdenData.tokens) ? magicEdenData.tokens : []
        
        const imageMap = new Map()
        for (const token of tokens) {
          const inscriptionId = token.id || token.inscriptionId
          if (inscriptionId && inscriptionIds.includes(inscriptionId)) {
            imageMap.set(
              inscriptionId,
              token.contentURI || token.imageURI || 
              `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(inscriptionId)}`
            )
          }
        }

        // Build response with all data
        for (const row of result.rows) {
          crystallizations.push({
            id: row.id,
            inscriptionId: row.inscription_id,
            enteredAt: row.entered_at,
            minutesElapsed: Math.max(0, Number(row.minutes_elapsed ?? 0)),
            powderEarned: Math.max(0, Number(row.powder_earned ?? 0)),
            secondsUntilNextPowder: Math.max(0, Number(row.seconds_until_next_powder ?? 1800)),
            imageUrl: imageMap.get(row.inscription_id) || 
              `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(row.inscription_id)}`,
            trait: traitMap.get(row.inscription_id) || null,
          })
        }
      } catch (error) {
        console.error('Error fetching Magic Eden data:', error)
        // Fallback: return data without images
        for (const row of result.rows) {
          crystallizations.push({
            id: row.id,
            inscriptionId: row.inscription_id,
            enteredAt: row.entered_at,
            minutesElapsed: Math.max(0, Number(row.minutes_elapsed ?? 0)),
            powderEarned: Math.max(0, Number(row.powder_earned ?? 0)),
            secondsUntilNextPowder: Math.max(0, Number(row.seconds_until_next_powder ?? 1800)),
            imageUrl: `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(row.inscription_id)}`,
            trait: traitMap.get(row.inscription_id) || null,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      crystallizations,
    })
  } catch (error) {
    console.error('Error fetching crystallization status:', error)
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

