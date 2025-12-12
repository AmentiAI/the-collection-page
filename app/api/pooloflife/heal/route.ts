import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json().catch(() => ({}))
    const { walletAddress } = body

    if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim().length === 0) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    const pool = getPool()
    if (!pool) {
      console.error('[pooloflife/heal] Database pool not available')
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 500 }
      )
    }

    client = await pool.connect()

    // Check if user has healed in the last 5 hours using heal_history table (source of truth)
    // This matches what the status endpoint uses
    const lastHealResult = await client.query(
      `SELECT healed_at,
              EXTRACT(EPOCH FROM (NOW() - healed_at)) / 3600 as hours_since_heal
       FROM heal_history 
       WHERE LOWER(wallet_address) = LOWER($1)
       ORDER BY healed_at DESC 
       LIMIT 1`,
      [walletAddress]
    )

    if (lastHealResult.rows.length > 0) {
      const hoursSinceHeal = parseFloat(lastHealResult.rows[0].hours_since_heal || '0')
      
      if (hoursSinceHeal < 5) {
        const hoursRemaining = Math.ceil(5 - hoursSinceHeal)
        const minutesRemaining = Math.ceil((5 - hoursSinceHeal) * 60)
        
        if (hoursRemaining > 0) {
          return NextResponse.json(
            { error: `You can only use the Pool of Life once every 5 hours. Try again in ${hoursRemaining} hour(s).` },
            { status: 403 }
          )
        } else if (minutesRemaining > 0) {
          return NextResponse.json(
            { error: `You can only use the Pool of Life once every 5 hours. Try again in ${minutesRemaining} minute(s).` },
            { status: 403 }
          )
        }
      }
    }

    // Get all armies with their life force caps (including bonuses)
    // Include 'ready', 'sanctuary', and NULL status armies (like battle page shows all armies)
    // Only exclude armies that are explicitly dead or have 0 life force
    // Match the battle/ordinals API query structure for consistency
    const armiesWithCaps = await client.query(
      `
        SELECT 
          bo.id,
          bo.inscription_id,
          bo.life_force,
          bo.status,
          COALESCE(SUM(dcr.reward_value)::int, 0) AS life_force_cap_increase
        FROM battle_ordinals bo
        LEFT JOIN dungeon_crawl_rewards dcr ON 
          dcr.inscription_id = bo.inscription_id
          AND LOWER(dcr.wallet) = LOWER($1)
          AND dcr.reward_type = 'life_force_cap'
          AND dcr.is_active = TRUE
          AND (dcr.expires_at IS NULL OR dcr.expires_at > NOW())
        WHERE LOWER(bo.wallet_address) = LOWER($1)
          AND (bo.status IN ('ready', 'sanctuary') OR bo.status IS NULL)
          AND bo.life_force > 0
          AND bo.is_dead = false
        GROUP BY bo.id, bo.inscription_id, bo.life_force, bo.status
      `,
      [walletAddress]
    )

    // Heal each army to its individual max life force (100 + bonuses)
    // Include both ready and sanctuary armies, and NULL status armies
    let healedCount = 0
    const errors: string[] = []
    
    console.log(`[pooloflife/heal] Found ${armiesWithCaps.rows.length} armies to check for healing`)
    console.log(`[pooloflife/heal] Wallet: ${walletAddress}`)
    
    // Log all armies found for debugging
    if (armiesWithCaps.rows.length > 0) {
      console.log(`[pooloflife/heal] Sample army data:`, {
        firstArmy: {
          id: armiesWithCaps.rows[0].id,
          inscription_id: armiesWithCaps.rows[0].inscription_id,
          life_force: armiesWithCaps.rows[0].life_force,
          status: armiesWithCaps.rows[0].status,
          life_force_cap_increase: armiesWithCaps.rows[0].life_force_cap_increase,
        }
      })
    }
    
    for (const army of armiesWithCaps.rows) {
      try {
      const lifeForceCapIncrease = Number(army.life_force_cap_increase ?? 0)
      const maxLifeForce = 100 + lifeForceCapIncrease
        const currentLifeForce = Number(army.life_force ?? 0)
        
        // Log each army's calculation for debugging
        console.log(`[pooloflife/heal] Army ${army.inscription_id}:`, {
          raw_life_force: army.life_force,
          raw_cap_increase: army.life_force_cap_increase,
          currentLifeForce,
          lifeForceCapIncrease,
          maxLifeForce,
          needsHealing: currentLifeForce < maxLifeForce,
          comparison: `${currentLifeForce} < ${maxLifeForce} = ${currentLifeForce < maxLifeForce}`,
          status: army.status,
        })
        
        // Validate values
        if (isNaN(maxLifeForce) || isNaN(currentLifeForce)) {
          console.error(`[pooloflife/heal] Invalid life force values for army ${army.id}:`, {
            lifeForceCapIncrease,
            currentLifeForce: army.life_force,
            raw_life_force: army.life_force,
            raw_cap_increase: army.life_force_cap_increase,
          })
          continue
        }
      
        // Only heal if below max
        if (currentLifeForce < maxLifeForce) {
          const updateResult = await client.query(
          `UPDATE battle_ordinals
           SET 
             life_force = $1,
             is_dead = false,
             last_heal_time = NOW(),
             updated_at = NOW()
             WHERE id = $2
             RETURNING id`,
          [maxLifeForce, army.id]
        )
          
          if (updateResult.rowCount === 0) {
            console.warn(`[pooloflife/heal] No rows updated for army ${army.id} (inscription: ${army.inscription_id})`)
          } else {
            console.log(`[pooloflife/heal] Healed army ${army.inscription_id} from ${currentLifeForce} to ${maxLifeForce}`)
            healedCount++
          }
        } else {
          console.log(`[pooloflife/heal] Army ${army.inscription_id} already at max health (${currentLifeForce}/${maxLifeForce}) - skipping`)
        }
      } catch (armyError) {
        console.error(`[pooloflife/heal] Error healing army ${army.id}:`, armyError)
        errors.push(`Failed to heal army ${army.inscription_id}`)
        // Continue with other armies
      }
    }

    // Record heal history
    if (healedCount > 0) {
      try {
      await client.query(
        `INSERT INTO heal_history (wallet_address, healed_count, healed_at)
         VALUES ($1, $2, NOW())`,
          [walletAddress.trim(), healedCount]
      )
      } catch (historyError) {
        console.error('[pooloflife/heal] Error recording heal history:', historyError)
        // Don't fail the request if history recording fails
      }
    }

    // Log summary before returning
    console.log(`[pooloflife/heal] Summary:`, {
      totalArmies: armiesWithCaps.rows.length,
      healedCount,
      errorsCount: errors.length,
      walletAddress,
    })
    
    // Return success even if some armies failed (partial success)
    if (healedCount > 0) {
    return NextResponse.json({
      success: true,
      healedCount,
        message: `Healed ${healedCount} armies to full health${errors.length > 0 ? ` (${errors.length} failed)` : ''}`,
        errors: errors.length > 0 ? errors : undefined,
      })
    } else if (armiesWithCaps.rows.length === 0) {
      console.log(`[pooloflife/heal] No armies found for wallet ${walletAddress}`)
      return NextResponse.json(
        { error: 'No armies found to heal. Make sure your armies are ready or in sanctuary.' },
        { status: 404 }
      )
    } else {
      // Log detailed info when all armies appear to be at max
      console.warn(`[pooloflife/heal] All ${armiesWithCaps.rows.length} armies appear to be at max health, but user reports they are damaged.`)
      console.warn(`[pooloflife/heal] First few armies:`, armiesWithCaps.rows.slice(0, 3).map(a => ({
        inscription_id: a.inscription_id,
        life_force: a.life_force,
        cap_increase: a.life_force_cap_increase,
        calculated_max: 100 + Number(a.life_force_cap_increase ?? 0),
        status: a.status,
      })))
      return NextResponse.json(
        { error: 'All armies are already at full health' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Error healing armies:', error)
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

