import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Initialize score config table and default values
async function ensureScoreConfigTable(client: any) {
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

  // Check if we need to seed default values
  const existing = await client.query('SELECT COUNT(*) as count FROM redemption_score_config')
  if (Number(existing.rows[0].count) === 0) {
    // Insert default values
    await client.query(`
      INSERT INTO redemption_score_config (category_key, category_label, action_label, points_value, description) VALUES
      ('battles', 'GAIN', 'Battles', 1.0, 'Each time your army participates in a horde attack (mega_monster_attack_logs)'),
      ('heals', 'GAIN', 'Heals', 0.5, 'Each army healed at the Pool of Life (heal_history.healed_count)'),
      ('crystallizations', 'GAIN', 'Crystallizations', 1.0, 'Each distinct inscription crystallized (crystallization_records)'),
      ('ascension_circles', 'GAIN', 'Ascension Circles', 0.5, 'Each ascension circle created or participated in (summoning_powder_circles + summoning_powder_participants)'),
      ('killing_blows', 'BONUS', 'Killing Blows', 50.0, 'Each mega monster killed (delivered the final blow - mega_monsters.killed_by matches your inscription)'),
      ('burns', 'GAIN', 'Burns', 1.0, 'Each abyss burn where inscription_id doesn''t start with "ascended_" (abyss_burns)'),
      ('resurrections', 'DEDUCT', 'Resurrections', -10.0, 'Each army that was resurrected (battle_ordinals.resurrection_time IS NOT NULL)')
    `)
  }

  // Ensure efficiency_exponent config exists
  const exponentCheck = await client.query(
    'SELECT COUNT(*) as count FROM redemption_score_config WHERE category_key = $1',
    ['efficiency_exponent']
  )
  if (Number(exponentCheck.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO redemption_score_config (category_key, category_label, action_label, points_value, description) VALUES
      ('efficiency_exponent', 'SYSTEM', 'Efficiency Exponent', 0.25, 'The exponent used in the efficiency curve: Army Count^exponent')
    `)
  }
}

export async function GET(request: NextRequest) {
  let client
  try {
    client = await getPool().connect()
    await ensureScoreConfigTable(client)

    const result = await client.query(`
      SELECT 
        category_key,
        category_label,
        action_label,
        points_value,
        description,
        is_active
      FROM redemption_score_config
      WHERE category_key != 'efficiency_exponent'
      ORDER BY 
        CASE category_label
          WHEN 'GAIN' THEN 1
          WHEN 'BONUS' THEN 2
          WHEN 'DEDUCT' THEN 3
          ELSE 4
        END,
        action_label
    `)

    const exponentResult = await client.query(`
      SELECT points_value
      FROM redemption_score_config
      WHERE category_key = 'efficiency_exponent'
      LIMIT 1
    `)

    const config = result.rows.map((row: any) => ({
      categoryKey: row.category_key,
      categoryLabel: row.category_label,
      actionLabel: row.action_label,
      pointsValue: Number(row.points_value),
      description: row.description,
      isActive: row.is_active,
    }))

    return NextResponse.json({
      success: true,
      config,
      efficiencyExponent: exponentResult.rows.length > 0 ? Number(exponentResult.rows[0].points_value) : 0.25,
    })
  } catch (error) {
    console.error('Error fetching score config:', error)
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

export async function POST(request: NextRequest) {
  let client
  try {
    client = await getPool().connect()
    await ensureScoreConfigTable(client)

    const body = await request.json()
    const { config, efficiencyExponent } = body

    if (!config || !Array.isArray(config)) {
      return NextResponse.json(
        { success: false, error: 'Invalid config data' },
        { status: 400 }
      )
    }

    // Update each config item
    for (const item of config) {
      await client.query(`
        UPDATE redemption_score_config
        SET 
          points_value = $1,
          description = $2,
          updated_at = NOW()
        WHERE category_key = $3
      `, [item.pointsValue, item.description, item.categoryKey])
    }

    // Update efficiency exponent
    if (efficiencyExponent !== undefined) {
      await client.query(`
        UPDATE redemption_score_config
        SET 
          points_value = $1,
          updated_at = NOW()
        WHERE category_key = 'efficiency_exponent'
      `, [efficiencyExponent])
    }

    return NextResponse.json({
      success: true,
      message: 'Score configuration updated successfully',
    })
  } catch (error) {
    console.error('Error updating score config:', error)
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

