import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

    // Get all inscription_ids owned by this wallet from battle_ordinals
    const inscriptionsResult = await client.query(
      `SELECT DISTINCT inscription_id 
       FROM battle_ordinals 
       WHERE LOWER(wallet_address) = LOWER($1)`,
      [walletAddress]
    )

    const inscriptionIds = inscriptionsResult.rows.map((row) => row.inscription_id)

    if (inscriptionIds.length === 0) {
      return NextResponse.json({
        success: true,
        killingBlows: [],
      })
    }

    // Find all monsters killed by any of these inscriptions
    const killingBlowsResult = await client.query(
      `SELECT 
        id,
        name,
        prompt,
        image_blob_url,
        image_data,
        killed_by,
        updated_at
       FROM mega_monsters
       WHERE killed_by = ANY($1::text[])
       ORDER BY updated_at DESC`,
      [inscriptionIds]
    )

    const killingBlows = killingBlowsResult.rows.map((monster: any) => {
      // Get image URL (prefer blob URL, fallback to data URL)
      const imageUrl = monster.image_blob_url || 
        (monster.image_data ? `data:image/png;base64,${monster.image_data}` : null)

      return {
        id: monster.id,
        name: monster.name,
        prompt: monster.prompt,
        imageUrl,
        killedBy: monster.killed_by,
        killedAt: monster.updated_at,
      }
    })

    return NextResponse.json({
      success: true,
      killingBlows,
    })
  } catch (error) {
    console.error('Error fetching killing blows:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) {
      client.release()
    }
  }
}

