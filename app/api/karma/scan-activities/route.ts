import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import type { Pool } from 'pg'

export const dynamic = 'force-dynamic'

// Core function to scan activities (can be called directly or via HTTP)
export async function scanActivitiesForWallet(
  walletAddress: string,
  chosenSide: 'good' | 'evil',
  profileId: string,
  pool: Pool
) {
  const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
  
  // Fetch activity history (3 pages deep for each type)
  const offsets = [0, 100, 200]
  const limit = 100
  const activityTypes = ['create', 'buying_broadcasted', 'mint_broadcasted']
  
  let allPurchases: any[] = []
  
  for (const activityType of activityTypes) {
    for (const offset of offsets) {
      try {
        const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/activities?ownerAddress=${encodeURIComponent(walletAddress)}&limit=${limit}&offset=${offset}&kind=${activityType}`
        
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'Authorization': `Bearer ${apiKey}`
          },
          next: { revalidate: 0 }
        })
        
        if (response.ok) {
          const data = await response.json()
          const activities = data.activities || []
          
          // Filter for "the-damned" collection and where user is the new owner
          const filtered = activities.filter((activity: any) => 
            activity.collectionSymbol === 'the-damned' &&
            activity.newOwner?.toLowerCase() === walletAddress.toLowerCase()
          )
          
          allPurchases.push(...filtered)
        }
      } catch (error) {
        console.error(`Error fetching ${activityType} activities:`, error)
      }
    }
  }
  
  // Remove duplicates based on activity ID
  const uniquePurchases = Array.from(
    new Map(allPurchases.map((p: any) => [p.id, p])).values()
  )
  
  // Count existing purchase karma entries
  const existingPurchaseCount = await pool.query(`
    SELECT COUNT(*) as count
    FROM karma_points
    WHERE profile_id = $1 
      AND reason = 'Purchased The Damned ordinal'
  `, [profileId])
  
  const existingCount = parseInt(existingPurchaseCount.rows[0]?.count || '0')
  const totalPurchases = uniquePurchases.length
  
  // Award karma for purchases that haven't been recorded yet
  if (totalPurchases > existingCount) {
    const remainingPurchases = totalPurchases - existingCount
    
    // Award karma based on chosen side (purchases are always +20, but type matches chosen side)
    const karmaPoints = 20
    const karmaType = chosenSide
    
    for (let i = 0; i < remainingPurchases; i++) {
      await pool.query(`
        INSERT INTO karma_points (profile_id, points, type, reason, given_by)
        VALUES ($1, $2, $3, 'Purchased The Damned ordinal', 'system')
      `, [profileId, karmaPoints, karmaType])
    }
    
    console.log(`✅ Awarded ${remainingPurchases * karmaPoints} ${karmaType} karma (${remainingPurchases} entries) to ${walletAddress} for ${remainingPurchases} purchase(s)`)
  }
  
  return {
    totalPurchases,
    existingCount,
    newPurchasesAwarded: totalPurchases - existingCount
  }
}

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

