import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let client
  try {
    client = await getPool().connect()

    // First, backfill trait in attack logs from battle_ordinals where missing
    const backfillResult = await client.query(`
      UPDATE mega_monster_attack_logs al
      SET trait = bo.trait
      FROM battle_ordinals bo
      WHERE al.army_id = bo.id
        AND al.trait IS NULL
        AND bo.trait IS NOT NULL
      RETURNING al.id
    `)
    console.log(`[Leaderboard] Backfilled ${backfillResult.rowCount} attack logs with traits from battle_ordinals`)

    // Recalculate leaderboard from actual attack logs to ensure accuracy
    // This ensures deaths and battles are counted correctly
    // Use COALESCE to get trait from attack logs or battle_ordinals (for older records)
    const updateQuery = `
      WITH battle_stats AS (
        SELECT 
          COALESCE(al.trait, bo.trait) as side,
          COUNT(*) as total_battles,
          COUNT(DISTINCT CASE WHEN al.life_force_after = 0 AND al.life_force_before > 0 THEN al.army_id END) as total_deaths
        FROM mega_monster_attack_logs al
        LEFT JOIN battle_ordinals bo ON al.army_id = bo.id
        WHERE COALESCE(al.trait, bo.trait) IS NOT NULL
          AND COALESCE(al.trait, bo.trait) IN ('Angelic', 'Demonic')
        GROUP BY COALESCE(al.trait, bo.trait)
      ),
      resurrection_stats AS (
        SELECT 
          trait as side,
          COUNT(*) as total_resurrections
        FROM battle_ordinals
        WHERE resurrection_time IS NOT NULL
          AND is_dead = false
          AND trait IN ('Angelic', 'Demonic')
        GROUP BY trait
      ),
      all_sides AS (
        SELECT 'Angelic' as side
        UNION ALL
        SELECT 'Demonic' as side
      )
      INSERT INTO angel_demon_leaderboard (side, total_battles, total_deaths, total_resurrections)
      SELECT 
        s.side,
        COALESCE(bs.total_battles, 0)::bigint as total_battles,
        COALESCE(bs.total_deaths, 0)::bigint as total_deaths,
        COALESCE(rs.total_resurrections, 0)::bigint as total_resurrections
      FROM all_sides s
      LEFT JOIN battle_stats bs ON s.side = bs.side
      LEFT JOIN resurrection_stats rs ON s.side = rs.side
      ON CONFLICT (side) 
      DO UPDATE SET 
        total_battles = EXCLUDED.total_battles,
        total_deaths = EXCLUDED.total_deaths,
        total_resurrections = EXCLUDED.total_resurrections,
        last_updated = NOW()
    `

    // Debug queries for Neon SQL editor (single-line for easy copy-paste)
    const debugQueries = {
      backfillTrait: "UPDATE mega_monster_attack_logs al SET trait = bo.trait FROM battle_ordinals bo WHERE al.army_id = bo.id AND al.trait IS NULL AND bo.trait IS NOT NULL;",
      totalLogs: "SELECT COUNT(*) as total, COUNT(CASE WHEN trait IS NOT NULL THEN 1 END) as with_trait, COUNT(CASE WHEN life_force_after = 0 THEN 1 END) as deaths, COUNT(CASE WHEN life_force_after = 0 AND life_force_before > 0 THEN 1 END) as actual_deaths FROM mega_monster_attack_logs;",
      traitDistribution: "SELECT COALESCE(al.trait, bo.trait) as side, COUNT(*) as count FROM mega_monster_attack_logs al LEFT JOIN battle_ordinals bo ON al.army_id = bo.id GROUP BY COALESCE(al.trait, bo.trait);",
      battleStats: "WITH battle_stats AS (SELECT COALESCE(al.trait, bo.trait) as side, COUNT(*) as total_battles, COUNT(DISTINCT CASE WHEN al.life_force_after = 0 AND al.life_force_before > 0 THEN al.army_id END) as total_deaths FROM mega_monster_attack_logs al LEFT JOIN battle_ordinals bo ON al.army_id = bo.id WHERE COALESCE(al.trait, bo.trait) IS NOT NULL AND COALESCE(al.trait, bo.trait) IN ('Angelic', 'Demonic') GROUP BY COALESCE(al.trait, bo.trait)) SELECT * FROM battle_stats;",
      sampleRecords: "SELECT al.id, al.trait as al_trait, bo.trait as bo_trait, COALESCE(al.trait, bo.trait) as side, al.life_force_before, al.life_force_after, al.army_id, bo.id as bo_id FROM mega_monster_attack_logs al LEFT JOIN battle_ordinals bo ON al.army_id = bo.id LIMIT 10;",
      updateQuery: updateQuery.replace(/\s+/g, ' ').trim()
    }

    // Debug: Check what we have in the logs
    const debugCheck = await client.query(debugQueries.totalLogs)
    console.log('[Leaderboard] Attack logs stats:', debugCheck.rows[0])

    // Check trait distribution
    const traitCheck = await client.query(debugQueries.traitDistribution)
    console.log('[Leaderboard] Trait distribution:', traitCheck.rows)

    // Check battle stats
    const battleStatsCheck = await client.query(debugQueries.battleStats)
    console.log('[Leaderboard] Battle stats:', battleStatsCheck.rows)

    await client.query(updateQuery)

    // Get leaderboard stats for both sides
    // Score is calculated as: total_battles - total_deaths
    const result = await client.query(`
      SELECT 
        side,
        total_battles,
        total_deaths,
        total_resurrections,
        score,
        last_updated
      FROM angel_demon_leaderboard
      ORDER BY score DESC, total_battles DESC
    `)

    return NextResponse.json({
      success: true,
      leaderboard: result.rows,
      debugQueries: debugQueries,
      debugResults: {
        totalLogs: debugCheck.rows[0],
        traitDistribution: traitCheck.rows,
        battleStats: battleStatsCheck.rows,
      }
    })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}
