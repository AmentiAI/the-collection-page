import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Reset karma points and history, update chosen side
// Keeps profile, discord, and twitter info
export async function POST(request: NextRequest) {
  try {
    const { walletAddress, chosenSide } = await request.json()
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }
    
    if (!chosenSide || (chosenSide !== 'good' && chosenSide !== 'evil')) {
      return NextResponse.json(
        { error: 'chosenSide must be "good" or "evil"' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Use transaction to ensure atomicity
    await pool.query('BEGIN')
    
    let profileId: number | null = null
    
    try {
      // Get profile
      const profileResult = await pool.query(`
        SELECT id
        FROM profiles
        WHERE wallet_address = $1
        FOR UPDATE
      `, [walletAddress])
      
      if (profileResult.rows.length === 0) {
        await pool.query('ROLLBACK')
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        )
      }
      
      profileId = profileResult.rows[0].id
      
      // FIRST: Delete all karma points for this profile (wipes existing karma records)
      // This ensures any karma that somehow exists without a chosen side gets cleaned up
      await pool.query(`
        DELETE FROM karma_points
        WHERE profile_id = $1
      `, [profileId])
      
      // Also delete user task completions (they'll need to redo tasks)
      await pool.query(`
        DELETE FROM user_task_completions
        WHERE profile_id = $1
      `, [profileId])
      
      // THEN: Reset karma totals and update chosen_side
      await pool.query(`
        UPDATE profiles
        SET total_good_karma = 0,
            total_bad_karma = 0,
            chosen_side = $1,
            updated_at = NOW()
        WHERE wallet_address = $2
      `, [chosenSide, walletAddress])
      
      await pool.query('COMMIT')
    } catch (error) {
      await pool.query('ROLLBACK')
      throw error
    }
    
    console.log(`✅ Reset karma and set side to ${chosenSide} for ${walletAddress}`)
    
    // After reset, scan activities and recalculate karma
    // Do this synchronously to ensure it completes
    if (profileId !== null) {
      try {
        // Import the scan functions from utility files
        const { scanActivitiesForWallet } = await import('@/lib/activity-utils')
        const { calculateOrdinalKarmaForWallet } = await import('@/lib/karma-utils')
        
        // 1. Scan activity history for purchases/creates
        const scanResult = await scanActivitiesForWallet(walletAddress, chosenSide, profileId, pool)
        console.log(`✅ Scanned activities:`, scanResult)
        
        // 2. Recalculate ordinal ownership karma (force recalculation since we just reset)
        const karmaResult = await calculateOrdinalKarmaForWallet(walletAddress, pool, true)
        console.log(`✅ Recalculated ordinal karma:`, karmaResult)
      } catch (error) {
        console.error('Error scanning activities/recalculating karma:', error)
        // Don't fail the reset if this fails - it can be done manually
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Karma reset successfully. You have chosen the ${chosenSide} side. Your activities are being scanned...`,
      chosenSide
    })
  } catch (error) {
    console.error('Reset karma error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Get current chosen side
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
    
    const profileResult = await pool.query(`
      SELECT chosen_side
      FROM profiles
      WHERE wallet_address = $1
    `, [walletAddress])
    
    if (profileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      chosenSide: profileResult.rows[0].chosen_side || null
    })
  } catch (error) {
    console.error('Get chosen side error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

