import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Check for users who haven't checked in within 24 hours and deduct -5 karma
export async function POST(request: NextRequest) {
  try {
    const pool = getPool()
    
    // Get all Discord users with their profiles
    const discordUsersResult = await pool.query(`
      SELECT du.discord_user_id, p.wallet_address, du.last_checkin, du.profile_id
      FROM discord_users du
      INNER JOIN profiles p ON du.profile_id = p.id
      WHERE du.discord_user_id IS NOT NULL
    `)
    
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    let penaltyCount = 0
    let errorCount = 0
    
    for (const user of discordUsersResult.rows) {
      try {
        const lastCheckin = user.last_checkin ? new Date(user.last_checkin) : null
        
        // Check if user hasn't checked in within 24 hours
        const shouldPenalize = !lastCheckin || lastCheckin < twentyFourHoursAgo
        
        if (shouldPenalize && user.profile_id) {
          // Check if we've already applied this penalty in the last 24 hours
          const recentPenaltyCheck = await pool.query(`
            SELECT id FROM karma_points
            WHERE profile_id = $1
            AND reason = 'Missed daily check-in'
            AND created_at > NOW() - INTERVAL '24 hours'
            LIMIT 1
          `, [user.profile_id])
          
          // Only apply penalty if we haven't penalized them in the last 24 hours
          if (recentPenaltyCheck.rows.length === 0) {
            // Deduct -5 karma for missing check-in
            await pool.query(`
              INSERT INTO karma_points (profile_id, points, type, reason, given_by)
              VALUES ($1, -5, 'evil', 'Missed daily check-in', 'system')
            `, [user.profile_id])
            
            penaltyCount++
            console.log(`Applied missed check-in penalty to Discord user ${user.discord_user_id} (${user.wallet_address})`)
          }
        }
      } catch (error) {
        console.error(`Error processing penalty for user ${user.discord_user_id}:`, error)
        errorCount++
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Missed check-in penalty check complete',
      usersChecked: discordUsersResult.rows.length,
      penaltiesApplied: penaltyCount,
      errors: errorCount
    })
  } catch (error) {
    console.error('Missed check-in penalty error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

