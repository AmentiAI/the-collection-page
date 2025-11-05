import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// Trim whitespace from env variables to prevent issues
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID?.trim()
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET?.trim()
const TWITTER_REDIRECT_URI = (process.env.TWITTER_REDIRECT_URI?.trim() || `${process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'}/api/twitter/callback`)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') // This contains the wallet address
    const error = searchParams.get('error')

    if (error) {
      console.error('Twitter OAuth error:', error)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=error`)
    }

    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=no_code`)
    }

    if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
      console.error('Twitter OAuth not configured - missing CLIENT_ID or CLIENT_SECRET')
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=not_configured`)
    }

    // Get code_verifier from cookie
    const codeVerifier = request.cookies.get('twitter_code_verifier')?.value

    if (!codeVerifier) {
      console.error('Missing code_verifier cookie')
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=missing_verifier`)
    }

    // Ensure redirect URI is properly set
    const redirectUri = TWITTER_REDIRECT_URI
    
    console.log('Twitter OAuth token exchange:', {
      hasClientId: !!TWITTER_CLIENT_ID,
      hasClientSecret: !!TWITTER_CLIENT_SECRET,
      redirectUri,
      codeLength: code?.length || 0,
      state,
      hasCodeVerifier: !!codeVerifier
    })

    // Exchange code for access token
    const tokenBody = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })

    // Twitter OAuth 2.0 requires Basic Auth with client_id:client_secret
    const basicAuth = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64')

    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: tokenBody,
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Twitter token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        redirectUriUsed: redirectUri
      })
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=token_error&details=${encodeURIComponent(errorText.substring(0, 100))}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get Twitter user info
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=username', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error('Twitter user fetch failed:', {
        status: userResponse.status,
        statusText: userResponse.statusText,
        error: errorText
      })
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=user_error`)
    }

    const twitterUser = await userResponse.json()

    if (!twitterUser.data || !twitterUser.data.id) {
      console.error('Invalid Twitter user data:', twitterUser)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=invalid_user`)
    }

    // Link Twitter account to wallet address if provided
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

      // Link Twitter user to profile
      if (profileResult.rows.length > 0) {
        await pool.query(`
          INSERT INTO twitter_users (twitter_user_id, twitter_username, profile_id, verified_at, updated_at)
          VALUES ($1, $2, $3, NOW(), NOW())
          ON CONFLICT (twitter_user_id) 
          DO UPDATE SET 
            twitter_username = $2,
            profile_id = $3,
            verified_at = NOW(),
            updated_at = NOW()
        `, [twitterUser.data.id, twitterUser.data.username, profileResult.rows[0].id])
      }
    }

    // Clear the code_verifier cookie
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=success&twitter_id=${twitterUser.data.id}&twitter_username=${twitterUser.data.username}`
    )
    response.cookies.delete('twitter_code_verifier')

    return response
  } catch (error) {
    console.error('Twitter callback error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard?twitter_auth=error`)
  }
}

