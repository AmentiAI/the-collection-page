import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Cron job endpoint to check 30 profiles at a time for ordinal count changes
// This should be called every 10 minutes by an external cron service
export async function GET(request: Request) {
  try {
    const pool = getPool()
    const apiKey = process.env.NEXT_PUBLIC_MAGIC_EDEN_API_KEY || 'd637ae87-8bfe-4d6a-ac3d-9d563901b444'
    
    // Get 30 profiles with oldest last_holder_check (or NULL) to process
    const profilesToCheck = await pool.query(`
      SELECT id, wallet_address, last_ordinal_count, current_ordinal_count, last_holder_check
      FROM profiles
      ORDER BY 
        CASE WHEN last_holder_check IS NULL THEN 0 ELSE 1 END,
        last_holder_check ASC NULLS FIRST
      LIMIT 30
    `)
    
    if (profilesToCheck.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No profiles to check',
        processed: 0
      })
    }
    
    const results = {
      processed: 0,
      purchases: 0,
      sales: 0,
      ownershipUpdates: 0,
      errors: 0
    }
    
    // Process each profile
    for (const profile of profilesToCheck.rows) {
      try {
        const apiUrl = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=the-damned&ownerAddress=${encodeURIComponent(profile.wallet_address)}&showAll=true`
        
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
          console.error(`Error checking profile ${profile.wallet_address}:`, response.status)
          results.errors++
          // Still update last_holder_check to avoid getting stuck
          await pool.query(
            `UPDATE profiles SET last_holder_check = NOW() WHERE id = $1`,
            [profile.id]
          )
          continue
        }
        
        const data = await response.json()
        const currentCount = data.total ?? (Array.isArray(data.tokens) ? data.tokens.length : 0)
        const previousCount = profile.last_ordinal_count || 0
        const currentCountInDb = profile.current_ordinal_count || 0
        
        // Only process if count has changed
        if (currentCount !== currentCountInDb) {
          // Detect purchases (count increased)
          if (currentCount > previousCount && previousCount >= 0) {
            const purchasedCount = currentCount - previousCount
            results.purchases += purchasedCount
            
            // Award karma for each purchase individually
            for (let i = 0; i < purchasedCount; i++) {
              await pool.query(`
                INSERT INTO karma_points (profile_id, points, type, reason, given_by)
                VALUES ($1, $2, 'good', 'Purchased The Damned ordinal', 'system')
              `, [profile.id, 20])
            }
            
            console.log(`Awarded ${purchasedCount * 20} karma (${purchasedCount} entries) to ${profile.wallet_address} for purchasing ${purchasedCount} ordinal(s)`)
          }
          
          // Detect sales (count decreased)
          if (currentCount < previousCount && previousCount > 0) {
            const soldCount = previousCount - currentCount
            results.sales += soldCount
            
            // Deduct karma for each sale
            for (let i = 0; i < soldCount; i++) {
              // Check if sale already recorded (avoid duplicates)
              const recentSale = await pool.query(`
                SELECT id FROM ordinal_sales 
                WHERE wallet_address = $1 
                AND sold_at > NOW() - INTERVAL '1 hour'
                ORDER BY sold_at DESC
                LIMIT 1
              `, [profile.wallet_address])
              
              if (recentSale.rows.length === 0) {
                // Record the sale
                await pool.query(`
                  INSERT INTO ordinal_sales (wallet_address, karma_deducted, sold_at)
                  VALUES ($1, -20, NOW())
                `, [profile.wallet_address])
                
                // Deduct karma
                await pool.query(`
                  INSERT INTO karma_points (profile_id, points, type, reason, given_by)
                  VALUES ($1, -20, 'evil', 'Sold The Damned ordinal', 'system')
                `, [profile.id])
              }
            }
          }
          
          // Update ordinal ownership karma (+5 per ordinal)
          const expectedKarma = currentCount * 5
          const existingKarmaResult = await pool.query(`
            SELECT COALESCE(SUM(points), 0) as total
            FROM karma_points
            WHERE profile_id = $1 AND reason = 'Ordinal ownership'
          `, [profile.id])
          
          const existingKarma = parseInt(existingKarmaResult.rows[0]?.total || '0')
          const karmaDifference = expectedKarma - existingKarma
          
          if (karmaDifference !== 0) {
            results.ownershipUpdates++
            if (karmaDifference > 0) {
              await pool.query(`
                INSERT INTO karma_points (profile_id, points, type, reason, given_by)
                VALUES ($1, $2, 'good', 'Ordinal ownership', 'system')
              `, [profile.id, karmaDifference])
            } else {
              await pool.query(`
                INSERT INTO karma_points (profile_id, points, type, reason, given_by)
                VALUES ($1, $2, 'evil', 'Ordinal ownership adjustment', 'system')
              `, [profile.id, karmaDifference])
            }
          }
          
          // Update profile with new counts
          await pool.query(`
            UPDATE profiles 
            SET last_ordinal_count = COALESCE(current_ordinal_count, 0),
                current_ordinal_count = $1,
                last_holder_check = NOW(),
                updated_at = NOW()
            WHERE id = $2
          `, [currentCount, profile.id])
        } else {
          // Count hasn't changed, just update last_holder_check
          await pool.query(
            `UPDATE profiles SET last_holder_check = NOW() WHERE id = $1`,
            [profile.id]
          )
        }
        
        results.processed++
      } catch (error) {
        console.error(`Error processing profile ${profile.wallet_address}:`, error)
        results.errors++
        // Update last_holder_check to avoid getting stuck on errors
        await pool.query(
          `UPDATE profiles SET last_holder_check = NOW() WHERE id = $1`,
          [profile.id]
        )
      }
    }
    
    return NextResponse.json({
      success: true,
      ...results,
      message: `Processed ${results.processed} profiles: ${results.purchases} purchases, ${results.sales} sales, ${results.ownershipUpdates} ownership updates`
    })
  } catch (error) {
    console.error('Cron check error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


