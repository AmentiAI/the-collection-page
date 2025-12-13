import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let client
  try {
    client = await getPool().connect()

    // Aggregate all stats per wallet using subqueries to avoid cartesian products
    const result = await client.query(`
      WITH base_wallets AS (
        SELECT DISTINCT wallet_address
        FROM (
          SELECT DISTINCT LOWER(wallet_address) as wallet_address FROM battle_ordinals WHERE wallet_address IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(wallet_address) as wallet_address FROM mega_monster_attack_logs WHERE wallet_address IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(wallet_address) as wallet_address FROM heal_history WHERE wallet_address IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(wallet_address) as wallet_address FROM crystallization_records WHERE wallet_address IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(creator_wallet) as wallet_address FROM summoning_powder_circles WHERE creator_wallet IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(wallet) as wallet_address FROM summoning_powder_participants WHERE wallet IS NOT NULL
        ) all_wallets
      ),
      wallet_stats AS (
        SELECT 
          bw.wallet_address,
          COALESCE(p.username, '') as discord_username,
          COALESCE(p.avatar_url, '') as discord_avatar_url,
          -- Army counts
          COALESCE((
            SELECT COUNT(*)::int
            FROM battle_ordinals bo
            WHERE LOWER(bo.wallet_address) = bw.wallet_address
              AND bo.life_force > 0
              AND bo.is_dead = false
          ), 0) as army_count,
          COALESCE((
            SELECT COUNT(*)::int
            FROM battle_ordinals bo
            WHERE LOWER(bo.wallet_address) = bw.wallet_address
              AND bo.trait = 'Angelic'
          ), 0) as angel_count,
          COALESCE((
            SELECT COUNT(*)::int
            FROM battle_ordinals bo
            WHERE LOWER(bo.wallet_address) = bw.wallet_address
              AND bo.trait = 'Demonic'
          ), 0) as demon_count,
          -- Battle count (distinct attacks per wallet)
          COALESCE((
            SELECT COUNT(DISTINCT al.id)::int
            FROM mega_monster_attack_logs al
            WHERE LOWER(al.wallet_address) = bw.wallet_address
          ), 0) as battles_count,
          -- Heal count (sum of healed_count from heal_history)
          COALESCE((
            SELECT SUM(hh.healed_count)::int
            FROM heal_history hh
            WHERE LOWER(hh.wallet_address) = bw.wallet_address
          ), 0) as heals_count,
          -- Crystallization count (distinct inscriptions)
          COALESCE((
            SELECT COUNT(DISTINCT cr.inscription_id)::int
            FROM crystallization_records cr
            WHERE LOWER(cr.wallet_address) = bw.wallet_address
          ), 0) as crystallization_count,
          -- Ascension circles: created + participated (distinct)
          COALESCE((
            SELECT COUNT(DISTINCT ac.id)::int
            FROM summoning_powder_circles ac
            WHERE LOWER(ac.creator_wallet) = bw.wallet_address
          ), 0) + COALESCE((
            SELECT COUNT(DISTINCT acp.circle_id)::int
            FROM summoning_powder_participants acp
            WHERE LOWER(acp.wallet) = bw.wallet_address
          ), 0) as ascension_circle_count,
          -- Resurrections
          COALESCE((
            SELECT COUNT(*)::int
            FROM battle_ordinals bo
            WHERE LOWER(bo.wallet_address) = bw.wallet_address
              AND bo.resurrection_time IS NOT NULL
          ), 0) as resurrections_count
        FROM base_wallets bw
        LEFT JOIN profiles p ON LOWER(p.wallet_address) = bw.wallet_address
        LEFT JOIN discord_users du ON du.profile_id = p.id
      )
      SELECT 
        wallet_address,
        discord_username,
        discord_avatar_url,
        army_count,
        angel_count,
        demon_count,
        battles_count,
        heals_count,
        crystallization_count,
        ascension_circle_count,
        resurrections_count,
        -- Calculate total score with resurrection penalty and curve for small armies
        -- Formula: (activities - resurrections*3) / (army_count^0.4)
        -- This rewards efficiency and penalizes deaths, helping smaller armies compete
        -- Ascension circles are worth 0.25 points each
        CASE 
          WHEN army_count > 0 THEN
            (
              (battles_count + heals_count + crystallization_count + (ascension_circle_count * 0.25) - resurrections_count * 3)::numeric
              / POWER(GREATEST(army_count, 1)::numeric, 0.4)
            )::numeric(10, 2)
          ELSE 0
        END as total_score
      FROM wallet_stats
      WHERE army_count > 0 OR battles_count > 0 OR heals_count > 0 OR crystallization_count > 0 OR ascension_circle_count > 0 OR resurrections_count > 0
      ORDER BY 
        total_score DESC,
        wallet_address ASC
    `)

    // Convert numeric fields to numbers (PostgreSQL numeric types come as strings)
    const leaderboard = result.rows.map((row: any) => ({
      ...row,
      army_count: Number(row.army_count) || 0,
      angel_count: Number(row.angel_count) || 0,
      demon_count: Number(row.demon_count) || 0,
      battles_count: Number(row.battles_count) || 0,
      heals_count: Number(row.heals_count) || 0,
      crystallization_count: Number(row.crystallization_count) || 0,
      ascension_circle_count: Number(row.ascension_circle_count) || 0,
      resurrections_count: Number(row.resurrections_count) || 0,
      total_score: Number(row.total_score) || 0,
    }))

    return NextResponse.json({
      success: true,
      leaderboard,
    })
  } catch (error) {
    console.error('Error fetching redemption leaderboard:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

