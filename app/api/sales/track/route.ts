import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Track ordinal sale and deduct karma
export async function POST(request: NextRequest) {
  try {
    const { walletAddress, inscriptionId, karmaPoints = -20 } = await request.json()
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Check if sale already recorded
    if (inscriptionId) {
      const existing = await pool.query(
        'SELECT id FROM ordinal_sales WHERE inscription_id = $1',
        [inscriptionId]
      )
      
      if (existing.rows.length > 0) {
        return NextResponse.json({
          success: true,
          message: 'Sale already recorded',
          alreadyRecorded: true
        })
      }
    }
    
    // Record the sale
    await pool.query(`
      INSERT INTO ordinal_sales (wallet_address, inscription_id, karma_deducted, sold_at)
      VALUES ($1, $2, $3, NOW())
    `, [walletAddress, inscriptionId || null, karmaPoints])
    
    // Get profile ID
    const profileResult = await pool.query(
      'SELECT id FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    if (profileResult.rows.length > 0) {
      const profileId = profileResult.rows[0].id
      
      // Deduct karma points
      await pool.query(`
        INSERT INTO karma_points (profile_id, points, type, reason, given_by)
        VALUES ($1, $2, 'bad', 'Sold The Damned ordinal', 'system')
      `, [profileId, karmaPoints])
    }
    
    return NextResponse.json({
      success: true,
      message: 'Sale recorded and karma deducted',
      karmaDeducted: karmaPoints
    })
  } catch (error) {
    console.error('Track sale error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

