import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { scanActivitiesForWallet } from '@/lib/activity-utils'

export const dynamic = 'force-dynamic'

// Scan activity history and award karma for purchases/creates based on chosen side
export async function POST(request: NextRequest) {
  try {
    const { walletAddress, chosenSide } = await request.json()
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }
    
    if (!chosenSide || (chosenSide !== 'good' && chosenSide !== 'evil')) {
      return NextResponse.json(
        { error: 'chosenSide must be "good" or "evil"' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Get profile
    const profileResult = await pool.query(`
      SELECT id
      FROM profiles
      WHERE wallet_address = $1
    `, [walletAddress])
    
    if (profileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }
    
    const profileId = profileResult.rows[0].id
    
    const result = await scanActivitiesForWallet(walletAddress, chosenSide, profileId, pool)
    
    return NextResponse.json({
      success: true,
      ...result,
      message: `Scanned ${result.totalPurchases} purchases, awarded karma for ${result.newPurchasesAwarded} new purchase(s)`
    })
  } catch (error) {
    console.error('Scan activities error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

