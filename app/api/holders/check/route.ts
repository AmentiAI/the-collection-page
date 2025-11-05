import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Check holder status for all Discord users and return list of those who should lose roles
export async function GET() {
  try {
    const pool = getPool()
    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    // Get all Discord users linked to profiles with holder roles and their ordinal counts
    const discordUsers = await pool.query(`
      SELECT du.discord_user_id, p.wallet_address, 
             COALESCE(p.last_ordinal_count, 0) as last_ordinal_count,
             COALESCE(p.current_ordinal_count, 0) as current_ordinal_count,
             COALESCE(p.has_holder_role, false) as has_holder_role
      FROM discord_users du
      INNER JOIN profiles p ON du.profile_id = p.id
      WHERE COALESCE(p.has_holder_role, false) = true
    `)
    
    const usersToRemoveRole: Array<{ discordUserId: string; walletAddress: string }> = []
    
    // Check each user's holder status
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
          next: { revalidate: 0 } // Don't cache
        })
        
        if (!response.ok) {
          console.error(`Error checking holder status for ${user.wallet_address}:`, response.status)
          continue
        }
        
        const data = await response.json()
        const total = data.total ?? (Array.isArray(data.tokens) ? data.tokens.length : 0)
        const hasOrdinals = total > 0
        const previousCount = user.last_ordinal_count || 0
        const currentCountInDb = user.current_ordinal_count || 0
        
        // Only proceed with karma adjustments if the ordinal count has actually changed
        const ordinalCountChanged = total !== currentCountInDb
        
        // Detect if user bought new ordinals (count increased) - +10 karma per purchase
        if (total > previousCount && previousCount >= 0) {
          const purchasedCount = total - previousCount
          
          // Award karma for each new ordinal purchased
          const profileResult = await pool.query(
            'SELECT id FROM profiles WHERE wallet_address = $1',
            [user.wallet_address]
          )
          
          if (profileResult.rows.length > 0) {
            const profileId = profileResult.rows[0].id
            const karmaToAward = purchasedCount * 20
            
            // Award karma for purchases
            await pool.query(`
              INSERT INTO karma_points (profile_id, points, type, reason, given_by)
              VALUES ($1, $2, 'good', 'Purchased The Damned ordinal', 'system')
            `, [profileId, karmaToAward])
            
            console.log(`Awarded ${karmaToAward} karma to ${user.wallet_address} for purchasing ${purchasedCount} ordinal(s)`)
          }
        }
        
        // Detect if user sold ordinals (count decreased)
        if (total < previousCount && previousCount > 0) {
          const soldCount = previousCount - total
          
          // Record sales and deduct karma for each ordinal sold
          for (let i = 0; i < soldCount; i++) {
            // Check if sale already recorded (avoid duplicates)
            const recentSale = await pool.query(`
              SELECT id FROM ordinal_sales 
              WHERE wallet_address = $1 
              AND sold_at > NOW() - INTERVAL '1 hour'
              ORDER BY sold_at DESC
              LIMIT 1
            `, [user.wallet_address])
            
            if (recentSale.rows.length === 0) {
              // Record the sale
              await pool.query(`
                INSERT INTO ordinal_sales (wallet_address, karma_deducted, sold_at)
                VALUES ($1, -20, NOW())
              `, [user.wallet_address])
              
              // Get profile ID and deduct karma
              const profileResult = await pool.query(
                'SELECT id FROM profiles WHERE wallet_address = $1',
                [user.wallet_address]
              )
              
              if (profileResult.rows.length > 0) {
                await pool.query(`
                  INSERT INTO karma_points (profile_id, points, type, reason, given_by)
                  VALUES ($1, -20, 'bad', 'Sold The Damned ordinal', 'system')
                `, [profileResult.rows[0].id])
              }
            }
          }
        }
        
        // Calculate and update karma based on ordinal ownership (+5 points per ordinal)
        // Only adjust if the ordinal count has actually changed
        if (ordinalCountChanged) {
          const expectedKarma = total * 5
          
          // Get profile ID
          const profileResult = await pool.query(
            'SELECT id FROM profiles WHERE wallet_address = $1',
            [user.wallet_address]
          )
          
          if (profileResult.rows.length > 0) {
            const profileId = profileResult.rows[0].id
            
            // Get existing ordinal karma
            const existingKarmaResult = await pool.query(`
              SELECT COALESCE(SUM(points), 0) as total
              FROM karma_points
              WHERE profile_id = $1 AND reason = 'Ordinal ownership'
            `, [profileId])
            
            const existingKarma = parseInt(existingKarmaResult.rows[0]?.total || '0')
            const karmaDifference = expectedKarma - existingKarma
            
            // Update karma if there's a difference
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
          }
        }
        
        if (!hasOrdinals) {
          // User no longer has ordinals - mark for role removal
          usersToRemoveRole.push({
            discordUserId: user.discord_user_id,
            walletAddress: user.wallet_address
          })
          
          // Update database - remove holder role from profile
          await pool.query(`
            UPDATE profiles 
            SET has_holder_role = false,
                last_ordinal_count = 0, 
                current_ordinal_count = 0, 
                updated_at = NOW()
            WHERE wallet_address = $1
          `, [user.wallet_address])
          
          // Update discord_users last checked time
          await pool.query(`
            UPDATE discord_users 
            SET last_checked_at = NOW(), updated_at = NOW()
            WHERE discord_user_id = $1
          `, [user.discord_user_id])
        } else {
          // Update profile - ensure holder role is true and update ordinal counts
          await pool.query(`
            UPDATE profiles 
            SET has_holder_role = true,
                last_ordinal_count = COALESCE(current_ordinal_count, 0), 
                current_ordinal_count = $1, 
                updated_at = NOW()
            WHERE wallet_address = $2
          `, [total, user.wallet_address])
          
          // Update last checked time in discord_users
          await pool.query(`
            UPDATE discord_users 
            SET last_checked_at = NOW(), updated_at = NOW()
            WHERE discord_user_id = $1
          `, [user.discord_user_id])
        }
      } catch (error) {
        console.error(`Error checking holder for ${user.wallet_address}:`, error)
      }
    }
    
    return NextResponse.json({
      success: true,
      usersToRemoveRole,
      totalChecked: discordUsers.rows.length,
      totalToRemove: usersToRemoveRole.length
    })
  } catch (error) {
    console.error('Check holders error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

