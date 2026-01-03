import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 600 // Cache for 10 minutes (600 seconds)

// In-memory cache for leaderboard results
let leaderboardCache: {
  data: any
  timestamp: number
} | null = null
const CACHE_DURATION = 600000 // 10 minutes in milliseconds

export async function GET(request: NextRequest) {
  // Check cache first
  const now = Date.now()
  if (leaderboardCache && (now - leaderboardCache.timestamp) < CACHE_DURATION) {
    return NextResponse.json({
      success: true,
      leaderboard: leaderboardCache.data,
      cached: true,
    })
  }

  let client
  try {
    client = await getPool().connect()

    // Ensure linked_wallets table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS linked_wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        primary_wallet TEXT NOT NULL,
        linked_wallet TEXT NOT NULL,
        signature TEXT NOT NULL,
        message TEXT NOT NULL,
        linked_at TIMESTAMPTZ DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE,
        CONSTRAINT unique_link UNIQUE(primary_wallet, linked_wallet)
      )
    `)

    // Ensure score config table exists and get config values
    await client.query(`
      CREATE TABLE IF NOT EXISTS redemption_score_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_key TEXT UNIQUE NOT NULL,
        category_label TEXT NOT NULL,
        action_label TEXT NOT NULL,
        points_value NUMERIC(10, 2) NOT NULL,
        description TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Get score config values
    const configResult = await client.query(`
      SELECT category_key, points_value
      FROM redemption_score_config
      WHERE is_active = TRUE
    `)

    const configMap: Record<string, number> = {}
    configResult.rows.forEach((row: any) => {
      configMap[row.category_key] = Number(row.points_value)
    })

    // Get efficiency exponent (default to 0.25 if not set)
    const exponentResult = await client.query(`
      SELECT points_value
      FROM redemption_score_config
      WHERE category_key = 'efficiency_exponent'
      LIMIT 1
    `)
    const efficiencyExponent = exponentResult.rows.length > 0 
      ? Number(exponentResult.rows[0].points_value) 
      : 0.25

    // Default values if config doesn't exist yet
    const battlesPoints = configMap['battles'] ?? 1.0
    const healsPoints = configMap['heals'] ?? 0.5
    const crystallizationPoints = configMap['crystallizations'] ?? 1.0
    const ascensionCirclesPoints = configMap['ascension_circles'] ?? 0.5
    const killingBlowsPoints = configMap['killing_blows'] ?? 50.0
    const burnsPoints = configMap['burns'] ?? 1.0
    const resurrectionsPoints = configMap['resurrections'] ?? -10.0

    // Ensure max_army_count column exists in profiles table
    await client.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS max_army_count INTEGER DEFAULT 0
    `)

    // Aggregate all stats per wallet using subqueries to avoid cartesian products
    // Also aggregate linked wallets into their primary wallet
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
          SELECT DISTINCT LOWER(wallet_address) as wallet_address FROM crystallization_daily_history WHERE wallet_address IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(creator_wallet) as wallet_address FROM summoning_powder_circles WHERE creator_wallet IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(wallet) as wallet_address FROM summoning_powder_participants WHERE wallet IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(ordinal_wallet) as wallet_address FROM abyss_burns WHERE ordinal_wallet IS NOT NULL AND inscription_id IS NOT NULL AND NOT (inscription_id LIKE 'ascended_%')
          UNION
          SELECT DISTINCT LOWER(payment_wallet) as wallet_address FROM abyss_burns WHERE payment_wallet IS NOT NULL AND inscription_id IS NOT NULL AND NOT (inscription_id LIKE 'ascended_%')
          UNION
          SELECT DISTINCT LOWER(wallet_address) as wallet_address FROM ascended_images_mint_queue WHERE wallet_address IS NOT NULL
          UNION
          SELECT DISTINCT LOWER(wallet_address) as wallet_address FROM resurrection_history WHERE wallet_address IS NOT NULL
        ) all_wallets
      ),
      -- Map each wallet to its primary wallet (or itself if primary)
      wallet_to_primary AS (
        SELECT DISTINCT
          bw.wallet_address,
          COALESCE(
            (SELECT primary_wallet FROM linked_wallets WHERE LOWER(linked_wallet) = bw.wallet_address AND is_active = TRUE LIMIT 1),
            bw.wallet_address
          ) as primary_wallet
        FROM base_wallets bw
      ),
      -- Get all wallets (primary + linked) for each primary wallet, lowercased
      primary_wallet_groups AS (
        SELECT 
          wtp.primary_wallet,
          ARRAY_AGG(DISTINCT LOWER(wtp.wallet_address)) as all_wallets_lower
        FROM wallet_to_primary wtp
        GROUP BY wtp.primary_wallet
      ),
      wallet_stats AS (
        SELECT 
          pwg.primary_wallet as wallet_address,
          -- Get profile info from primary wallet
          COALESCE((SELECT username FROM profiles WHERE LOWER(wallet_address) = LOWER(pwg.primary_wallet)), '') as discord_username,
          COALESCE((SELECT avatar_url FROM profiles WHERE LOWER(wallet_address) = LOWER(pwg.primary_wallet)), '') as discord_avatar_url,
          COALESCE((SELECT recent_ip FROM profiles WHERE LOWER(wallet_address) = LOWER(pwg.primary_wallet)), '') as recent_ip,
          -- Army counts (aggregated across all linked wallets)
          -- Count all armies regardless of health/death status for consistency
          COALESCE((
            SELECT COUNT(*)::int
            FROM battle_ordinals bo
            WHERE LOWER(bo.wallet_address) = ANY(pwg.all_wallets_lower)
          ), 0) as army_count,
          -- Max army count (track peak army size to prevent score manipulation)
          COALESCE((
            SELECT GREATEST(
              COALESCE((SELECT max_army_count FROM profiles WHERE LOWER(wallet_address) = LOWER(pwg.primary_wallet)), 0),
              (
                SELECT COUNT(*)::int
                FROM battle_ordinals bo
                WHERE LOWER(bo.wallet_address) = ANY(pwg.all_wallets_lower)
              )
            )
          ), 0) as max_army_count,
          -- Count only armies ready for battle (not in sanctuary, not dead)
          COALESCE((
            SELECT COUNT(*)::int
            FROM battle_ordinals bo
            WHERE LOWER(bo.wallet_address) = ANY(pwg.all_wallets_lower)
              AND bo.trait = 'Angelic'
              AND bo.status = 'ready'
              AND bo.is_dead = false
          ), 0) as angel_count,
          COALESCE((
            SELECT COUNT(*)::int
            FROM battle_ordinals bo
            WHERE LOWER(bo.wallet_address) = ANY(pwg.all_wallets_lower)
              AND bo.trait = 'Demonic'
              AND bo.status = 'ready'
              AND bo.is_dead = false
          ), 0) as demon_count,
          -- Battle count (distinct attacks per wallet group)
          COALESCE((
            SELECT COUNT(DISTINCT al.id)::int
            FROM mega_monster_attack_logs al
            WHERE LOWER(al.wallet_address) = ANY(pwg.all_wallets_lower)
          ), 0) as battles_count,
          -- Heal count (sum of healed_count from heal_history)
          COALESCE((
            SELECT SUM(hh.healed_count)::int
            FROM heal_history hh
            WHERE LOWER(hh.wallet_address) = ANY(pwg.all_wallets_lower)
          ), 0) as heals_count,
          -- Crystallization count (sum of all claimed powder from daily history)
          COALESCE((
            SELECT SUM(cdh.total_ascension_powder)::int
            FROM crystallization_daily_history cdh
            WHERE LOWER(cdh.wallet_address) = ANY(pwg.all_wallets_lower)
              AND cdh.total_ascension_powder > 0
          ), 0) as crystallization_count,
          -- Ascension circles: created + participated (distinct)
          COALESCE((
            SELECT COUNT(DISTINCT ac.id)::int
            FROM summoning_powder_circles ac
            WHERE LOWER(ac.creator_wallet) = ANY(pwg.all_wallets_lower)
          ), 0) + COALESCE((
            SELECT COUNT(DISTINCT acp.circle_id)::int
            FROM summoning_powder_participants acp
            WHERE LOWER(acp.wallet) = ANY(pwg.all_wallets_lower)
          ), 0) as ascension_circle_count,
          -- Resurrections (count from resurrection_history table)
          COALESCE((
            SELECT COUNT(*)::int
            FROM resurrection_history rh
            WHERE LOWER(rh.wallet_address) = ANY(pwg.all_wallets_lower)
          ), 0) as resurrections_count,
          -- Killing blows: count monsters killed by inscriptions owned by this wallet group
          COALESCE((
            SELECT COUNT(*)::int
            FROM mega_monsters mm
            WHERE mm.killed_by IS NOT NULL
              AND mm.killed_by IN (
                SELECT bo.inscription_id
                FROM battle_ordinals bo
                WHERE LOWER(bo.wallet_address) = ANY(pwg.all_wallets_lower)
                  AND bo.inscription_id IS NOT NULL
              )
          ), 0) as killing_blows_count,
          -- Abyss burns: count burns where inscription_id doesn't start with "ascended_"
          COALESCE((
            SELECT COUNT(*)::int
            FROM abyss_burns ab
            WHERE (LOWER(ab.ordinal_wallet) = ANY(pwg.all_wallets_lower)
              OR LOWER(ab.payment_wallet) = ANY(pwg.all_wallets_lower))
              AND ab.inscription_id IS NOT NULL
              AND NOT (ab.inscription_id LIKE 'ascended_%')
          ), 0) as abyss_burns_count,
          -- Mints: count entries in ascended_images_mint_queue (tree of ascension mints)
          COALESCE((
            SELECT COUNT(*)::int
            FROM ascended_images_mint_queue mq
            WHERE LOWER(mq.wallet_address) = ANY(pwg.all_wallets_lower)
          ), 0) as mints_count
        FROM primary_wallet_groups pwg
      )
      SELECT 
        wallet_address,
        discord_username,
        discord_avatar_url,
        recent_ip,
        army_count,
        max_army_count,
        angel_count,
        demon_count,
        battles_count,
        heals_count,
        -- Calculate heal/battle ratio (heals / battles, or 0 if no battles)
        CASE 
          WHEN battles_count > 0 THEN (heals_count::numeric / battles_count::numeric)
          ELSE 0::numeric
        END as heal_battle_ratio,
        crystallization_count,
        ascension_circle_count,
        resurrections_count,
        killing_blows_count,
        abyss_burns_count,
        mints_count,
        -- Calculate balanced army bonus separately for display
        CASE 
          WHEN (angel_count > 0 AND demon_count = 0) OR 
               (demon_count > 0 AND angel_count = 0) OR 
               (angel_count > 0 AND demon_count > 0 AND angel_count = demon_count)
          THEN 10::numeric
          ELSE 0::numeric
        END as balanced_army_bonus,
        -- Calculate total score using configurable point values
        -- Formula uses stored point values from redemption_score_config table
        -- Killing blows and balanced army bonus are applied AFTER the division (not affected by army count penalty)
        -- Balanced army: all angels, all demons, or equal amounts of both (only counts armies with status='ready', not in sanctuary)
        -- Uses max_army_count (peak army size) instead of current army_count to prevent manipulation
        CASE 
          WHEN max_army_count > 0 THEN
            (
            (
              (battles_count * $1::numeric + 
               heals_count * $2::numeric + 
               crystallization_count * $3::numeric + 
               ascension_circle_count * $4::numeric + 
               abyss_burns_count * $6::numeric + 
               resurrections_count * $7::numeric)::numeric
                / POWER(GREATEST(max_army_count, 1)::numeric, $8::numeric)
              )::numeric(10, 2)
              + (killing_blows_count * $5::numeric)
              + CASE 
                  WHEN (angel_count > 0 AND demon_count = 0) OR 
                       (demon_count > 0 AND angel_count = 0) OR 
                       (angel_count > 0 AND demon_count > 0 AND angel_count = demon_count)
                  THEN 10::numeric
                  ELSE 0::numeric
                END
              + CASE 
                  WHEN max_army_count < 5 THEN 5::numeric
                  ELSE 0::numeric
                END
              + CASE 
                  WHEN crystallization_count = 0 THEN -25::numeric
                  ELSE 0::numeric
                END
              + CASE 
                  WHEN battles_count > 0 AND (heals_count::numeric / battles_count::numeric) < 0.075 THEN -30::numeric
                  ELSE 0::numeric
                END
            )::numeric(10, 2)
          ELSE 0
        END as total_score
      FROM wallet_stats
      WHERE army_count > 0 OR battles_count > 0 OR heals_count > 0 OR crystallization_count > 0 OR ascension_circle_count > 0 OR resurrections_count > 0 OR killing_blows_count > 0 OR abyss_burns_count > 0 OR mints_count > 0
      ORDER BY 
        total_score DESC,
        wallet_address ASC
    `, [
      battlesPoints,
      healsPoints,
      crystallizationPoints,
      ascensionCirclesPoints,
      killingBlowsPoints,
      burnsPoints,
      resurrectionsPoints,
      efficiencyExponent,
    ])

    // Update max_army_count in profiles for all wallets (prevent score manipulation)
    for (const row of result.rows) {
      const walletAddress = row.wallet_address
      const maxArmyCount = Number(row.max_army_count) || 0
      if (maxArmyCount > 0) {
        await client.query(`
          UPDATE profiles
          SET max_army_count = GREATEST(COALESCE(max_army_count, 0), $1),
              updated_at = NOW()
          WHERE LOWER(wallet_address) = LOWER($2)
        `, [maxArmyCount, walletAddress])
      }
    }

    // Convert numeric fields to numbers (PostgreSQL numeric types come as strings)
    const leaderboard = result.rows.map((row: any) => ({
      ...row,
      army_count: Number(row.army_count) || 0,
      max_army_count: Number(row.max_army_count) || 0,
      angel_count: Number(row.angel_count) || 0,
      demon_count: Number(row.demon_count) || 0,
      battles_count: Number(row.battles_count) || 0,
      heals_count: Number(row.heals_count) || 0,
      heal_battle_ratio: Number(row.heal_battle_ratio) || 0,
      crystallization_count: Number(row.crystallization_count) || 0,
      ascension_circle_count: Number(row.ascension_circle_count) || 0,
      resurrections_count: Number(row.resurrections_count) || 0,
      killing_blows_count: Number(row.killing_blows_count) || 0,
      abyss_burns_count: Number(row.abyss_burns_count) || 0,
      mints_count: Number(row.mints_count) || 0,
      balanced_army_bonus: Number(row.balanced_army_bonus) || 0,
      total_score: Number(row.total_score) || 0,
    }))

    // Cache the result
    leaderboardCache = {
      data: leaderboard,
      timestamp: Date.now(),
    }

    return NextResponse.json({
      success: true,
      leaderboard,
      cached: false,
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

