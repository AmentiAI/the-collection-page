import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  let client
  try {
    client = await getPool().connect()

    // Get all mega monsters with images, ordered by total fights (most active first)
    // Join with battle_ordinals to get the killer's wallet, then profiles to get username
    const result = await client.query(`
      SELECT
        mm.id,
        mm.name,
        mm.prompt,
        mm.image_blob_url,
        mm.image_data,
        mm.full_body_image_blob_url,
        COALESCE(mm.total_fights, 0) as total_fights,
        mm.health,
        mm.killed_by,
        p.username as killer_username,
        mm.created_at,
        mm.updated_at
      FROM mega_monsters mm
      LEFT JOIN battle_ordinals bo ON mm.killed_by = bo.inscription_id
      LEFT JOIN profiles p ON bo.wallet_address = p.wallet_address
      WHERE mm.image_blob_url IS NOT NULL OR mm.image_data IS NOT NULL
      ORDER BY COALESCE(mm.total_fights, 0) DESC, mm.created_at DESC
    `)

    // For now, we'll use a simple count - each monster participates in every attack
    // In the future, we could track individual monster participation
    // For now, we'll calculate total attacks based on when the monster was created
    // and how many attacks have happened since then (rough estimate)
    
    const monsters = result.rows.map((monster: any) => {
      // Get image URL (prefer blob URL, fallback to data URL)
      const imageUrl = monster.image_blob_url ||
        (monster.image_data ? `data:image/png;base64,${monster.image_data}` : null)

      return {
        id: monster.id,
        name: monster.name,
        prompt: monster.prompt,
        imageUrl,
        fullBodyImageUrl: monster.full_body_image_blob_url || null,
        createdAt: monster.created_at,
        updatedAt: monster.updated_at,
        totalFights: parseInt(monster.total_fights || '0', 10),
        health: monster.health != null ? parseInt(monster.health, 10) : 15000,
        killedBy: monster.killed_by || null,
        killerUsername: monster.killer_username || null,
      }
    })

    return NextResponse.json({
      success: true,
      monsters,
    })
  } catch (error) {
    console.error('Error fetching horde monsters:', error)
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

