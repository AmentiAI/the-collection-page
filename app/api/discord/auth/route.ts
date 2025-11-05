import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/discord/callback`

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')
    const state = walletAddress || 'no-wallet' // Use wallet address as state to link them

    if (!DISCORD_CLIENT_ID) {
      return NextResponse.json({ error: 'Discord OAuth not configured' }, { status: 500 })
    }

    // Ensure redirect URI is properly set (same logic as callback route)
    const redirectUri = DISCORD_REDIRECT_URI
    
    console.log('Discord OAuth authorization:', {
      hasClientId: !!DISCORD_CLIENT_ID,
      redirectUri,
      walletAddress: walletAddress || 'none'
    })

    // Discord OAuth URL
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?` +
      `client_id=${DISCORD_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=identify&` +
      `state=${encodeURIComponent(state)}`

    console.log('Redirecting to Discord OAuth:', discordAuthUrl.replace(DISCORD_CLIENT_SECRET || '', '***REDACTED***'))

    return NextResponse.redirect(discordAuthUrl)
  } catch (error) {
    console.error('Discord auth error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
