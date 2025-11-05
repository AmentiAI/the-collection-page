import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Link Discord user ID to wallet address (called by Discord bot after verification)
export async function POST(request: NextRequest) {
  try {
    const { discordUserId, walletAddress } = await request.json()
    
    if (!discordUserId || !walletAddress) {
      return NextResponse.json(
        { error: 'discordUserId and walletAddress are required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Ensure profile exists
    let profileResult = await pool.query(
      'SELECT id FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    if (profileResult.rows.length === 0) {
      // Create profile if it doesn't exist
      await pool.query(
        'INSERT INTO profiles (wallet_address, payment_address) VALUES ($1, $1)',
        [walletAddress]
      )
      // Re-fetch the profile
      profileResult = await pool.query(
        'SELECT id FROM profiles WHERE wallet_address = $1',
        [walletAddress]
      )
    }
    
    // Get current ordinal count
    let ordinalCount = 0
    try {
      const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
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
      
      if (response.ok) {
        const data = await response.json()
        ordinalCount = data.total ?? (Array.isArray(data.tokens) ? data.tokens.length : 0)
      }
    } catch (error) {
      console.error('Error fetching ordinal count:', error)
    }
    
    // Update profile with ordinal count and holder role status
    await pool.query(`
      UPDATE profiles 
      SET current_ordinal_count = $1, 
          last_ordinal_count = COALESCE(last_ordinal_count, 0),
          has_holder_role = true,
          updated_at = NOW()
      WHERE wallet_address = $2
    `, [ordinalCount, walletAddress])
    
    // Insert or update discord_users link (simple Discord info only - no ordinal counts or role status, no wallet_address)
    await pool.query(`
      INSERT INTO discord_users (discord_user_id, profile_id, verified_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (discord_user_id) 
      DO UPDATE SET 
        profile_id = $2,
        verified_at = NOW(),
        updated_at = NOW()
    `, [discordUserId, profileResult.rows[0].id])
    
    // Calculate karma based on ordinal ownership (+5 points per ordinal)
    if (ordinalCount > 0 && profileResult.rows.length > 0) {
      const profileId = profileResult.rows[0].id
      const expectedKarma = ordinalCount * 5
      
      // Get existing ordinal karma
      const existingKarmaResult = await pool.query(`
        SELECT COALESCE(SUM(points), 0) as total
        FROM karma_points
        WHERE profile_id = $1 AND reason = 'Ordinal ownership'
      `, [profileId])
      
      const existingKarma = parseInt(existingKarmaResult.rows[0]?.total || '0')
      const karmaDifference = expectedKarma - existingKarma
      
      // Add karma if needed
      if (karmaDifference > 0) {
        await pool.query(`
          INSERT INTO karma_points (profile_id, points, type, reason, given_by)
          VALUES ($1, $2, 'good', 'Ordinal ownership', 'system')
        `, [profileId, karmaDifference])
      }
    }
    
    // Note: Purchase karma (+10 per ordinal) is awarded when ordinal count increases are detected
    // This happens during periodic holder checks
    
    return NextResponse.json({ 
      success: true, 
      message: 'Discord user linked to wallet address',
      ordinalCount,
      karmaPoints: ordinalCount * 5
    })
  } catch (error) {
    console.error('Discord link error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

