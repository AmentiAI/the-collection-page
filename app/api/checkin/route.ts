import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Handle daily check-in for Discord users - awards +5 karma every 24 hours
export async function POST(request: NextRequest) {
  try {
    const { discordUserId } = await request.json()
    
    if (!discordUserId) {
      return NextResponse.json(
        { error: 'discordUserId is required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Get Discord user record
    const discordUserResult = await pool.query(
      'SELECT wallet_address, last_checkin FROM discord_users WHERE discord_user_id = $1',
      [discordUserId]
    )
    
    if (discordUserResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Discord user not found. Please verify your wallet first using /verify.' },
        { status: 404 }
      )
    }
    
    const { wallet_address, last_checkin } = discordUserResult.rows[0]
    
    // Check if 24 hours have passed since last check-in
    const now = new Date()
    const lastCheckin = last_checkin ? new Date(last_checkin) : null
    
    if (lastCheckin) {
      const hoursSinceCheckin = (now.getTime() - lastCheckin.getTime()) / (1000 * 60 * 60)
      
      if (hoursSinceCheckin < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceCheckin)
        const nextCheckin = new Date(lastCheckin.getTime() + 24 * 60 * 60 * 1000)
        
        return NextResponse.json({
          success: false,
          error: 'You can only check in once every 24 hours.',
          hoursRemaining,
          nextCheckin: nextCheckin.toISOString(),
          message: `⏰ **Check-in Cooldown**\n\nYou can check in again in ${hoursRemaining} hour(s).`
        })
      }
    }
    
    // Get profile ID
    const profileResult = await pool.query(
      'SELECT id FROM profiles WHERE wallet_address = $1',
      [wallet_address]
    )
    
    if (profileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }
    
    const profileId = profileResult.rows[0].id
    
    // Award +5 karma for check-in
    await pool.query(`
      INSERT INTO karma_points (profile_id, points, type, reason, given_by)
      VALUES ($1, 5, 'good', 'Daily check-in', 'system')
    `, [profileId])
    
    // Update last_checkin timestamp
    await pool.query(`
      UPDATE discord_users 
      SET last_checkin = NOW(), updated_at = NOW()
      WHERE discord_user_id = $1
    `, [discordUserId])
    
    console.log(`✅ Check-in successful for Discord user ${discordUserId} - awarded +5 karma`)
    
    return NextResponse.json({
      success: true,
      karmaAwarded: 5,
      message: '✅ **Check-in Successful!**\n\nYou received **+5 karma points** for checking in today.\n\nCome back in 24 hours to check in again!',
      nextCheckinAvailable: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    })
  } catch (error) {
    console.error('Check-in error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

