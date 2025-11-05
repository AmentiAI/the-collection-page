import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Get Discord user IDs for role management
// Query params:
// - action: 'remove' (users with 0 ordinals) or 'add' (users with > 0 ordinals)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'remove' // 'remove' or 'add'
    
    const pool = getPool()
    
    if (action === 'remove') {
      // Get Discord IDs with 0 ordinals (should have role removed)
      const result = await pool.query(`
        SELECT DISTINCT du.discord_user_id
        FROM discord_users du
        INNER JOIN profiles p ON du.profile_id = p.id
        WHERE p.current_ordinal_count = 0 
          OR p.current_ordinal_count IS NULL
      `)
      
      const discordIds = result.rows.map(row => row.discord_user_id)
      
      return NextResponse.json({
        success: true,
        action: 'remove',
        discordIds,
        count: discordIds.length
      })
    } else if (action === 'add') {
      // Get Discord IDs with > 0 ordinals (should have role added)
      const result = await pool.query(`
        SELECT DISTINCT du.discord_user_id
        FROM discord_users du
        INNER JOIN profiles p ON du.profile_id = p.id
        WHERE p.current_ordinal_count > 0
      `)
      
      const discordIds = result.rows.map(row => row.discord_user_id)
      
      return NextResponse.json({
        success: true,
        action: 'add',
        discordIds,
        count: discordIds.length
      })
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "remove" or "add"' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Discord roles list error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


