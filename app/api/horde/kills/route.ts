import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  let client
  try {
    client = await getPool().connect()

    // Get all slain monsters with killer information
    const result = await client.query(`
      SELECT
        mm.id as monster_id,
        mm.name as monster_name,
        mm.image_blob_url as monster_image,
        mm.killed_by as inscription_id,
        p.username as killer_username,
        p.avatar_url as killer_avatar,
        mm.updated_at as kill_time
      FROM mega_monsters mm
      LEFT JOIN battle_ordinals bo ON mm.killed_by = bo.inscription_id
      LEFT JOIN profiles p ON bo.wallet_address = p.wallet_address
      WHERE mm.health = 0
        AND mm.killed_by IS NOT NULL
        AND (mm.image_blob_url IS NOT NULL OR mm.image_data IS NOT NULL)
      ORDER BY mm.updated_at DESC
      LIMIT 50
    `)

    const kills = result.rows.map((row: any) => ({
      monsterId: row.monster_id,
      monsterName: row.monster_name,
      monsterImage: row.monster_image,
      inscriptionId: row.inscription_id,
      killerUsername: row.killer_username,
      killerAvatar: row.killer_avatar,
      killTime: row.kill_time,
    }))

    return NextResponse.json({
      success: true,
      kills,
    })
  } catch (error) {
    console.error('Error fetching horde kills:', error)
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
