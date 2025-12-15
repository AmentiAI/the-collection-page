import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Helper function to get client IP address
function getClientIP(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim()
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP.trim()
  }
  return null
}

// Get or create profile with optional social accounts
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const walletAddress = searchParams.get('walletAddress')
    const includeSocials = searchParams.get('includeSocials') === 'true'
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }
    
    const pool = getPool()

    await pool.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0
    `)
    
    await pool.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS recent_ip TEXT
    `)
    
    // Get client IP
    const clientIP = getClientIP(request)
    
    // Use a timeout for the query
    const queryPromise = pool.query(
      'SELECT * FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), 10000)
    })
    
    const result = await Promise.race([queryPromise, timeoutPromise]) as any
    
    if (result.rows.length === 0) {
      // Create new profile - handle both with and without payment_address column
      let insertResult
      try {
        insertResult = await pool.query(
          `INSERT INTO profiles (wallet_address, payment_address, recent_ip) 
           VALUES ($1, $1, $2) 
           RETURNING *`,
          [walletAddress, clientIP]
        )
      } catch (error: any) {
        // If payment_address column doesn't exist, create without it
        if (error.message && error.message.includes('payment_address')) {
          console.warn('payment_address column not found, creating profile without it')
          insertResult = await pool.query(
            `INSERT INTO profiles (wallet_address, recent_ip) 
             VALUES ($1, $2) 
             RETURNING *`,
            [walletAddress, clientIP]
          )
        } else {
          throw error
        }
      }
      
      const profileData = insertResult.rows[0]
      
      // If socials requested, fetch them too (will be empty for new profile)
      if (includeSocials) {
        return NextResponse.json({
          ...profileData,
          discord: { linked: false },
          twitter: { linked: false }
        })
      }
      
      return NextResponse.json(profileData)
    }
    
    const profileData = result.rows[0]
    
    // Update recent_ip if we have an IP address
    if (clientIP) {
      await pool.query(
        'UPDATE profiles SET recent_ip = $1, updated_at = NOW() WHERE wallet_address = $2',
        [clientIP, walletAddress]
      )
    }
    
    // If includeSocials is true, fetch Discord and Twitter data in parallel
    if (includeSocials) {
      const [discordResult, twitterResult] = await Promise.all([
        pool.query(`
          SELECT du.discord_user_id, du.verified_at, du.created_at
          FROM discord_users du
          INNER JOIN profiles p ON du.profile_id = p.id
          WHERE p.wallet_address = $1
          LIMIT 1
        `, [walletAddress]),
        pool.query(`
          SELECT tu.twitter_user_id, tu.twitter_username, tu.verified_at, tu.created_at
          FROM twitter_users tu
          INNER JOIN profiles p ON tu.profile_id = p.id
          WHERE p.wallet_address = $1
          LIMIT 1
        `, [walletAddress])
      ])
      
      const discord = discordResult.rows.length > 0 ? {
        linked: true,
        discordUserId: discordResult.rows[0].discord_user_id,
        discordUsername: discordResult.rows[0].discord_user_id, // Keep for compatibility
        verifiedAt: discordResult.rows[0].verified_at,
        createdAt: discordResult.rows[0].created_at
      } : { linked: false }
      
      const twitter = twitterResult.rows.length > 0 ? {
        linked: true,
        twitterUserId: twitterResult.rows[0].twitter_user_id,
        twitterUsername: twitterResult.rows[0].twitter_username,
        verifiedAt: twitterResult.rows[0].verified_at,
        createdAt: twitterResult.rows[0].created_at
      } : { linked: false }
      
      return NextResponse.json({
        ...profileData,
        discord,
        twitter
      })
    }
    
    return NextResponse.json(profileData)
  } catch (error) {
    console.error('Profile fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

  // Update profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, paymentAddress, username, avatarUrl } = body
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
    }
    
    const pool = getPool()

    await pool.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS ascension_powder INTEGER NOT NULL DEFAULT 0
    `)
    
    await pool.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS recent_ip TEXT
    `)
    
    // Get client IP
    const clientIP = getClientIP(request)
    
    // Check if payment_address column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='profiles' AND column_name='payment_address'
    `)
    
    // SECURITY: Do NOT allow ascension_powder to be updated via this endpoint
    // ascension_powder can only be modified through specific game mechanics
    let result
    if (columnCheck.rows.length > 0) {
      // Update with payment_address
      result = await pool.query(
        `UPDATE profiles 
         SET payment_address = COALESCE($1, payment_address),
             username = COALESCE($2, username), 
             avatar_url = COALESCE($3, avatar_url),
             recent_ip = COALESCE($4, recent_ip),
             updated_at = NOW()
         WHERE wallet_address = $5
         RETURNING *`,
        [paymentAddress || null, username || null, avatarUrl || null, clientIP, walletAddress]
      )
    } else {
      // Update without payment_address
      result = await pool.query(
        `UPDATE profiles 
         SET username = COALESCE($1, username), 
             avatar_url = COALESCE($2, avatar_url),
             recent_ip = COALESCE($3, recent_ip),
             updated_at = NOW()
         WHERE wallet_address = $4
         RETURNING *`,
        [username || null, avatarUrl || null, clientIP, walletAddress]
      )
    }
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

