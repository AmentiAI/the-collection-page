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

    // Discord OAuth URL
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?` +
      `client_id=${DISCORD_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=identify&` +
      `state=${encodeURIComponent(state)}`

    return NextResponse.redirect(discordAuthUrl)
  } catch (error) {
    console.error('Discord auth error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
