import { NextRequest, NextResponse } from 'next/server'

import { getPool } from '@/lib/db'
import { getCachedQuery, CACHE_TTLS } from '@/lib/db-cache'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const pool = getPool()

    // Use cached query - burn window changes infrequently but is polled often
    const result = await getCachedQuery(
      'abyss-burn-window',
      async () => {
        // Check if there's an active burn window (not expired and active)
        const windowRes = await pool.query(
          `
            SELECT 
              id,
              circle_id,
              granted_at,
              expires_at,
              active,
              credits_only
            FROM damned_pool_burn_windows
            WHERE active = TRUE
              AND expires_at > NOW()
            ORDER BY granted_at DESC
            LIMIT 1
          `,
        )

        if (windowRes.rows.length === 0) {
          return {
            success: true,
            active: false,
            expiresAt: null,
            remainingMs: 0,
            creditsOnly: false,
          }
        }

        const window = windowRes.rows[0]
        const expiresAt = new Date(window.expires_at)
        const now = new Date()
        const remainingMs = expiresAt.getTime() - now.getTime()

        return {
          success: true,
          active: remainingMs > 0,
          expiresAt: window.expires_at,
          remainingMs: Math.max(0, remainingMs),
          creditsOnly: Boolean(window.credits_only),
        }
      },
      CACHE_TTLS.BURN_WINDOW
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[abyss/burn-window][GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to check burn window.' }, { status: 500 })
  }
}

