import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Trim whitespace from env variables to prevent issues
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim()
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET?.trim()
const DISCORD_REDIRECT_URI = (process.env.DISCORD_REDIRECT_URI?.trim() || `${process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'}/api/discord/callback`)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') // This contains the wallet address
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?discord_auth=error`)
    }

    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?discord_auth=no_code`)
    }

    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      console.error('Discord OAuth not configured - missing CLIENT_ID or CLIENT_SECRET')
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?discord_auth=not_configured`)
    }

    // Ensure redirect URI is properly set
    const redirectUri = DISCORD_REDIRECT_URI
    
    console.log('Discord OAuth token exchange:', {
      hasClientId: !!DISCORD_CLIENT_ID,
      hasClientSecret: !!DISCORD_CLIENT_SECRET,
      redirectUri,
      codeLength: code?.length || 0,
      state
    })

    // Exchange code for access token
    const tokenBody = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
    })

    console.log('Token exchange body (sanitized):', {
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET ? '***REDACTED***' : 'MISSING',
      grant_type: 'authorization_code',
      code: code ? '***PRESENT***' : 'MISSING',
      redirect_uri: redirectUri
    })

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenBody,
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Discord token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        redirectUriUsed: redirectUri
      })
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?discord_auth=token_error&details=${encodeURIComponent(errorText.substring(0, 100))}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get Discord user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      console.error('Discord user fetch failed:', await userResponse.text())
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?discord_auth=user_error`)
    }

    const discordUser = await userResponse.json()

    console.log('Discord user data received:', {
      id: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar ? 'present' : 'null'
    })

    // Link Discord account to wallet address if provided
    if (state && state !== 'no-wallet') {
      const walletAddress = state
      const pool = getPool()

      // Ensure profile exists
      let profileResult = await pool.query(
        'SELECT id FROM profiles WHERE wallet_address = $1',
        [walletAddress]
      )

      if (profileResult.rows.length === 0) {
        // Create profile if it doesn't exist
        await pool.query(
          'INSERT INTO profiles (wallet_address, payment_address) VALUES ($1, $1)',
          [walletAddress]
        )
        // Re-fetch the profile
        profileResult = await pool.query(
          'SELECT id FROM profiles WHERE wallet_address = $1',
          [walletAddress]
        )
      }

      // Construct Discord avatar URL
      let avatarUrl: string | null = null
      if (discordUser.avatar) {
        // User has a custom avatar
        avatarUrl = `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
      } else {
        // User has default avatar
        // For legacy accounts: use discriminator % 5
        // For new accounts: use user id % 5
        let defaultAvatarIndex = 0
        if (discordUser.discriminator && discordUser.discriminator !== '0') {
          // Legacy account with discriminator
          defaultAvatarIndex = parseInt(discordUser.discriminator) % 5
        } else {
          // New account without discriminator - use last digit of user id
          defaultAvatarIndex = parseInt(discordUser.id.slice(-1)) % 5
        }
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`
      }

      // Extract username (Discord uses username field, or username + discriminator for legacy users)
      const username = discordUser.username || null

      // Update profile with avatar URL and username
      if (profileResult.rows.length > 0) {
        await pool.query(`
          UPDATE profiles 
          SET avatar_url = COALESCE($1, avatar_url),
              username = COALESCE($2, username),
              updated_at = NOW()
          WHERE id = $3
        `, [avatarUrl, username, profileResult.rows[0].id])
      }

      // Link Discord user to profile
      if (profileResult.rows.length > 0) {
        await pool.query(`
          INSERT INTO discord_users (discord_user_id, profile_id, verified_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
          ON CONFLICT (discord_user_id) 
          DO UPDATE SET 
            profile_id = $2,
            verified_at = NOW(),
            updated_at = NOW()
        `, [discordUser.id, profileResult.rows[0].id])
      }
    }

    // Redirect back to dashboard with success
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?discord_auth=success&discord_id=${discordUser.id}`)
  } catch (error) {
    console.error('Discord callback error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?discord_auth=error`)
  }
}
