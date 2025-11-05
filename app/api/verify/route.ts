import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Generate secure random code
function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

// Check if address is a holder using Magic Eden API for The Damned collection
async function checkForOrdinals(address: string): Promise<boolean> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=the-damned&ownerAddress=${encodeURIComponent(address)}&showAll=true&sortBy=priceAsc`
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`
      }
    })
    
    if (!response.ok) {
      console.error('Magic Eden API error:', response.status)
      return false
    }
    
    const data = await response.json()
    
    // Check multiple possible response formats
    const total = data.total ?? (Array.isArray(data.tokens) ? data.tokens.length : 0)
    const hasOrdinals = total > 0
    
    console.log('Verify route - Total The Damned ordinals:', total, 'Is holder:', hasOrdinals)
    
    return hasOrdinals
  } catch (error) {
    console.error('Error fetching ordinals from Magic Eden:', error)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()
    
    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 })
    }
    
    // Check if holder
    const isHolder = await checkForOrdinals(address)
    
    if (!isHolder) {
      return NextResponse.json({ verified: false, message: 'Not a holder' }, { status: 403 })
    }
    
    // Generate verification code
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 600000) // 10 minutes from now
    
    // Store code in database
    const pool = getPool()
    await pool.query(
      `INSERT INTO verification_codes (code, wallet_address, expires_at)
       VALUES ($1, $2, $3)`,
      [code, address, expiresAt]
    )
    
    // Clean up expired codes (older than 10 minutes)
    await pool.query(
      `DELETE FROM verification_codes 
       WHERE expires_at < NOW() OR (is_used = true AND used_at < NOW() - INTERVAL '1 hour')`
    )
    
    return NextResponse.json({ 
      verified: true, 
      code,
      expiresIn: 600 // 10 minutes in seconds
    })
    
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// GET endpoint to check verification codes (for Discord bot)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    
    if (!code) {
      return NextResponse.json({ valid: false, error: 'Code required' }, { status: 400 })
    }
    
    const pool = getPool()
    
    // Find the verification code
    const result = await pool.query(
      `SELECT code, wallet_address, expires_at, is_used 
       FROM verification_codes 
       WHERE code = $1`,
      [code]
    )
    
    if (result.rows.length === 0) {
      return NextResponse.json({ valid: false, message: 'Code not found' })
    }
    
    const verification = result.rows[0]
    
    // Check if code is already used
    if (verification.is_used) {
      return NextResponse.json({ valid: false, message: 'Code has already been used' })
    }
    
    // Check if code is expired
    if (new Date(verification.expires_at) < new Date()) {
      // Mark as used/expired for cleanup
      await pool.query(
        `UPDATE verification_codes SET is_used = true, used_at = NOW() WHERE code = $1`,
        [code]
      )
      return NextResponse.json({ valid: false, message: 'Code expired' })
    }
    
    // Code is valid - mark as used so it can't be reused
    await pool.query(
      `UPDATE verification_codes SET is_used = true, used_at = NOW() WHERE code = $1`,
      [code]
    )
    
    return NextResponse.json({ 
      valid: true, 
      address: verification.wallet_address 
    })
    
  } catch (error) {
    console.error('Code verification error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}


