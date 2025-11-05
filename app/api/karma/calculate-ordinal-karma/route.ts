import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Calculate karma based on ordinal ownership (+5 points per ordinal)
export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json()
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    // Get current ordinal count
    const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=the-damned&ownerAddress=${encodeURIComponent(walletAddress)}&showAll=true`
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`
      },
      next: { revalidate: 0 }
    })
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch ordinals' },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    const ordinalCount = data.total ?? (Array.isArray(data.tokens) ? data.tokens.length : 0)
    const expectedKarma = ordinalCount * 5
    
        // Get or create profile
    let profileResult = await pool.query(
      'SELECT id, last_ordinal_count FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    if (profileResult.rows.length === 0) {
      await pool.query(
        'INSERT INTO profiles (wallet_address, payment_address) VALUES ($1, $1)',
        [walletAddress]
      )
      profileResult = await pool.query(
        'SELECT id, last_ordinal_count FROM profiles WHERE wallet_address = $1',
        [walletAddress]
      )
    }
    
    const profileId = profileResult.rows[0].id

    // Get previous ordinal count from profiles
    const previousCount = profileResult.rows[0].last_ordinal_count || 0
    
    // Detect if user bought new ordinals (count increased) - +20 karma per purchase
    if (ordinalCount > previousCount && previousCount >= 0) {
      const purchasedCount = ordinalCount - previousCount
      const purchaseKarma = purchasedCount * 20
      
      // Award karma for purchases
      await pool.query(`
        INSERT INTO karma_points (profile_id, points, type, reason, given_by)
        VALUES ($1, $2, 'good', 'Purchased The Damned ordinal', 'system')
      `, [profileId, purchaseKarma])
      
      console.log(`Awarded ${purchaseKarma} karma to ${walletAddress} for purchasing ${purchasedCount} ordinal(s)`)
    }
    
    // Update ordinal counts in profiles
    await pool.query(`
      UPDATE profiles 
      SET last_ordinal_count = COALESCE(current_ordinal_count, 0),
          current_ordinal_count = $1,
          updated_at = NOW()
      WHERE wallet_address = $2
    `, [ordinalCount, walletAddress])
    
    // Get existing ordinal karma (sum of all "Ordinal ownership" karma entries)
    const existingKarmaResult = await pool.query(`
      SELECT COALESCE(SUM(points), 0) as total
      FROM karma_points
      WHERE profile_id = $1 AND reason = 'Ordinal ownership'
    `, [profileId])
    
    const existingKarma = parseInt(existingKarmaResult.rows[0]?.total || '0')
    const karmaDifference = expectedKarma - existingKarma
    
    // If there's a difference, add or remove karma points
    if (karmaDifference !== 0) {
      if (karmaDifference > 0) {
        // Add karma points
        await pool.query(`
          INSERT INTO karma_points (profile_id, points, type, reason, given_by)
          VALUES ($1, $2, 'good', 'Ordinal ownership', 'system')
        `, [profileId, karmaDifference])
      } else {
        // Remove karma points (if they sold ordinals)
        await pool.query(`
          INSERT INTO karma_points (profile_id, points, type, reason, given_by)
          VALUES ($1, $2, 'bad', 'Ordinal ownership adjustment', 'system')
        `, [profileId, karmaDifference])
      }
    }
    
    return NextResponse.json({
      success: true,
      ordinalCount,
      karmaPoints: expectedKarma,
      karmaDifference,
      message: `You have ${ordinalCount} ordinals, earning ${expectedKarma} karma points`
    })
  } catch (error) {
    console.error('Calculate ordinal karma error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

