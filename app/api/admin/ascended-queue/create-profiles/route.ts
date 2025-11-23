import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const pool = getPool()

    // Get all unique wallets from abyss_burns that don't have profiles
    const walletsResult = await pool.query(`
      SELECT DISTINCT ab.ordinal_wallet as wallet_address
      FROM abyss_burns ab
      LEFT JOIN profiles p ON LOWER(ab.ordinal_wallet) = LOWER(p.wallet_address)
      WHERE p.wallet_address IS NULL
    `)

    const wallets = walletsResult.rows.map((row) => row.wallet_address)

    if (wallets.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        message: 'No missing profiles to create',
      })
    }

    // Create profiles for all missing wallets
    const values = wallets.map((wallet, i) => `($${i + 1}, 0, NOW(), NOW())`).join(',')
    const result = await pool.query(
      `
      INSERT INTO profiles (wallet_address, ascension_powder, created_at, updated_at)
      VALUES ${values}
      ON CONFLICT (wallet_address) DO NOTHING
      RETURNING wallet_address
      `,
      wallets
    )

    return NextResponse.json({
      success: true,
      created: result.rowCount || 0,
      message: `Created ${result.rowCount || 0} profiles`,
    })
  } catch (error) {
    console.error('[admin/ascended-queue/create-profiles][POST]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create profiles' },
      { status: 500 }
    )
  }
}

