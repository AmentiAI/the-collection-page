import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
    const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
    const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI
    const NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
    
    const computedRedirectUri = DISCORD_REDIRECT_URI || `${NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/discord/callback`
    
    // Check for whitespace issues
    const clientIdTrimmed = DISCORD_CLIENT_ID?.trim()
    const clientSecretTrimmed = DISCORD_CLIENT_SECRET?.trim()
    const hasClientIdWhitespace = DISCORD_CLIENT_ID !== clientIdTrimmed
    const hasClientSecretWhitespace = DISCORD_CLIENT_SECRET !== clientSecretTrimmed
    
    return NextResponse.json({
      config: {
        hasClientId: !!DISCORD_CLIENT_ID,
        clientIdLength: DISCORD_CLIENT_ID?.length || 0,
        clientIdFirstChars: DISCORD_CLIENT_ID?.substring(0, 3) || 'N/A',
        clientIdLastChars: DISCORD_CLIENT_ID?.substring(-3) || 'N/A',
        hasClientIdWhitespace,
        hasClientSecret: !!DISCORD_CLIENT_SECRET,
        clientSecretLength: DISCORD_CLIENT_SECRET?.length || 0,
        hasClientSecretWhitespace,
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
        step4: 'Restart your server after changing env variables',
        step5_important: 'If you see invalid_client error:',
        step5a: '1. Go to Discord Developer Portal > Your App > OAuth2',
        step5b: '2. Check your Client ID matches the one in .env',
        step5c: '3. If Client Secret was reset, copy the NEW secret',
        step5d: '4. Update DISCORD_CLIENT_SECRET in .env (no quotes, no spaces)',
        step5e: '5. Restart your server completely'
      },
      troubleshooting: {
        invalidClientError: 'This means Discord rejected your client_id or client_secret',
        commonCauses: [
          'Client secret was reset in Discord but .env not updated',
          'Extra spaces/quotes around env variable values',
          'Wrong client ID or secret copied',
          'Client ID/Secret from wrong Discord application'
        ]
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
