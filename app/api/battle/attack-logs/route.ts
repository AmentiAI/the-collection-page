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

    // Get recent attack logs for this wallet, including monster images
    const result = await client.query(`
      SELECT 
        al.id,
        al.monster_id,
        al.army_id,
        al.damage,
        al.was_blocked,
        al.life_force_before,
        al.life_force_after,
        al.created_at,
        bo.inscription_id,
        mm.image_blob_url as monster_image_url
      FROM mega_monster_attack_logs al
      JOIN battle_ordinals bo ON al.army_id = bo.id
      JOIN mega_monsters mm ON al.monster_id = mm.id
      WHERE al.wallet_address = $1
      ORDER BY al.created_at DESC
      LIMIT 50
    `, [walletAddress.toLowerCase()])

    return NextResponse.json({
      success: true,
      logs: result.rows,
    })
  } catch (error) {
    console.error('Error fetching attack logs:', error)
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

