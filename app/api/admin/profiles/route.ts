import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Get list of profiles for admin use
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
    
    const pool = getPool()

    // Search by wallet address or username
    const result = await pool.query(
      `SELECT 
        p.id,
        p.wallet_address,
        p.username,
        p.avatar_url,
        p.total_good_karma,
        p.total_bad_karma,
        (COALESCE(p.total_good_karma, 0) - COALESCE(p.total_bad_karma, 0)) as net_karma,
        p.created_at
       FROM profiles p
       WHERE ($1 = '' OR 
              LOWER(p.wallet_address) LIKE LOWER($2) OR 
              LOWER(p.username) LIKE LOWER($2))
       ORDER BY 
         CASE WHEN p.username IS NOT NULL AND p.username != '' THEN 0 ELSE 1 END,
         p.username ASC NULLS LAST,
         p.created_at DESC
       LIMIT $3`,
      [search, `%${search}%`, limit]
    )

    return NextResponse.json({
      success: true,
      profiles: result.rows.map(row => ({
        id: row.id,
        walletAddress: row.wallet_address,
        username: row.username,
        avatarUrl: row.avatar_url,
        totalGoodKarma: Number(row.total_good_karma) || 0,
        totalBadKarma: Number(row.total_bad_karma) || 0,
        netKarma: Number(row.net_karma) || 0,
        createdAt: row.created_at
      }))
    })
  } catch (error) {
    console.error('Error fetching profiles:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

