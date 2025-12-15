import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Helper function to get client IP address
function getClientIP(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim()
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP.trim()
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress } = body
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }
    
    const pool = getPool()
    
    // Ensure recent_ip column exists
    await pool.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS recent_ip TEXT
    `)
    
    // Get client IP
    const clientIP = getClientIP(request)
    
    if (!clientIP) {
      return NextResponse.json({ 
        success: false, 
        error: 'Could not determine IP address' 
      }, { status: 400 })
    }
    
    // Update or create profile with IP
    const result = await pool.query(
      `INSERT INTO profiles (wallet_address, recent_ip, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (wallet_address) DO UPDATE
       SET recent_ip = EXCLUDED.recent_ip,
           updated_at = NOW()
       RETURNING wallet_address, recent_ip`,
      [walletAddress, clientIP]
    )
    
    return NextResponse.json({
      success: true,
      wallet_address: result.rows[0].wallet_address,
      recent_ip: result.rows[0].recent_ip,
    })
  } catch (error) {
    console.error('Error updating IP:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

