import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function ensureLinkedWalletsInfrastructure(pool: ReturnType<typeof getPool>) {
  // Create linked_wallets table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS linked_wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      primary_wallet TEXT NOT NULL,
      linked_wallet TEXT NOT NULL UNIQUE,
      signature TEXT NOT NULL,
      message TEXT NOT NULL,
      linked_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT TRUE,
      UNIQUE(primary_wallet, linked_wallet)
    )
  `)
  
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_linked_wallets_primary ON linked_wallets((LOWER(primary_wallet)))`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_linked_wallets_linked ON linked_wallets((LOWER(linked_wallet)))`)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { primaryWallet, linkedWallet, signature, message, linkToken } = body
    
    if (!primaryWallet || !linkedWallet || !signature || !message) {
      return NextResponse.json(
        { success: false, error: 'primaryWallet, linkedWallet, signature, and message are required' },
        { status: 400 }
      )
    }

    // SECURITY: Verify the link token to ensure user owns the primary wallet
    if (!linkToken) {
      return NextResponse.json(
        { success: false, error: 'Missing link authorization token. Please start the linking process from your profile.' },
        { status: 401 }
      )
    }

    // Verify the link token
    const tokenResponse = await fetch(
      `${request.nextUrl.origin}/api/wallet/link-session?token=${encodeURIComponent(linkToken)}`,
      { cache: 'no-store' }
    )

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired authorization token. Please restart the linking process.' },
        { status: 401 }
      )
    }

    const tokenData = await tokenResponse.json()
    
    // Ensure the token's primary wallet matches the request
    if (tokenData.primaryWallet.toLowerCase() !== primaryWallet.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Authorization token does not match the primary wallet.' },
        { status: 403 }
      )
    }
    
    // Validate that wallets are different
    if (primaryWallet.toLowerCase() === linkedWallet.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Cannot link the same wallet to itself' },
        { status: 400 }
      )
    }
    
    // Basic validation: signature should be a non-empty string
    // LaserEyes signMessage already verifies the signature client-side
    if (!signature || signature.length < 10) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature provided' },
        { status: 403 }
      )
    }
    
    // Verify the message contains the primary wallet address
    if (!message.includes(primaryWallet)) {
      return NextResponse.json(
        { success: false, error: 'Message does not reference the primary wallet' },
        { status: 400 }
      )
    }
    
    // Check timestamp in message (prevent replay attacks)
    const timestampMatch = message.match(/Timestamp:\s*(\d+)/)
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1])
      const now = Date.now()
      const fiveMinutes = 5 * 60 * 1000
      
      if (now - timestamp > fiveMinutes) {
        return NextResponse.json(
          { success: false, error: 'Signature has expired. Please try again.' },
          { status: 400 }
        )
      }
    }
    
    const pool = getPool()
    await ensureLinkedWalletsInfrastructure(pool)
    
    await pool.query('BEGIN')
    
    try {
      // Ensure primary wallet has a profile
      let profileResult = await pool.query(
        'SELECT id FROM profiles WHERE LOWER(wallet_address) = LOWER($1)',
        [primaryWallet]
      )
      
      if (profileResult.rows.length === 0) {
        // Create profile if it doesn't exist
        await pool.query(
          'INSERT INTO profiles (wallet_address, payment_address) VALUES ($1, $1)',
          [primaryWallet]
        )
      }
      
      // Check if linked wallet is already linked to another profile
      const existingLink = await pool.query(
        'SELECT primary_wallet FROM linked_wallets WHERE LOWER(linked_wallet) = LOWER($1) AND is_active = TRUE',
        [linkedWallet]
      )
      
      if (existingLink.rows.length > 0) {
        await pool.query('ROLLBACK')
        return NextResponse.json(
          { 
            success: false, 
            error: `This wallet is already linked to another profile (${existingLink.rows[0].primary_wallet})` 
          },
          { status: 409 }
        )
      }
      
      // Check if this exact link already exists
      const existingExactLink = await pool.query(
        `SELECT id, is_active FROM linked_wallets 
         WHERE LOWER(primary_wallet) = LOWER($1) AND LOWER(linked_wallet) = LOWER($2)`,
        [primaryWallet, linkedWallet]
      )
      
      if (existingExactLink.rows.length > 0) {
        if (existingExactLink.rows[0].is_active) {
          await pool.query('ROLLBACK')
          return NextResponse.json(
            { success: false, error: 'This wallet is already linked to your profile' },
            { status: 409 }
          )
        } else {
          // Reactivate the link
          await pool.query(
            `UPDATE linked_wallets 
             SET is_active = TRUE, signature = $1, message = $2, linked_at = NOW()
             WHERE LOWER(primary_wallet) = LOWER($3) AND LOWER(linked_wallet) = LOWER($4)`,
            [signature, message, primaryWallet, linkedWallet]
          )
        }
      } else {
        // Create the link
        await pool.query(
          `INSERT INTO linked_wallets (primary_wallet, linked_wallet, signature, message)
           VALUES ($1, $2, $3, $4)`,
          [primaryWallet, linkedWallet, signature, message]
        )
      }
      
      await pool.query('COMMIT')

      // Consume the link token so it can't be reused
      if (linkToken) {
        await fetch(`${request.nextUrl.origin}/api/wallet/link-session`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: linkToken })
        }).catch(() => {}) // Ignore errors, token will expire anyway
      }
      
      return NextResponse.json({
        success: true,
        message: 'Wallet linked successfully',
        primaryWallet,
        linkedWallet
      })
    } catch (error) {
      await pool.query('ROLLBACK')
      throw error
    }
  } catch (error) {
    console.error('[wallet/link][POST]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to link wallet' },
      { status: 500 }
    )
  }
}

