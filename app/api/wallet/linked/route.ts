import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('walletAddress')
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'walletAddress is required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Ensure linked_wallets table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS linked_wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        primary_wallet TEXT NOT NULL,
        linked_wallet TEXT NOT NULL,
        signature TEXT NOT NULL,
        message TEXT NOT NULL,
        linked_at TIMESTAMPTZ DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE,
        CONSTRAINT unique_link UNIQUE(primary_wallet, linked_wallet)
      )
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_linked_wallets_primary 
      ON linked_wallets(LOWER(primary_wallet)) WHERE is_active = TRUE
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_linked_wallets_linked 
      ON linked_wallets(LOWER(linked_wallet)) WHERE is_active = TRUE
    `)
    
    // Check if this wallet is a primary wallet
    const primaryLinks = await pool.query(
      `SELECT linked_wallet, linked_at 
       FROM linked_wallets 
       WHERE LOWER(primary_wallet) = LOWER($1) AND is_active = TRUE
       ORDER BY linked_at DESC`,
      [walletAddress]
    )
    
    // Check if this wallet is a linked wallet (get the primary)
    const linkedTo = await pool.query(
      `SELECT primary_wallet 
       FROM linked_wallets 
       WHERE LOWER(linked_wallet) = LOWER($1) AND is_active = TRUE
       LIMIT 1`,
      [walletAddress]
    )
    
    let primaryWallet = walletAddress
    let linkedWallets: any[] = []
    
    if (linkedTo.rows.length > 0) {
      // This is a linked wallet, get the primary and all its links
      primaryWallet = linkedTo.rows[0].primary_wallet
      
      const allLinks = await pool.query(
        `SELECT linked_wallet, linked_at 
         FROM linked_wallets 
         WHERE LOWER(primary_wallet) = LOWER($1) AND is_active = TRUE
         ORDER BY linked_at DESC`,
        [primaryWallet]
      )
      
      linkedWallets = allLinks.rows.map(row => ({
        wallet: row.linked_wallet,
        linkedAt: row.linked_at
      }))
    } else {
      // This is a primary wallet
      linkedWallets = primaryLinks.rows.map(row => ({
        wallet: row.linked_wallet,
        linkedAt: row.linked_at
      }))
    }
    
    // Get all wallets (primary + linked)
    const allWallets = [primaryWallet, ...linkedWallets.map(l => l.wallet)]
    
    return NextResponse.json({
      success: true,
      primaryWallet,
      linkedWallets,
      allWallets,
      isLinkedWallet: linkedTo.rows.length > 0
    })
  } catch (error) {
    console.error('[wallet/linked][GET]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch linked wallets' },
      { status: 500 }
    )
  }
}

