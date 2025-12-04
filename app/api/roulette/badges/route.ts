import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Ensure roulette tables exist
async function ensureRouletteTables(pool: ReturnType<typeof getPool>) {
  // Create user_badges table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      badge_type TEXT NOT NULL,
      badge_name TEXT NOT NULL,
      badge_description TEXT,
      badge_rarity TEXT,
      earned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(profile_id, badge_type)
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_badges_profile_id ON user_badges(profile_id)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_badges_badge_type ON user_badges(badge_type)
  `)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    const pool = getPool()
    
    // Ensure tables exist
    await ensureRouletteTables(pool)
    
    const normalizedWallet = walletAddress.toLowerCase().trim()

    // Get profile
    const profileResult = await pool.query(
      'SELECT id FROM profiles WHERE LOWER(wallet_address) = $1',
      [normalizedWallet]
    )

    if (profileResult.rows.length === 0) {
      return NextResponse.json({ badges: [] })
    }

    const profileId = profileResult.rows[0].id

    // Get all badges for this user
    const badgesResult = await pool.query(
      'SELECT badge_type, badge_name, badge_description, badge_rarity, earned_at FROM user_badges WHERE profile_id = $1 ORDER BY earned_at DESC',
      [profileId]
    )

    return NextResponse.json({
      badges: badgesResult.rows
    })
  } catch (error) {
    console.error('Badges fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

