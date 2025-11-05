import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// Trim whitespace from env variables to prevent issues
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID?.trim()
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET?.trim()
const TWITTER_REDIRECT_URI = (process.env.TWITTER_REDIRECT_URI?.trim() || `${process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'}/api/twitter/callback`)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')
    const state = walletAddress || 'no-wallet' // Use wallet address as state to link them

    if (!TWITTER_CLIENT_ID) {
      return NextResponse.json({ error: 'Twitter OAuth not configured' }, { status: 500 })
    }

    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')

    // Store code_verifier in a cookie (will be used in callback)
    const response = NextResponse.redirect(
      `https://twitter.com/i/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${TWITTER_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(TWITTER_REDIRECT_URI)}&` +
      `scope=tweet.read%20users.read&` +
      `state=${encodeURIComponent(state)}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256`
    )

    // Store code_verifier in httpOnly cookie (expires in 10 minutes)
    response.cookies.set('twitter_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/'
    })

    console.log('Twitter OAuth authorization:', {
      hasClientId: !!TWITTER_CLIENT_ID,
      redirectUri: TWITTER_REDIRECT_URI,
      walletAddress: walletAddress || 'none'
    })

    return response
  } catch (error) {
    console.error('Twitter auth error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

