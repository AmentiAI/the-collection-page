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
    } else if (action === 'executioner-add') {
      // Get Discord IDs with confirmed abyss burns (should receive executioner role)
      const result = await pool.query(`
        SELECT DISTINCT du.discord_user_id
        FROM discord_users du
        INNER JOIN profiles p ON du.profile_id = p.id
        INNER JOIN abyss_burns ab ON LOWER(ab.ordinal_wallet) = LOWER(p.wallet_address)
        WHERE ab.status = 'confirmed'
      `)

      const discordIds = result.rows.map((row) => row.discord_user_id)

      return NextResponse.json({
        success: true,
        action: 'executioner-add',
        discordIds,
        count: discordIds.length,
      })
    } else if (action === 'executioner-remove') {
      // Get Discord IDs without confirmed abyss burns (should have executioner role removed)
      const result = await pool.query(`
        SELECT DISTINCT du.discord_user_id
        FROM discord_users du
        INNER JOIN profiles p ON du.profile_id = p.id
        LEFT JOIN abyss_burns ab ON LOWER(ab.ordinal_wallet) = LOWER(p.wallet_address) AND ab.status = 'confirmed'
        WHERE ab.id IS NULL
      `)

      const discordIds = result.rows.map((row) => row.discord_user_id)

      return NextResponse.json({
        success: true,
        action: 'executioner-remove',
        discordIds,
        count: discordIds.length,
      })
    } else if (action === 'summoner-add') {
      // Get Discord IDs that have participated in an abyss summon (should have summoner role)
      const result = await pool.query(`
        SELECT DISTINCT du.discord_user_id
        FROM discord_users du
        INNER JOIN profiles p ON du.profile_id = p.id
        INNER JOIN abyss_summon_participants asp ON LOWER(asp.wallet) = LOWER(p.wallet_address)
      `)

      const discordIds = result.rows.map((row) => row.discord_user_id)

      return NextResponse.json({
        success: true,
        action: 'summoner-add',
        discordIds,
        count: discordIds.length,
      })
    } else if (action === 'summoner-remove') {
      // Get Discord IDs that have never participated in an abyss summon (should have summoner role removed)
      const result = await pool.query(`
        SELECT DISTINCT du.discord_user_id
        FROM discord_users du
        INNER JOIN profiles p ON du.profile_id = p.id
        LEFT JOIN abyss_summon_participants asp ON LOWER(asp.wallet) = LOWER(p.wallet_address)
        WHERE asp.id IS NULL
      `)

      const discordIds = result.rows.map((row) => row.discord_user_id)

      return NextResponse.json({
        success: true,
        action: 'summoner-remove',
        discordIds,
        count: discordIds.length,
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


