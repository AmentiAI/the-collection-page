import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Handle daily check-in for wallet users - awards karma based on good/evil choice
// Uses server time (UTC) to determine 24-hour cooldown
export async function POST(request: NextRequest) {
  try {
    const { walletAddress, type } = await request.json()
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }
    
    if (!type || (type !== 'good' && type !== 'evil')) {
      return NextResponse.json(
        { error: 'type must be "good" or "evil"' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Get profile with last check-in time
    const profileResult = await pool.query(`
      SELECT id, last_daily_checkin
      FROM profiles
      WHERE wallet_address = $1
    `, [walletAddress])
    
    if (profileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Profile not found. Please verify your wallet first.' },
        { status: 404 }
      )
    }
    
    const { id: profileId, last_daily_checkin } = profileResult.rows[0]
    
    // Use server time (UTC) - NOW() from PostgreSQL
    // Check if 24 hours have passed since last check-in
    const nowResult = await pool.query('SELECT NOW() as server_time')
    const serverNow = new Date(nowResult.rows[0].server_time)
    const lastCheckin = last_daily_checkin ? new Date(last_daily_checkin) : null
    
    if (lastCheckin) {
      // Calculate time difference in milliseconds
      const timeSinceCheckin = serverNow.getTime() - lastCheckin.getTime()
      const hoursSinceCheckin = timeSinceCheckin / (1000 * 60 * 60)
      
      if (hoursSinceCheckin < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceCheckin)
        const nextCheckin = new Date(lastCheckin.getTime() + 24 * 60 * 60 * 1000)
        
        return NextResponse.json({
          success: false,
          error: 'You can only check in once every 24 hours (server time).',
          hoursRemaining,
          nextCheckin: nextCheckin.toISOString(),
          serverTime: serverNow.toISOString(),
          lastCheckin: lastCheckin.toISOString()
        })
      }
    }
    
    // Award karma based on type
    const karmaPoints = type === 'good' ? 5 : -5
    const karmaType = type === 'good' ? 'good' : 'evil'
    const reason = type === 'good' ? 'Daily check-in (Good)' : 'Daily check-in (Evil)'
    
    // Award karma (capture inserted row for task linkage)
    const karmaInsertResult = await pool.query(`
      INSERT INTO karma_points (profile_id, points, type, reason, given_by)
      VALUES ($1, $2, $3, $4, 'system')
      RETURNING id
    `, [profileId, karmaPoints, karmaType, reason])

    const karmaPointId = karmaInsertResult.rows[0]?.id || null
    
    // If there is a Daily Check-in task for this side, mark it as completed without awarding extra karma
    if (karmaPointId) {
      const taskResult = await pool.query(`
        SELECT id FROM karma_tasks
        WHERE title = 'Daily Check-in'
          AND type = $1
          AND is_active = true
        LIMIT 1
      `, [karmaType])

      if (taskResult.rows.length > 0) {
        const taskId = taskResult.rows[0].id

        const existingCompletion = await pool.query(`
          SELECT id, karma_points_id
          FROM user_task_completions
          WHERE profile_id = $1 AND task_id = $2
        `, [profileId, taskId])

        if (existingCompletion.rows.length === 0) {
          await pool.query(`
            INSERT INTO user_task_completions (profile_id, task_id, proof, karma_points_id)
            VALUES ($1, $2, NULL, $3)
          `, [profileId, taskId, karmaPointId])
        } else if (!existingCompletion.rows[0].karma_points_id) {
          // Ensure existing completion points to the latest karma entry
          await pool.query(`
            UPDATE user_task_completions
            SET karma_points_id = $1
            WHERE id = $2
          `, [karmaPointId, existingCompletion.rows[0].id])
        }
      }
    }
    
    // Update last_daily_checkin timestamp using server time
    await pool.query(`
      UPDATE profiles 
      SET last_daily_checkin = NOW(), updated_at = NOW()
      WHERE wallet_address = $1
    `, [walletAddress])
    
    // Get updated profile to return new karma totals
    const updatedProfile = await pool.query(`
      SELECT total_good_karma, total_bad_karma
      FROM profiles
      WHERE wallet_address = $1
    `, [walletAddress])
    
    const { total_good_karma, total_bad_karma } = updatedProfile.rows[0]
    
    console.log(`✅ Daily check-in successful for ${walletAddress} (${type}) - awarded ${karmaPoints} karma`)
    
    return NextResponse.json({
      success: true,
      karmaAwarded: karmaPoints,
      type,
      totalGoodKarma: total_good_karma || 0,
      totalBadKarma: total_bad_karma || 0,
      message: `✅ **Check-in Successful!**\n\nYou received **${karmaPoints > 0 ? '+' : ''}${karmaPoints} karma points** for checking in as **${type === 'good' ? 'Good' : 'Evil'}** today.\n\nCome back in 24 hours to check in again!`,
      nextCheckinAvailable: new Date(serverNow.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      serverTime: serverNow.toISOString()
    })
  } catch (error) {
    console.error('Daily check-in error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET endpoint to check check-in status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Get profile with last check-in time
    const profileResult = await pool.query(`
      SELECT id, last_daily_checkin
      FROM profiles
      WHERE wallet_address = $1
    `, [walletAddress])
    
    if (profileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }
    
    const { last_daily_checkin } = profileResult.rows[0]
    
    // Use server time (UTC) - NOW() from PostgreSQL
    const nowResult = await pool.query('SELECT NOW() as server_time')
    const serverNow = new Date(nowResult.rows[0].server_time)
    const lastCheckin = last_daily_checkin ? new Date(last_daily_checkin) : null
    
    let canCheckIn = true
    let hoursRemaining = 0
    let nextCheckin: string | null = null
    
    if (lastCheckin) {
      const timeSinceCheckin = serverNow.getTime() - lastCheckin.getTime()
      const hoursSinceCheckin = timeSinceCheckin / (1000 * 60 * 60)
      
      if (hoursSinceCheckin < 24) {
        canCheckIn = false
        hoursRemaining = Math.ceil(24 - hoursSinceCheckin)
        nextCheckin = new Date(lastCheckin.getTime() + 24 * 60 * 60 * 1000).toISOString()
      }
    }
    
    return NextResponse.json({
      canCheckIn,
      hoursRemaining,
      nextCheckin,
      lastCheckin: lastCheckin?.toISOString() || null,
      serverTime: serverNow.toISOString()
    })
  } catch (error) {
    console.error('Check-in status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


