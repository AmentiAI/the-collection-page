import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULT_EVENT_KEY = 'treasure_chest_initial'
const DEFAULT_GRANT_AMOUNT = 20

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const walletAddressRaw = (body?.walletAddress ?? '').toString().trim()
    const eventKey = (body?.eventKey ?? DEFAULT_EVENT_KEY).toString().trim() || DEFAULT_EVENT_KEY
    const amountRaw = Number(body?.amount ?? DEFAULT_GRANT_AMOUNT)
    const grantAmount = Number.isFinite(amountRaw) && amountRaw > 0 ? Math.floor(amountRaw) : DEFAULT_GRANT_AMOUNT

    if (!walletAddressRaw) {
      return NextResponse.json({ success: false, error: 'walletAddress is required.' }, { status: 400 })
    }

    const pool = getPool()

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ascension_powder_events (
        wallet_address TEXT NOT NULL,
        event_key TEXT NOT NULL,
        granted_amount INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (wallet_address, event_key)
      )
    `)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Check if wallet has any burns in abyss_burns table
      const burnsCheck = await client.query(
        `
          SELECT COUNT(*)::int AS burn_count
          FROM abyss_burns
          WHERE LOWER(ordinal_wallet) = LOWER($1)
          LIMIT 1
        `,
        [walletAddressRaw],
      )

      const burnCount = Number(burnsCheck.rows[0]?.burn_count ?? 0)
      if (burnCount === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: 'You must have sacrificed at least one ordinal to the abyss before claiming ascension powder.',
            requiresBurns: true,
          },
          { status: 403 },
        )
      }

      await client.query(
        `
          INSERT INTO profiles (wallet_address, ascension_powder)
          VALUES ($1, 0)
          ON CONFLICT (wallet_address) DO NOTHING
        `,
        [walletAddressRaw],
      )

      const claimInsert = await client.query(
        `
          INSERT INTO ascension_powder_events (wallet_address, event_key, granted_amount)
          VALUES ($1, $2, $3)
          ON CONFLICT (wallet_address, event_key) DO NOTHING
          RETURNING granted_amount
        `,
        [walletAddressRaw, eventKey, grantAmount],
      )

      let granted = false
      let profilePowder = 0

      const insertedRows = claimInsert?.rowCount ?? 0

      if (insertedRows > 0) {
        const updateRes = await client.query(
          `
            UPDATE profiles
            SET ascension_powder = COALESCE(ascension_powder, 0) + $1
            WHERE LOWER(wallet_address) = LOWER($2)
            RETURNING ascension_powder
          `,
          [grantAmount, walletAddressRaw],
        )

        profilePowder = Number(updateRes.rows[0]?.ascension_powder ?? grantAmount)
        granted = true
      } else {
        const profileRes = await client.query(
          `
            SELECT ascension_powder FROM profiles WHERE LOWER(wallet_address) = LOWER($1) LIMIT 1
          `,
          [walletAddressRaw],
        )
        profilePowder = Number(profileRes.rows[0]?.ascension_powder ?? 0)
      }

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        granted,
        amount: granted ? grantAmount : 0,
        alreadyClaimed: !granted,
        profilePowder,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[ascension/grant][POST]', error)
    return NextResponse.json({ success: false, error: 'Failed to grant ascension powder.' }, { status: 500 })
  }
}
