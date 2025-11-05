import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/discord/callback`

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
