import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Consolidated profile endpoint that fetches all profile data in optimized queries
 * Returns counts instead of full record dumps where possible
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const walletAddress = searchParams.get('walletAddress')
  const paymentAddress = searchParams.get('paymentAddress')

  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Wallet address required' },
      { status: 400 }
    )
  }

  const normalizedWallet = walletAddress.toLowerCase()

 
  try {
    const pool = getPool()
    
    // Auto-create profile if it doesn't exist, or update payment_address if provided
    if (paymentAddress) {
      await pool.query(
        `INSERT INTO profiles (wallet_address, payment_address)
         VALUES ($1, $2)
         ON CONFLICT (wallet_address) 
         DO UPDATE SET payment_address = EXCLUDED.payment_address, updated_at = NOW()`,
        [walletAddress, paymentAddress]
      )
    } else {
      await pool.query(
        `INSERT INTO profiles (wallet_address)
         VALUES ($1)
         ON CONFLICT (wallet_address) DO NOTHING`,
        [walletAddress]
      )
    }
    
    // Define queries with logging
    const abyssStatsQuery = `SELECT 
          (SELECT COUNT(*)::int FROM ascended_images_mint_queue WHERE LOWER(source_inscription_id) LIKE 'ascended_%') as ascension_total,
          (SELECT COUNT(*)::int FROM ascended_images_mint_queue WHERE LOWER(source_inscription_id) NOT LIKE 'ascended_%') as demons_revived,
          (SELECT COUNT(*)::int FROM abyss_burns) as total_burns,
          EXISTS(
            SELECT 1 FROM abyss_burns 
            WHERE LOWER(ordinal_wallet) = $1 OR LOWER(payment_wallet) = $1
          ) as is_executioner`
    
 
    
    // Execute all queries in parallel for maximum performance
    const [
      profileResult,
      socialResult,
      holderResult,
      abyssStatsResult,
      summonsCountResult,
      portalSummaryResult,
    ] = await Promise.allSettled([
      // 1. Profile data (karma, chosen side) + bonus allowance from separate table
      pool.query(
        `SELECT 
          p.id,
          p.username,
          p.avatar_url,
          p.total_good_karma,
          p.total_bad_karma,
          p.chosen_side,
          COALESCE(aba.available, 0) as bonus_allowance
         FROM profiles p
         LEFT JOIN abyss_bonus_allowances aba ON LOWER(aba.wallet) = LOWER(p.wallet_address)
         WHERE LOWER(p.wallet_address) = $1`,
        [normalizedWallet]
      ),

      // 2. Social connections (discord + twitter) - JOIN with separate tables
      pool.query(
        `SELECT 
          du.discord_user_id,
          tu.twitter_user_id,
          tu.twitter_username
         FROM profiles p
         LEFT JOIN discord_users du ON du.profile_id = p.id
         LEFT JOIN twitter_users tu ON tu.profile_id = p.id
         WHERE LOWER(p.wallet_address) = $1`,
        [normalizedWallet]
      ),

      // 3. Holder status (check abyss_burns + grave_robbing_events for access)
      pool.query(
        `SELECT 
          EXISTS(
            SELECT 1 FROM abyss_burns 
            WHERE LOWER(ordinal_wallet) = $1 OR LOWER(payment_wallet) = $1
          ) as has_burns,
          EXISTS(SELECT 1 FROM grave_robbing_events WHERE LOWER(previous_owner) = $1 AND success = true) as has_grave_robbed
         `,
        [normalizedWallet]
      ),

      // 4. Abyss stats (counts only, not full dumps)
      pool.query(abyssStatsQuery, [normalizedWallet]),

      // 5. Summons summary (counts only, bonus_allowance already fetched in profile query)
      pool.query(
        `SELECT 
          (SELECT COUNT(*)::int FROM abyss_summons WHERE LOWER(creator_wallet) = $1 AND status IN ('open', 'filling', 'ready')) as created_open_count,
          (SELECT COUNT(*)::int FROM abyss_summon_participants asp
           JOIN abyss_summons assum ON asp.summon_id = assum.id
           WHERE LOWER(asp.wallet) = $1 AND assum.status IN ('open', 'filling', 'ready')
           AND LOWER(assum.creator_wallet) != $1
          ) as joined_active_count
         `,
        [normalizedWallet]
      ),

      // 6. Portal summary (counts only) - use damned_pool_circles table
      pool.query(
        `SELECT 
          (SELECT COUNT(*)::int FROM damned_pool_circles 
           WHERE LOWER(creator_wallet) = $1 
           AND status = 'completed'
          ) as completed_created,
          (SELECT COUNT(*)::int FROM damned_pool_participants dpp
           JOIN damned_pool_circles dpc ON dpp.circle_id = dpc.id
           WHERE LOWER(dpp.wallet) = $1 
           AND dpc.status = 'completed'
           AND LOWER(dpc.creator_wallet) != $1
          ) as completed_joined
         `,
        [normalizedWallet]
      ),
    ])

    // Build response from settled promises
    const response: Record<string, any> = {
      success: true,
      profile: null,
      social: {
        discord: { linked: false, identifier: null },
        twitter: { linked: false, identifier: null },
      },
      holder: {
        hasBurns: false,
        hasGraveRobbed: false,
        isHolder: false,
      },
      abyssStats: {
        ascensionTotal: 0,
        demonsRevived: 0,
        totalBurns: 0,
        isExecutioner: false,
      },
      summons: {
        createdOpenCount: 0,
        joinedActiveCount: 0,
        bonusAllowance: 0,
      },
      portal: {
        completedCreated: 0,
        completedJoined: 0,
        isPortalSummoner: false,
      },
    }

    // Parse profile result
    if (profileResult.status === 'fulfilled' && profileResult.value.rows[0]) {
      const row = profileResult.value.rows[0]
      response.profile = {
        username: row.username,
        avatarUrl: row.avatar_url,
        totalGoodKarma: row.total_good_karma || 0,
        totalBadKarma: row.total_bad_karma || 0,
        chosenSide: row.chosen_side,
      }
      // Set bonus allowance from profile
      response.summons.bonusAllowance = row.bonus_allowance || 0
    }

    // Parse social result (LEFT JOIN so may have nulls)
    if (socialResult.status === 'fulfilled' && socialResult.value.rows[0]) {
      const row = socialResult.value.rows[0]
      response.social.discord = {
        linked: Boolean(row.discord_user_id),
        identifier: row.discord_user_id || null,
      }
      response.social.twitter = {
        linked: Boolean(row.twitter_user_id),
        identifier: row.twitter_username || row.twitter_user_id || null,
      }
    }

    // Parse holder result
 
    if (holderResult.status === 'fulfilled') {
    
      if (holderResult.value.rows[0]) {
        const row = holderResult.value.rows[0]
        
       
        
        response.holder.hasBurns = Boolean(row.has_burns)
        response.holder.hasGraveRobbed = Boolean(row.has_grave_robbed)
        response.holder.isHolder = Boolean(row.has_burns || row.has_grave_robbed)
      }
    }  

    // Parse abyss stats result
   
    if (abyssStatsResult.status === 'fulfilled') {
     
      
      if (abyssStatsResult.value.rows[0]) {
        const row = abyssStatsResult.value.rows[0]
        
      
        
        response.abyssStats = {
          ascensionTotal: row.ascension_total || 0,
          demonsRevived: row.demons_revived || 0,
          totalBurns: row.total_burns || 0,
          isExecutioner: Boolean(row.is_executioner),
        }
      }
    } 

    // Parse summons result (bonus_allowance already set from profile)
    if (summonsCountResult.status === 'fulfilled' && summonsCountResult.value.rows[0]) {
      const row = summonsCountResult.value.rows[0]
      response.summons.createdOpenCount = row.created_open_count || 0
      response.summons.joinedActiveCount = row.joined_active_count || 0
    }

    // Parse portal summary result
    if (portalSummaryResult.status === 'fulfilled' && portalSummaryResult.value.rows[0]) {
      const row = portalSummaryResult.value.rows[0]
      response.portal = {
        completedCreated: row.completed_created || 0,
        completedJoined: row.completed_joined || 0,
        isPortalSummoner: (row.completed_created || 0) > 0,
      }
    }

   
    
    return NextResponse.json(response)
  } catch (error) {
   
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch profile data',
      },
      { status: 500 }
    )
  }
}

