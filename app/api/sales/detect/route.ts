import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Detect sales by checking if holders have fewer ordinals than before
export async function GET() {
  try {
    const pool = getPool()
    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    // Get all Discord users linked to profiles with holder roles
    const discordUsers = await pool.query(`
      SELECT du.discord_user_id, p.wallet_address
      FROM discord_users du
      INNER JOIN profiles p ON du.profile_id = p.id
      WHERE COALESCE(p.has_holder_role, false) = true
    `)
    
    const salesDetected: Array<{ walletAddress: string; currentCount: number; previousCount: number }> = []
    
    // Check each user's current ordinal count
    for (const user of discordUsers.rows) {
      try {
        const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=the-damned&ownerAddress=${encodeURIComponent(user.wallet_address)}&showAll=true`
        
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'Authorization': `Bearer ${apiKey}`
          },
          next: { revalidate: 0 }
        })
        
        if (!response.ok) continue
        
        const data = await response.json()
        const currentCount = data.total ?? (Array.isArray(data.tokens) ? data.tokens.length : 0)
        
        // Get previous count from sales table (count of sales)
        const salesResult = await pool.query(`
          SELECT COUNT(*) as sale_count
          FROM ordinal_sales
          WHERE wallet_address = $1
        `, [user.wallet_address])
        
        const salesCount = parseInt(salesResult.rows[0]?.sale_count || '0')
        
        // If current count is 0, they sold everything - deduct karma for each sale
        if (currentCount === 0 && salesCount === 0) {
          // First time detecting they have no ordinals - record as sale
          salesDetected.push({
            walletAddress: user.wallet_address,
            currentCount: 0,
            previousCount: 1 // Assume they had at least 1 before
          })
          
          // Record sale and deduct karma
          await pool.query(`
            INSERT INTO ordinal_sales (wallet_address, karma_deducted, sold_at)
            VALUES ($1, -20, NOW())
          `, [user.wallet_address])
          
          // Deduct karma from profile
          const profileResult = await pool.query(
            'SELECT id FROM profiles WHERE wallet_address = $1',
            [user.wallet_address]
          )
          
          if (profileResult.rows.length > 0) {
            await pool.query(`
              INSERT INTO karma_points (profile_id, points, type, reason, given_by)
              VALUES ($1, -20, 'evil', 'Sold The Damned ordinal(s)', 'system')
            `, [profileResult.rows[0].id])
          }
        }
      } catch (error) {
        console.error(`Error detecting sale for ${user.wallet_address}:`, error)
      }
    }
    
    return NextResponse.json({
      success: true,
      salesDetected: salesDetected.length,
      sales: salesDetected
    })
  } catch (error) {
    console.error('Detect sales error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

