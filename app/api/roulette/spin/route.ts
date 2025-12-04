import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Ensure roulette tables exist
async function ensureRouletteTables(pool: ReturnType<typeof getPool>) {
  // Create roulette_spins table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roulette_spins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      guessed_color TEXT NOT NULL CHECK (guessed_color IN ('red', 'black', 'green')),
      result_color TEXT NOT NULL CHECK (result_color IN ('red', 'black', 'green')),
      won BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(profile_id)
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_roulette_spins_profile_id ON roulette_spins(profile_id)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_roulette_spins_wallet_address ON roulette_spins(wallet_address)
  `)

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, guessedColor } = body

    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }

    if (!guessedColor || !['red', 'black', 'green'].includes(guessedColor)) {
      return NextResponse.json({ error: 'guessedColor must be red, black, or green' }, { status: 400 })
    }

    const pool = getPool()
    
    // Ensure tables exist
    await ensureRouletteTables(pool)
    
    const normalizedWallet = walletAddress.toLowerCase().trim()

    // Get or create profile
    let profileResult = await pool.query(
      'SELECT id FROM profiles WHERE LOWER(wallet_address) = $1',
      [normalizedWallet]
    )

    if (profileResult.rows.length === 0) {
      // Create profile if it doesn't exist
      await pool.query(
        'INSERT INTO profiles (wallet_address, payment_address) VALUES ($1, $1)',
        [walletAddress]
      )
      profileResult = await pool.query(
        'SELECT id FROM profiles WHERE LOWER(wallet_address) = $1',
        [normalizedWallet]
      )
    }

    if (profileResult.rows.length === 0) {
      return NextResponse.json({ error: 'Failed to create or find profile' }, { status: 500 })
    }

    const profileId = profileResult.rows[0].id

    // Check if user has already spun
    const existingSpin = await pool.query(
      'SELECT * FROM roulette_spins WHERE profile_id = $1',
      [profileId]
    )

    if (existingSpin.rows.length > 0) {
      return NextResponse.json(
        { 
          error: 'You have already used your spin',
          alreadySpun: true,
          previousResult: {
            guessedColor: existingSpin.rows[0].guessed_color,
            resultColor: existingSpin.rows[0].result_color,
            won: existingSpin.rows[0].won
          }
        },
        { status: 400 }
      )
    }

    // Generate random result (European roulette: 18 red, 18 black, 1 green)
    // Simplified: 48% red, 48% black, 4% green
    const random = Math.random()
    let resultColor: 'red' | 'black' | 'green'
    
    if (random < 0.48) {
      resultColor = 'red'
    } else if (random < 0.96) {
      resultColor = 'black'
    } else {
      resultColor = 'green'
    }

    const won = guessedColor === resultColor

    // Record the spin
    await pool.query(
      `INSERT INTO roulette_spins (profile_id, wallet_address, guessed_color, result_color, won)
       VALUES ($1, $2, $3, $4, $5)`,
      [profileId, walletAddress, guessedColor, resultColor, won]
    )

    // If they won, award a badge
    if (won) {
      const isLegendary = resultColor === 'green'
      const badgeType = `roulette_winner_${resultColor}`
      const badgeName = isLegendary 
        ? `🌟 LEGENDARY: Roulette Green Winner` 
        : `Roulette ${resultColor.charAt(0).toUpperCase() + resultColor.slice(1)} Winner`
      const badgeDescription = isLegendary
        ? `Legendary achievement! Correctly guessed the rare green (4% chance) on the roulette wheel`
        : `Correctly guessed ${resultColor} on the roulette wheel`
      const badgeRarity = isLegendary ? 'legendary' : 'common'

      await pool.query(
        `INSERT INTO user_badges (profile_id, badge_type, badge_name, badge_description, badge_rarity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (profile_id, badge_type) DO NOTHING`,
        [profileId, badgeType, badgeName, badgeDescription, badgeRarity]
      )
    }

    return NextResponse.json({
      success: true,
      result: {
        guessedColor,
        resultColor,
        won,
        badgeAwarded: won
      }
    })
  } catch (error) {
    console.error('Roulette spin error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Check if user has already spun
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
      return NextResponse.json({ hasSpun: false, canSpin: true })
    }

    const profileId = profileResult.rows[0].id

    // Check if user has already spun
    const existingSpin = await pool.query(
      'SELECT * FROM roulette_spins WHERE profile_id = $1',
      [profileId]
    )

    if (existingSpin.rows.length === 0) {
      return NextResponse.json({ hasSpun: false, canSpin: true })
    }

    const spin = existingSpin.rows[0]

    // Check if they won and have a badge
    const badgeResult = await pool.query(
      'SELECT * FROM user_badges WHERE profile_id = $1 AND badge_type LIKE $2',
      [profileId, `roulette_winner_%`]
    )

    return NextResponse.json({
      hasSpun: true,
      canSpin: false,
      previousResult: {
        guessedColor: spin.guessed_color,
        resultColor: spin.result_color,
        won: spin.won,
        hasBadge: badgeResult.rows.length > 0
      }
    })
  } catch (error) {
    console.error('Roulette check error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

