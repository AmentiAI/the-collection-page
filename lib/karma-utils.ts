import type { Pool } from 'pg'

// Core function to calculate ordinal karma (can be called directly)
export async function calculateOrdinalKarmaForWallet(walletAddress: string, pool: Pool, forceRecalculate: boolean = false) {
  try {
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
      throw new Error('Failed to fetch ordinals')
    }
    
    const data = await response.json()
    const ordinalCount = data.total ?? (Array.isArray(data.tokens) ? data.tokens.length : 0)
    const expectedKarma = ordinalCount * 5
    
    // Get or create profile
    let profileResult = await pool.query(
      'SELECT id, last_ordinal_count, current_ordinal_count, updated_at, chosen_side FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    if (profileResult.rows.length === 0) {
      await pool.query(
        'INSERT INTO profiles (wallet_address, payment_address) VALUES ($1, $1)',
        [walletAddress]
      )
      profileResult = await pool.query(
        'SELECT id, last_ordinal_count, current_ordinal_count, updated_at, chosen_side FROM profiles WHERE wallet_address = $1',
        [walletAddress]
      )
    }
    
    const profileId = profileResult.rows[0].id
    const profileUpdatedAt = profileResult.rows[0].updated_at
    const chosenSide = profileResult.rows[0].chosen_side || 'good' // Default to good if not set

    // Get previous ordinal counts from profiles
    const previousCount = profileResult.rows[0].last_ordinal_count || 0
    const currentCountInDb = profileResult.rows[0].current_ordinal_count || 0
    
    // Only proceed with karma adjustments if the ordinal count has actually changed
    // OR if we're forcing recalculation (e.g., after reset)
    const ordinalCountChanged = ordinalCount !== currentCountInDb || forceRecalculate
    
    // If count hasn't changed and we're not forcing, don't do anything (prevents duplicate processing)
    if (!ordinalCountChanged && !forceRecalculate) {
      return {
        success: true,
        ordinalCount,
        karmaPoints: expectedKarma,
        karmaDifference: 0,
        ordinalCountChanged: false,
        message: `Ordinal count unchanged (${ordinalCount})`
      }
    }
    
    // Update ordinal counts in profiles FIRST (before awarding karma)
    // This ensures we have a proper timestamp for duplicate detection
    await pool.query(`
      UPDATE profiles 
      SET last_ordinal_count = COALESCE(current_ordinal_count, 0),
          current_ordinal_count = $1,
          updated_at = NOW()
      WHERE wallet_address = $2
    `, [ordinalCount, walletAddress])
    
    // Get the updated timestamp for duplicate detection
    const updatedProfileResult = await pool.query(
      'SELECT updated_at FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    const newUpdatedAt = updatedProfileResult.rows[0]?.updated_at
    
    // Detect if user bought new ordinals (count increased) - +20 karma per purchase
    // Only award if count actually increased from previous count
    if (ordinalCount > previousCount && previousCount >= 0) {
      const purchasedCount = ordinalCount - previousCount
      
      // Check how many purchase karma entries exist for this profile
      // Look for entries created in the last 5 minutes to catch any duplicates from rapid calls
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      
      const existingPurchaseKarmaResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM karma_points
        WHERE profile_id = $1 
          AND reason = 'Purchased The Damned ordinal'
          AND created_at >= $2
      `, [profileId, fiveMinutesAgo])
      
      const existingPurchaseCount = parseInt(existingPurchaseKarmaResult.rows[0]?.count || '0')
      
      // Only award if we haven't already recorded all the purchases
      // This prevents duplicates if the function is called multiple times
      if (existingPurchaseCount < purchasedCount && purchasedCount > 0) {
        const remainingPurchases = purchasedCount - existingPurchaseCount
        
        // Award karma for remaining purchases (separate entries)
        // Use chosen_side for karma type (purchases are always +20, but type matches chosen side)
        for (let i = 0; i < remainingPurchases; i++) {
          await pool.query(`
            INSERT INTO karma_points (profile_id, points, type, reason, given_by)
            VALUES ($1, $2, $3, 'Purchased The Damned ordinal', 'system')
          `, [profileId, 20, chosenSide])
        }
        
        // If this is the first purchase, complete the "Purchased The Damned Ordinal" task
        if (existingPurchaseCount === 0 && remainingPurchases > 0) {
          const taskResult = await pool.query(`
            SELECT id FROM karma_tasks 
            WHERE title = 'Purchased The Damned Ordinal' 
              AND type = $1 
              AND is_active = true
            LIMIT 1
          `, [chosenSide])
          
          if (taskResult.rows.length > 0) {
            const taskId = taskResult.rows[0].id
            
            // Check if already completed
            const existingCompletion = await pool.query(`
              SELECT id FROM user_task_completions 
              WHERE profile_id = $1 AND task_id = $2
            `, [profileId, taskId])
            
            if (existingCompletion.rows.length === 0) {
              // Record completion
              await pool.query(`
                INSERT INTO user_task_completions (profile_id, task_id, proof)
                VALUES ($1, $2, $3)
              `, [profileId, taskId, null])
              
              console.log(`✅ Completed "Purchased The Damned Ordinal" task for ${walletAddress}`)
            }
          }
        }
        
        console.log(`✅ Awarded ${remainingPurchases * 20} karma (${remainingPurchases} separate entries) to ${walletAddress} for ${remainingPurchases} new purchase(s) (total: ${purchasedCount}, existing: ${existingPurchaseCount})`)
      } else if (existingPurchaseCount >= purchasedCount) {
        console.log(`⏭️ Skipping duplicate purchase karma for ${walletAddress} - already recorded ${existingPurchaseCount} purchase(s), expected ${purchasedCount}`)
      }
    }
    
    let karmaDifference = 0
    
    // Always adjust karma if ordinal count changed OR if we're forcing recalculation
    if (ordinalCountChanged || forceRecalculate) {
      // Get existing ordinal karma (sum of all "Ordinal ownership" karma entries)
      const existingKarmaResult = await pool.query(`
        SELECT COALESCE(SUM(points), 0) as total
        FROM karma_points
        WHERE profile_id = $1 AND reason = 'Ordinal ownership'
      `, [profileId])
      
      const existingKarma = parseInt(existingKarmaResult.rows[0]?.total || '0')
      karmaDifference = expectedKarma - existingKarma
      
      // If there's a difference, add or remove karma points
      // Use chosen_side for karma type
      if (karmaDifference !== 0) {
        if (karmaDifference > 0) {
          // Add karma points (always positive, but type matches chosen side)
          await pool.query(`
            INSERT INTO karma_points (profile_id, points, type, reason, given_by)
            VALUES ($1, $2, $3, 'Ordinal ownership', 'system')
          `, [profileId, karmaDifference, chosenSide])
          
          // If this is the first time getting ordinal ownership karma, complete the "Ordinal Ownership" task
          if (existingKarma === 0 && ordinalCount > 0) {
            const taskResult = await pool.query(`
              SELECT id FROM karma_tasks 
              WHERE title = 'Ordinal Ownership' 
                AND type = $1 
                AND is_active = true
              LIMIT 1
            `, [chosenSide])
            
            if (taskResult.rows.length > 0) {
              const taskId = taskResult.rows[0].id
              
              // Check if already completed
              const existingCompletion = await pool.query(`
                SELECT id FROM user_task_completions 
                WHERE profile_id = $1 AND task_id = $2
              `, [profileId, taskId])
              
              if (existingCompletion.rows.length === 0) {
                // Record completion
                await pool.query(`
                  INSERT INTO user_task_completions (profile_id, task_id, proof)
                  VALUES ($1, $2, $3)
                `, [profileId, taskId, null])
                
                console.log(`✅ Completed "Ordinal Ownership" task for ${walletAddress}`)
              }
            }
          }
        } else {
          // Remove karma points (if they sold ordinals) - use opposite of chosen side
          const oppositeSide = chosenSide === 'good' ? 'evil' : 'good'
          await pool.query(`
            INSERT INTO karma_points (profile_id, points, type, reason, given_by)
            VALUES ($1, $2, $3, 'Ordinal ownership adjustment', 'system')
          `, [profileId, karmaDifference, oppositeSide])
        }
      }
    }
    
    return {
      success: true,
      ordinalCount,
      karmaPoints: expectedKarma,
      karmaDifference,
      ordinalCountChanged,
      message: `You have ${ordinalCount} ordinals, earning ${expectedKarma} karma points`
    }
  } catch (error) {
    console.error('Calculate ordinal karma error:', error)
    throw error
  }
}

