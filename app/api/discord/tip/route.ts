import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Safe tip transfer endpoint for Discord bot
 * Transfers ascension_powder from one user to another via Discord IDs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { senderDiscordId, recipientDiscordId, amount } = body

    console.log('[discord/tip][POST] Request received:', { senderDiscordId, recipientDiscordId, amount })

    if (!senderDiscordId || !recipientDiscordId || !amount) {
      console.log('[discord/tip][POST] Missing required fields')
      return NextResponse.json(
        { success: false, error: 'Missing required fields: senderDiscordId, recipientDiscordId, amount' },
        { status: 400 }
      )
    }

    const tipAmount = Number.parseInt(String(amount), 10)
    if (!Number.isFinite(tipAmount) || tipAmount <= 0) {
      console.log('[discord/tip][POST] Invalid amount:', amount)
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive integer' },
        { status: 400 }
      )
    }

    if (senderDiscordId === recipientDiscordId) {
      console.log('[discord/tip][POST] User tried to tip themselves')
      return NextResponse.json(
        { success: false, error: 'Cannot tip yourself' },
        { status: 400 }
      )
    }

    const pool = getPool()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      console.log('[discord/tip][POST] Transaction started')

      // Get sender's profile via Discord ID
      console.log('[discord/tip][POST] Looking up sender profile for Discord ID:', senderDiscordId)
      const senderProfileRes = await client.query(
        `SELECT p.wallet_address, p.ascension_powder
         FROM profiles p
         INNER JOIN discord_users du ON du.profile_id = p.id
         WHERE du.discord_user_id = $1
         LIMIT 1`,
        [senderDiscordId]
      )

      console.log('[discord/tip][POST] Sender profile query result:', senderProfileRes.rows.length, 'rows')

      if (!senderProfileRes.rows[0]) {
        await client.query('ROLLBACK')
        console.log('[discord/tip][POST] Sender not found in database')
        return NextResponse.json(
          { success: false, error: 'Sender not found. Please link your Discord account to your wallet first.' },
          { status: 404 }
        )
      }

      const senderWallet = senderProfileRes.rows[0].wallet_address
      const senderPowder = Number(senderProfileRes.rows[0].ascension_powder ?? 0)
      console.log('[discord/tip][POST] Sender found:', { wallet: senderWallet, powder: senderPowder })

      if (senderPowder < tipAmount) {
        await client.query('ROLLBACK')
        console.log('[discord/tip][POST] Insufficient powder:', { senderPowder, tipAmount })
        return NextResponse.json(
          { 
            success: false, 
            error: `Insufficient ascension powder. You have ${senderPowder}, but need ${tipAmount}.` 
          },
          { status: 400 }
        )
      }

      // Get recipient's profile via Discord ID
      console.log('[discord/tip][POST] Looking up recipient profile for Discord ID:', recipientDiscordId)
      const recipientProfileRes = await client.query(
        `SELECT p.wallet_address, p.ascension_powder
         FROM profiles p
         INNER JOIN discord_users du ON du.profile_id = p.id
         WHERE du.discord_user_id = $1
         LIMIT 1`,
        [recipientDiscordId]
      )

      console.log('[discord/tip][POST] Recipient profile query result:', recipientProfileRes.rows.length, 'rows')

      if (!recipientProfileRes.rows[0]) {
        await client.query('ROLLBACK')
        console.log('[discord/tip][POST] Recipient not found in database')
        return NextResponse.json(
          { success: false, error: 'Recipient not found. They need to link their Discord account to their wallet first.' },
          { status: 404 }
        )
      }

      const recipientWallet = recipientProfileRes.rows[0].wallet_address
      const recipientPowderBefore = Number(recipientProfileRes.rows[0].ascension_powder ?? 0)
      console.log('[discord/tip][POST] Recipient found:', { wallet: recipientWallet, powder: recipientPowderBefore })

      // Deduct from sender
      console.log('[discord/tip][POST] Deducting', tipAmount, 'from sender')
      const senderUpdateRes = await client.query(
        `UPDATE profiles 
         SET ascension_powder = GREATEST(0, ascension_powder - $1), 
             updated_at = NOW()
         WHERE LOWER(wallet_address) = LOWER($2)
         RETURNING ascension_powder`,
        [tipAmount, senderWallet]
      )
      console.log('[discord/tip][POST] Sender updated, new balance:', senderUpdateRes.rows[0]?.ascension_powder)

      // Add to recipient
      console.log('[discord/tip][POST] Adding', tipAmount, 'to recipient')
      const recipientUpdateRes = await client.query(
        `UPDATE profiles 
         SET ascension_powder = COALESCE(ascension_powder, 0) + $1, 
             updated_at = NOW()
         WHERE LOWER(wallet_address) = LOWER($2)
         RETURNING ascension_powder`,
        [tipAmount, recipientWallet]
      )
      console.log('[discord/tip][POST] Recipient updated, new balance:', recipientUpdateRes.rows[0]?.ascension_powder)

      await client.query('COMMIT')
      console.log('[discord/tip][POST] Transaction committed successfully')

      const recipientPowderAfter = recipientPowderBefore + tipAmount
      const senderPowderAfter = senderPowder - tipAmount

      return NextResponse.json({
        success: true,
        amount: tipAmount,
        sender: {
          wallet: senderWallet,
          powderBefore: senderPowder,
          powderAfter: senderPowderAfter,
        },
        recipient: {
          wallet: recipientWallet,
          powderBefore: recipientPowderBefore,
          powderAfter: recipientPowderAfter,
        },
      })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('[discord/tip][POST] Transaction error, rolling back:', error)
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[discord/tip][POST] Error:', error)
    console.error('[discord/tip][POST] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to process tip transfer.' 
      },
      { status: 500 }
    )
  }
}

