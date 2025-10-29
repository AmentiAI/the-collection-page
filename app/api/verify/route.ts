import { NextRequest, NextResponse } from 'next/server'

// In-memory storage (use database in production with Redis/PostgreSQL)
const verificationCodes = new Map()

// Generate secure random code
function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

// Check if address is a holder (use your existing logic)
async function checkForOrdinals(address: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.ordinals.com/v1/inscriptions?address=${address}`)
    const data = await response.json()
    
    // Check if user has any ordinals
    // TODO: Customize this to check for specific "The Damned" ordinals
    return data.inscriptions && data.inscriptions.length > 0
  } catch (error) {
    console.error('Error fetching ordinals:', error)
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
    for (const [key, value] of verificationCodes.entries()) {
      if (Date.now() - value.timestamp > 600000) {
        verificationCodes.delete(key)
      }
    }
    
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


