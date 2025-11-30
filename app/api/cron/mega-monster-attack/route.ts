import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  // Check if this is a Vercel cron job (Vercel sends x-vercel-cron header)
  const vercelCron = request.headers.get('x-vercel-cron')
  if (vercelCron === '1') {
    return true // Allow Vercel cron jobs
  }
  
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // If no secret is set, allow in development
  if (!cronSecret) {
    return process.env.NODE_ENV === 'development'
  }
  
  // If secret is set, require matching authorization header
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  let client
  try {
    client = await getPool().connect()

    // Get all mega monsters
    const monstersResult = await client.query(
      'SELECT id FROM mega_monsters WHERE image_blob_url IS NOT NULL OR image_data IS NOT NULL'
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
        AND bo.is_dead = false
        AND bo.life_force > 0
      ORDER BY bo.wallet_address, bo.life_force DESC
    `)

    const armies = armiesResult.rows
    let attacksProcessed = 0
    let deaths = 0

    // Group armies by wallet and sort by life_force (highest first)
    const armiesByWallet = new Map<string, typeof armies>()
    for (const army of armies) {
      const wallet = army.wallet_address.toLowerCase()
      if (!armiesByWallet.has(wallet)) {
        armiesByWallet.set(wallet, [])
      }
      armiesByWallet.get(wallet)!.push(army)
    }

    // Process each wallet's armies
    for (const [wallet, walletArmies] of Array.from(armiesByWallet.entries())) {
      // Fetch ordinals from Magic Eden to get trait information
      let angelCount = 0
      let demonCount = 0
      
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        const magicEdenResponse = await fetch(
          `${baseUrl}/api/magic-eden?ownerAddress=${encodeURIComponent(wallet)}&collectionSymbol=the-damned&fetchAll=true`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          }
        )

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
        const currentArmiesResult = await client.query(`
          SELECT id, life_force, is_dead
          FROM battle_ordinals
          WHERE wallet_address = $1 
            AND status = 'ready' 
            AND is_dead = false 
            AND life_force > 0
          ORDER BY life_force DESC
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
          
          // Skip if already dead (shouldn't happen due to query filter, but safety check)
          if (currentlyDead || currentLifeForce <= 0) continue
          
          // 10% chance to block the attack completely (separate from balanced army bonus)
          const wasBlocked = Math.random() < 0.1
          let damage = 0
          let newLifeForce = currentLifeForce
          
          if (!wasBlocked) {
            // Random damage between 2-7
            const baseDamage = Math.floor(Math.random() * 6) + 2 // 2-7
            
            // Reduce damage by 30% if balanced army (separate from block chance)
            damage = isBalanced ? Math.floor(baseDamage * 0.7) : baseDamage
            
            newLifeForce = Math.max(0, currentLifeForce - damage)
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

    return NextResponse.json({
      success: true,
      message: 'Mega monster attack completed',
      monsterCount,
      attacksProcessed,
      deaths,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error processing mega monster attack:', error)
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

