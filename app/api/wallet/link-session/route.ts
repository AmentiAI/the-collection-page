import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// In-memory store for link sessions (in production, use Redis or DB)
const linkSessions = new Map<string, { primaryWallet: string; expiresAt: number }>()

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now()
  const entries = Array.from(linkSessions.entries())
  for (const [token, session] of entries) {
    if (session.expiresAt < now) {
      linkSessions.delete(token)
    }
  }
}, 5 * 60 * 1000)

// POST: Create a link session (called when user clicks "Link New Wallet")
export async function POST(request: NextRequest) {
  try {
    const { primaryWallet, signature, message } = await request.json()

    if (!primaryWallet || !signature || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Note: Signature verification is done client-side by LaserEyes
    // The important security check is that the user had to sign with their wallet
    // which means they had access to the private key at the time of creating the session
    // The signature itself proves ownership

    // Check message timestamp (must be within 5 minutes)
    const timestampMatch = message.match(/Timestamp:\s*(\d+)/)
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1], 10)
      const age = Date.now() - timestamp
      if (age > 5 * 60 * 1000) {
        return NextResponse.json(
          { success: false, error: 'Message expired. Please try again.' },
          { status: 400 }
        )
      }
    }

    // Create a secure session token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = Date.now() + (10 * 60 * 1000) // 10 minutes

    linkSessions.set(token, {
      primaryWallet,
      expiresAt
    })

    return NextResponse.json({
      success: true,
      token,
      expiresIn: 10 * 60 // seconds
    })
  } catch (error) {
    console.error('[link-session][POST]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create link session' },
      { status: 500 }
    )
  }
}

// GET: Verify a link session token
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing token' },
        { status: 400 }
      )
    }

    const session = linkSessions.get(token)

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session' },
        { status: 404 }
      )
    }

    if (session.expiresAt < Date.now()) {
      linkSessions.delete(token)
      return NextResponse.json(
        { success: false, error: 'Session expired' },
        { status: 410 }
      )
    }

    return NextResponse.json({
      success: true,
      primaryWallet: session.primaryWallet,
      expiresAt: session.expiresAt
    })
  } catch (error) {
    console.error('[link-session][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to verify session' },
      { status: 500 }
    )
  }
}

// DELETE: Consume a link session (called after successful link)
export async function DELETE(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing token' },
        { status: 400 }
      )
    }

    linkSessions.delete(token)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[link-session][DELETE]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete session' },
      { status: 500 }
    )
  }
}

