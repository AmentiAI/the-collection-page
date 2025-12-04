import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const pool = getPool()

    // Find wallets in abyss_burns that don't have a profile
    // Also check if they have entries in ascended_images_mint_queue
    const result = await pool.query(`
      SELECT 
        ab.ordinal_wallet as wallet_address,
        COUNT(DISTINCT ab.id) as count,
        COUNT(DISTINCT mq.id) > 0 as has_mint_queue
      FROM abyss_burns ab
      LEFT JOIN profiles p ON LOWER(ab.ordinal_wallet) = LOWER(p.wallet_address)
      LEFT JOIN ascended_images_mint_queue mq ON LOWER(ab.ordinal_wallet) = LOWER(mq.wallet_address)
      WHERE p.wallet_address IS NULL
      GROUP BY ab.ordinal_wallet
      ORDER BY count DESC, ab.ordinal_wallet
    `)

    return NextResponse.json({
      success: true,
      wallets: result.rows,
    })
  } catch (error) {
    console.error('[admin/ascended-queue/missing-wallets][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load missing wallets' },
      { status: 500 }
    )
  }
}

