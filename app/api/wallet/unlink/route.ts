import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { primaryWallet, linkedWallet } = body
    
    if (!primaryWallet || !linkedWallet) {
      return NextResponse.json(
        { success: false, error: 'primaryWallet and linkedWallet are required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Deactivate the link (soft delete)
    const result = await pool.query(
      `UPDATE linked_wallets 
       SET is_active = FALSE
       WHERE LOWER(primary_wallet) = LOWER($1) AND LOWER(linked_wallet) = LOWER($2)
       RETURNING id`,
      [primaryWallet, linkedWallet]
    )
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Wallet link not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Wallet unlinked successfully'
    })
  } catch (error) {
    console.error('[wallet/unlink][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to unlink wallet' },
      { status: 500 }
    )
  }
}

