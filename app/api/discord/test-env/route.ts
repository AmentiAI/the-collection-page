import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
    const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
    const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI
    const NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
    
    const computedRedirectUri = DISCORD_REDIRECT_URI || `${NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/discord/callback`
    
    return NextResponse.json({
      config: {
        hasClientId: !!DISCORD_CLIENT_ID,
        clientIdLength: DISCORD_CLIENT_ID?.length || 0,
        hasClientSecret: !!DISCORD_CLIENT_SECRET,
        clientSecretLength: DISCORD_CLIENT_SECRET?.length || 0,
        hasRedirectUriEnv: !!DISCORD_REDIRECT_URI,
        redirectUriFromEnv: DISCORD_REDIRECT_URI,
        nextPublicSiteUrl: NEXT_PUBLIC_SITE_URL,
        computedRedirectUri,
        expectedRedirectUri: 'https://www.thedamned.xyz/api/discord/callback',
        redirectUriMatches: computedRedirectUri === 'https://www.thedamned.xyz/api/discord/callback'
      },
      instructions: {
        step1: 'Ensure DISCORD_REDIRECT_URI=https://www.thedamned.xyz/api/discord/callback in your .env',
        step2: 'Ensure this EXACTLY matches what\'s in Discord Developer Portal > OAuth2 > Redirects',
        step3: 'No trailing slashes, exact protocol (https://), exact domain',
        step4: 'Restart your server after changing env variables'
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
