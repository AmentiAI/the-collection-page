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
    const karmaType = type === 'good' ? 'good' : 'bad'
    const reason = type === 'good' ? 'Daily check-in (Good)' : 'Daily check-in (Evil)'
    
    // Award karma
    await pool.query(`
      INSERT INTO karma_points (profile_id, points, type, reason, given_by)
      VALUES ($1, $2, $3, $4, 'system')
    `, [profileId, karmaPoints, karmaType, reason])
    
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


