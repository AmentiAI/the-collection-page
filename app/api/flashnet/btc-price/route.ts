import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const db = getPool()
    
    const result = await db.query<{ btc_price_usd: number | null; btc_price_updated_at: Date | null }>(
      `SELECT btc_price_usd, btc_price_updated_at FROM flashnet_sync_state WHERE id = 1 LIMIT 1`
    )
    
    const row = result.rows[0]
    
    if (!row || row.btc_price_usd === null) {
      return NextResponse.json({
        success: false,
        error: 'BTC price not available',
      }, { status: 404 })
    }
    
    return NextResponse.json({
      success: true,
      price: row.btc_price_usd,
      updatedAt: row.btc_price_updated_at?.toISOString() || null,
    })
  } catch (error) {
    console.error('Flashnet BTC price GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

