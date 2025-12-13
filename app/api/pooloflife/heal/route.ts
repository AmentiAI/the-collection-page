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

    // Simple query: Set life_force = life_force_cap for all eligible armies
    // The life_force_cap field is already populated and maintained by the reward system
    const healResult = await client.query(
      `
        UPDATE battle_ordinals
        SET 
          life_force = life_force_cap,
          is_dead = false,
          last_heal_time = NOW(),
          updated_at = NOW()
        WHERE LOWER(wallet_address) = LOWER($1)
          AND (status IN ('ready', 'sanctuary') OR status IS NULL)
          AND life_force > 0
          AND is_dead = false
          AND life_force < life_force_cap
        RETURNING id, inscription_id, life_force, life_force_cap
      `,
      [walletAddress]
    )

    const healedCount = healResult.rowCount || 0
    
    console.log(`[pooloflife/heal] Healed ${healedCount} armies to their life_force_cap`)
    console.log(`[pooloflife/heal] Wallet: ${walletAddress}`)
    
    if (healedCount > 0) {
      console.log(`[pooloflife/heal] Sample healed armies:`, healResult.rows.slice(0, 3).map((r: any) => ({
        inscription_id: r.inscription_id,
        healed_to: r.life_force,
        cap: r.life_force_cap,
      })))
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
      totalArmies: armiesWithCaps.length,
      healedCount,
      errorsCount: errors.length,
      walletAddress,
    })
    
    // Return success
    if (healedCount > 0) {
      return NextResponse.json({
        success: true,
        healedCount,
        message: `Healed ${healedCount} armies to full health`,
      })
    } else {
      // Check if there are any armies at all
      const armyCountResult = await client.query(
        `SELECT COUNT(*)::int as count
         FROM battle_ordinals
         WHERE LOWER(wallet_address) = LOWER($1)
           AND (status IN ('ready', 'sanctuary') OR status IS NULL)
           AND life_force > 0
           AND is_dead = false`,
        [walletAddress]
      )
      const armyCount = armyCountResult.rows[0]?.count || 0
      
      if (armyCount === 0) {
        return NextResponse.json(
          { error: 'No armies found to heal. Make sure your armies are ready or in sanctuary.' },
          { status: 404 }
        )
      } else {
        return NextResponse.json(
          { error: 'All armies are already at full health' },
          { status: 400 }
        )
      }
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

