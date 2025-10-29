import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// In-memory storage (use database in production with Redis/PostgreSQL)
const verificationCodes = new Map()

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
    const timestamp = Date.now()
    
    // Store code with address and timestamp
    verificationCodes.set(code, { address, timestamp })
    
    // Clean up old codes (older than 10 minutes)
    const now = Date.now()
    Array.from(verificationCodes.entries()).forEach(([key, value]) => {
      if (now - value.timestamp > 600000) {
        verificationCodes.delete(key)
      }
    })
    
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
    
    const verification = verificationCodes.get(code)
    
    if (!verification) {
      return NextResponse.json({ valid: false, message: 'Code not found' })
    }
    
    // Check if code is expired (10 minutes)
    if (Date.now() - verification.timestamp > 600000) {
      verificationCodes.delete(code) // Clean up expired code
      return NextResponse.json({ valid: false, message: 'Code expired' })
    }
    
    // Code is valid - delete it so it can't be reused
    verificationCodes.delete(code)
    
    return NextResponse.json({ 
      valid: true, 
      address: verification.address 
    })
    
  } catch (error) {
    console.error('Code verification error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}


