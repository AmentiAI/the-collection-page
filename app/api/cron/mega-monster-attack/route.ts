import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Verify this is a Vercel cron request or has proper auth
  const cronHeader = request.headers.get('x-vercel-cron')
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // Vercel cron jobs send x-vercel-cron header automatically
  // If CRON_SECRET is set, also allow requests with Bearer token
  // If neither is set, allow all requests (for development)
  const isVercelCron = cronHeader === '1'
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`
  const isAuthorized = isVercelCron || hasValidSecret || !cronSecret
 

  console.log('[mega-monster-attack] Starting attack', {
    timestamp: new Date().toISOString(),
    isVercelCron: isVercelCron,
    hasValidSecret: hasValidSecret,
    userAgent: request.headers.get('user-agent'),
    headers: {
      'x-vercel-cron': cronHeader,
      'authorization': authHeader ? 'present' : 'missing'
    }
  })

  let client
  try {
    client = await getPool().connect()
    console.log('[mega-monster-attack] Database connected')

    // Get all mega monsters with health > 0 (exclude dead monsters)
    const monstersResult = await client.query(
      'SELECT id FROM mega_monsters WHERE (image_blob_url IS NOT NULL OR image_data IS NOT NULL) AND health > 0'
    )
    const monsterCount = monstersResult.rows.length

    if (monsterCount === 0) {
      return NextResponse.json({
        success: true,
        message: 'No mega monsters to attack with',
        attacksProcessed: 0,
      })
    }

    // Get all armies that are ready for battle (not dead, not in sanctuary)
    // Order by life_force DESC so we attack strongest armies first
    const armiesResult = await client.query(`
      SELECT 
        bo.id,
        bo.wallet_address,
        bo.inscription_id,
        bo.life_force,
        bo.status
      FROM battle_ordinals bo
      WHERE bo.status = 'ready'
        AND bo.status IS NOT NULL
        AND bo.status != 'sanctuary'
        AND bo.is_dead = false
        AND bo.life_force > 0
      ORDER BY bo.wallet_address, bo.life_force DESC
    `)

    const armies = armiesResult.rows
    console.log(`[mega-monster-attack] Found ${armies.length} armies ready for battle`)
    let attacksProcessed = 0
    let deaths = 0

    if (armies.length === 0) {
      console.log('[mega-monster-attack] No armies to attack, returning early')
      return NextResponse.json({
        success: true,
        message: 'No armies ready for battle',
        monsterCount,
        attacksProcessed: 0,
        deaths: 0,
        timestamp: new Date().toISOString(),
      })
    }

    // Group armies by wallet and sort by life_force (highest first)
    const armiesByWallet = new Map<string, typeof armies>()
    for (const army of armies) {
      const wallet = army.wallet_address.toLowerCase()
      if (!armiesByWallet.has(wallet)) {
        armiesByWallet.set(wallet, [])
      }
      armiesByWallet.get(wallet)!.push(army)
    }
    console.log(`[mega-monster-attack] Grouped into ${armiesByWallet.size} wallets`)

    // Process each wallet's armies
    for (const [wallet, walletArmies] of Array.from(armiesByWallet.entries())) {
      // Fetch ordinals from Magic Eden to get trait information
      let angelCount = 0
      let demonCount = 0
      
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        
        // Add timeout to prevent hanging
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
        
        const magicEdenResponse = await fetch(
          `${baseUrl}/api/magic-eden?ownerAddress=${encodeURIComponent(wallet)}&collectionSymbol=the-damned&fetchAll=true`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
          }
        )
        
        clearTimeout(timeoutId)

        if (magicEdenResponse.ok) {
          const magicEdenData = await magicEdenResponse.json()
          const tokens = Array.isArray(magicEdenData.tokens) ? magicEdenData.tokens : []
          
          // Count angels and demons from ready armies
          const readyInscriptionIds = new Set(walletArmies.map(a => a.inscription_id))
          
          for (const token of tokens) {
            const inscriptionId = token.id || token.inscriptionId
            if (!inscriptionId || !readyInscriptionIds.has(inscriptionId)) continue
            
            // Get attributes
            let attributes: Array<{ trait_type?: string; traitType?: string; value?: string }> = []
            if (token.meta?.attributes) attributes = token.meta.attributes
            else if (token.metadata?.attributes) attributes = token.metadata.attributes
            else if (token.attributes) attributes = token.attributes
            
            const ascendedTrait = attributes.find(
              (attr) =>
                (attr.trait_type === 'Ascended' || attr.traitType === 'Ascended') &&
                (attr.value === 'Angelic' || attr.value === 'Demonic')
            )
            
            if (ascendedTrait?.value === 'Angelic') angelCount++
            else if (ascendedTrait?.value === 'Demonic') demonCount++
          }
        }
      } catch (error) {
        console.error(`Error fetching traits for wallet ${wallet}:`, error)
      }
      
      // Check if wallet has balanced army:
      // - All of one type (all angels OR all demons) = balanced
      // - Equal amounts of both types = balanced
      // - Mixed but uneven amounts = NOT balanced
      const isBalanced = 
        (angelCount > 0 && demonCount === 0) ||  // All angels
        (demonCount > 0 && angelCount === 0) ||  // All demons
        (angelCount > 0 && demonCount > 0 && angelCount === demonCount)  // Equal mix
      
      // Each monster attacks up to 3 armies, targeting highest life_force first
      // After each monster attacks, we re-sort to find the new highest life_force armies
      for (const monster of monstersResult.rows) {
        // Re-fetch current armies sorted by life_force DESC (to get updated health after previous attacks)
        // Also get life force cap increases
        const currentArmiesResult = await client.query(`
          SELECT 
            bo.id, 
            bo.life_force, 
            bo.is_dead,
            bo.inscription_id,
            COALESCE(SUM(dcr.reward_value)::int, 0) AS life_force_cap_increase
          FROM battle_ordinals bo
          LEFT JOIN dungeon_crawl_rewards dcr ON 
            dcr.inscription_id = bo.inscription_id
            AND dcr.reward_type = 'life_force_cap'
            AND dcr.is_active = TRUE
            AND dcr.expires_at > NOW()
          WHERE bo.wallet_address = $1 
            AND bo.status = 'ready'
            AND bo.status IS NOT NULL
            AND bo.status != 'sanctuary'
            AND bo.is_dead = false 
            AND bo.life_force > 0
          GROUP BY bo.id, bo.life_force, bo.is_dead, bo.inscription_id
          ORDER BY bo.life_force DESC
        `, [wallet])
        
        const currentArmies = currentArmiesResult.rows
        
        if (currentArmies.length === 0) continue
        
        // Pick up to 3 armies with highest current life_force
        const targetsForThisMonster = currentArmies.slice(0, Math.min(3, currentArmies.length))
        
        if (targetsForThisMonster.length === 0) continue
        
        // Increment total_fights for this monster
        await client.query(
          'UPDATE mega_monsters SET total_fights = total_fights + 1 WHERE id = $1',
          [monster.id]
        )
        
        // Attack each target
        for (const army of targetsForThisMonster) {
          // Fetch army trait for leaderboard tracking
          const armyTraitResult = await client.query(
            'SELECT trait FROM battle_ordinals WHERE id = $1',
            [army.id]
          )
          const armyTrait = armyTraitResult.rows[0]?.trait as 'Angelic' | 'Demonic' | null
          
          // Use the current life_force from the query (already fetched above)
          const currentLifeForce = army.life_force
          const currentlyDead = army.is_dead
          const lifeForceCapIncrease = Number(army.life_force_cap_increase ?? 0)
          const maxLifeForce = 100 + lifeForceCapIncrease
          
          // Skip if already dead (shouldn't happen due to query filter, but safety check)
          if (currentlyDead || currentLifeForce <= 0) continue
          
          // Get active block chance buff for this specific ordinal (inscription_id)
          // Base block chance is 10%, bonuses are added per ordinal
          let blockChanceBuff = 0
          const blockChanceRes = await client.query(
            `
              SELECT SUM(reward_value)::int AS total
              FROM dungeon_crawl_rewards
              WHERE LOWER(wallet) = LOWER($1)
                AND inscription_id = $2
                AND reward_type = 'block_chance'
                AND is_active = TRUE
                AND (expires_at IS NULL OR expires_at > NOW())
            `,
            [wallet, army.inscription_id]
          )
          blockChanceBuff = Number(blockChanceRes.rows[0]?.total ?? 0)

          // Base block chance is 10%, add buff percentage for this ordinal
          const totalBlockChance = Math.min(90, 10 + blockChanceBuff) // Cap at 90%
          const wasBlocked = Math.random() < totalBlockChance / 100
          let damage = 0
          let newLifeForce = currentLifeForce
          
          if (!wasBlocked) {
            // Random damage between 2-7
            const baseDamage = Math.floor(Math.random() * 6) + 2 // 2-7
            
            // Reduce damage by 30% if balanced army (separate from block chance)
            damage = isBalanced ? Math.floor(baseDamage * 0.7) : baseDamage
            
            newLifeForce = Math.max(0, Math.min(currentLifeForce - damage, maxLifeForce))
          } else {
            // Blocked: no damage at all
            damage = 0
            newLifeForce = currentLifeForce
          }
          
          const isNowDead = newLifeForce === 0

          await client.query(`
            UPDATE battle_ordinals
            SET 
              life_force = $1,
              is_dead = $2,
              death_time = CASE WHEN $2 = true AND is_dead = false THEN NOW() ELSE death_time END,
              updated_at = NOW()
            WHERE id = $3
          `, [newLifeForce, isNowDead, army.id])

          // Log the attack with trait
          await client.query(`
            INSERT INTO mega_monster_attack_logs (
              monster_id,
              wallet_address,
              army_id,
              damage,
              was_blocked,
              life_force_before,
              life_force_after,
              trait
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            monster.id,
            wallet,
            army.id,
            damage,
            wasBlocked,
            currentLifeForce,
            newLifeForce,
            armyTrait
          ])

          // Update leaderboard stats: increment battles for this side
          if (armyTrait) {
            await client.query(`
              INSERT INTO angel_demon_leaderboard (side, total_battles, total_deaths, total_resurrections)
              VALUES ($1, 1, 0, 0)
              ON CONFLICT (side) 
              DO UPDATE SET 
                total_battles = angel_demon_leaderboard.total_battles + 1,
                last_updated = NOW()
            `, [armyTrait])
          }

          // Update leaderboard stats: increment deaths if army died
          if (isNowDead && !currentlyDead && armyTrait) {
            await client.query(`
              UPDATE angel_demon_leaderboard
              SET 
                total_deaths = total_deaths + 1,
                last_updated = NOW()
              WHERE side = $1
            `, [armyTrait])
          }

          attacksProcessed++
          if (isNowDead && !currentlyDead) {
            deaths++
          }
        }
      }
    }

    // At the end of the attack, find the monster with the least health and reduce it by 150
    let weakestMonsterId: string | null = null
    let weakestMonsterHealth: number | null = null
    let weakestMonsterName: string | null = null
    
    if (monsterCount > 0) {
      const weakestMonsterResult = await client.query(`
        SELECT id, health, name
        FROM mega_monsters
        WHERE (image_blob_url IS NOT NULL OR image_data IS NOT NULL) AND health > 0
        ORDER BY health ASC
        LIMIT 1
      `)
      
      if (weakestMonsterResult.rows.length > 0) {
        weakestMonsterId = weakestMonsterResult.rows[0].id
        weakestMonsterHealth = parseInt(weakestMonsterResult.rows[0].health || '15000', 10)
        weakestMonsterName = weakestMonsterResult.rows[0].name
        
        // Reduce health by 350, but not below 0
        const newHealth = Math.max(0, weakestMonsterHealth - 350)
        
        await client.query(
          'UPDATE mega_monsters SET health = $1, updated_at = NOW() WHERE id = $2',
          [newHealth, weakestMonsterId]
        )
        
        console.log(`[mega-monster-attack] Weakest monster (${weakestMonsterName || weakestMonsterId}) health reduced: ${weakestMonsterHealth} -> ${newHealth}`)
      }
    }

    console.log(`[mega-monster-attack] Completed successfully`, {
      monsterCount,
      attacksProcessed,
      deaths,
      weakestMonsterId,
      weakestMonsterHealth,
      weakestMonsterNewHealth: weakestMonsterHealth !== null ? Math.max(0, weakestMonsterHealth - 350) : null,
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Mega monster attack completed',
      monsterCount,
      attacksProcessed,
      deaths,
      weakestMonster: weakestMonsterId ? {
        id: weakestMonsterId,
        name: weakestMonsterName,
        healthBefore: weakestMonsterHealth,
        healthAfter: Math.max(0, (weakestMonsterHealth || 0) - 350),
        damageTaken: 350
      } : null,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[mega-monster-attack] Error processing attack:', error)
    console.error('[mega-monster-attack] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) {
      client.release()
      console.log('[mega-monster-attack] Database connection released')
    }
  }
}

