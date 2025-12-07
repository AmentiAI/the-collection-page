import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET - List all dungeon crawls (admin)
export async function GET(request: NextRequest) {
  const pool = getPool()
  try {

    const client = await pool.connect()
    try {
      const crawlsRes = await client.query(`
        SELECT 
          c.*,
          COUNT(DISTINCT i.id) FILTER (WHERE i.status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')) AS active_instances,
          COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'completed') AS completed_instances
        FROM dungeon_crawls c
        LEFT JOIN dungeon_crawl_instances i ON i.crawl_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `)

      const crawls = crawlsRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        requiredParticipants: Number(row.required_participants),
        allowMultipleFromStock: Boolean(row.allow_multiple_from_stock),
        allowedTraits: row.allowed_traits || 'all',
        restartAfterFailureHours: Number(row.restart_after_failure_hours ?? row.restart_interval_hours ?? 2),
        cooldownHours: Number(row.cooldown_hours ?? (row.cooldown_days ? row.cooldown_days * 24 : 168)),
        neverRestartAfterCompletion: Boolean(row.never_restart_after_completion ?? false),
        rewardType: row.reward_type,
        rewardValue: Number(row.reward_value),
        rewardDropChance1Ordinal: Number(row.reward_drop_chance_1_ordinal ?? 20),
        rewardDropChance2Ordinals: Number(row.reward_drop_chance_2_ordinals ?? 10),
        rewardDropChance3PlusOrdinals: Number(row.reward_drop_chance_3plus_ordinals ?? 5),
        level1WindowStartMinutes: Number(row.level_1_window_start_minutes),
        level1WindowDurationMinutes: Number(row.level_1_window_duration_minutes),
        level2WindowStartMinutes: Number(row.level_2_window_start_minutes),
        level2WindowDurationMinutes: Number(row.level_2_window_duration_minutes),
        level3WindowStartMinutes: Number(row.level_3_window_start_minutes),
        level3WindowDurationMinutes: Number(row.level_3_window_duration_minutes),
        minParticipationPercent: Number(row.min_participation_percent),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        activeInstances: Number(row.active_instances),
        completedInstances: Number(row.completed_instances),
      }))

      return NextResponse.json({
        success: true,
        crawls,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[admin/dungeon-crawls][GET]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dungeon crawls' },
      { status: 500 }
    )
  }
}

// POST - Create new dungeon crawl (admin)
export async function POST(request: NextRequest) {
  const pool = getPool()
  try {
    const body = await request.json().catch(() => ({}))
    const {
      wallet,
      name,
      description,
      requiredParticipants = 60,
      allowMultipleFromStock = false,
      allowedTraits = 'all',
      restartAfterFailureHours = 2,
      cooldownHours = 168,
      neverRestartAfterCompletion = false,
      rewardType,
      rewardValue,
      rewardDropChance1Ordinal = 20,
      rewardDropChance2Ordinals = 10,
      rewardDropChance3PlusOrdinals = 5,
      level1WindowStartMinutes = 0,
      level1WindowDurationMinutes = 2,
      level2WindowStartMinutes = 4,
      level2WindowDurationMinutes = 2,
      level3WindowStartMinutes = 8,
      level3WindowDurationMinutes = 2,
      minParticipationPercent = 80,
    } = body

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 }
      )
    }

    if (!name || !rewardType || rewardValue === undefined) {
      return NextResponse.json(
        { success: false, error: 'name, rewardType, and rewardValue are required' },
        { status: 400 }
      )
    }

    if (!['block_chance', 'life_force_cap'].includes(rewardType)) {
      return NextResponse.json(
        { success: false, error: 'rewardType must be "block_chance" or "life_force_cap"' },
        { status: 400 }
      )
    }

    if (allowedTraits && !['all', 'angelic', 'demonic'].includes(allowedTraits)) {
      return NextResponse.json(
        { success: false, error: 'allowedTraits must be "all", "angelic", or "demonic"' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const crawlRes = await client.query(
        `
          INSERT INTO dungeon_crawls (
            name, description, required_participants, allow_multiple_from_stock, allowed_traits,
            restart_after_failure_hours, cooldown_hours, never_restart_after_completion,
            reward_type, reward_value, reward_drop_chance_1_ordinal, reward_drop_chance_2_ordinals, 
            reward_drop_chance_3plus_ordinals, level_1_window_start_minutes, level_1_window_duration_minutes,
            level_2_window_start_minutes, level_2_window_duration_minutes,
            level_3_window_start_minutes, level_3_window_duration_minutes,
            min_participation_percent, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          RETURNING *
        `,
        [
          name,
          description || null,
          Number(requiredParticipants),
          Boolean(allowMultipleFromStock),
          allowedTraits || 'all',
          Number(restartAfterFailureHours),
          Number(cooldownHours),
          Boolean(neverRestartAfterCompletion),
          rewardType,
          Number(rewardValue),
          Number(rewardDropChance1Ordinal),
          Number(rewardDropChance2Ordinals),
          Number(rewardDropChance3PlusOrdinals),
          Number(level1WindowStartMinutes),
          Number(level1WindowDurationMinutes),
          Number(level2WindowStartMinutes),
          Number(level2WindowDurationMinutes),
          Number(level3WindowStartMinutes),
          Number(level3WindowDurationMinutes),
          Number(minParticipationPercent),
          wallet,
        ]
      )

      const crawl = crawlRes.rows[0]

      // Create initial instance
      const instanceRes = await client.query(
        `
          INSERT INTO dungeon_crawl_instances (crawl_id, status)
          VALUES ($1, 'open')
          RETURNING *
        `,
        [crawl.id]
      )

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        crawl: {
          id: crawl.id,
          name: crawl.name,
          description: crawl.description,
          requiredParticipants: Number(crawl.required_participants),
          allowMultipleFromStock: Boolean(crawl.allow_multiple_from_stock),
          restartAfterFailureHours: Number(crawl.restart_after_failure_hours ?? crawl.restart_interval_hours ?? 2),
          cooldownHours: Number(crawl.cooldown_hours ?? (crawl.cooldown_days ? crawl.cooldown_days * 24 : 168)),
          neverRestartAfterCompletion: Boolean(crawl.never_restart_after_completion ?? false),
          rewardType: crawl.reward_type,
          rewardValue: Number(crawl.reward_value),
          level1WindowStartMinutes: Number(crawl.level_1_window_start_minutes),
          level1WindowDurationMinutes: Number(crawl.level_1_window_duration_minutes),
          level2WindowStartMinutes: Number(crawl.level_2_window_start_minutes),
          level2WindowDurationMinutes: Number(crawl.level_2_window_duration_minutes),
          level3WindowStartMinutes: Number(crawl.level_3_window_start_minutes),
          level3WindowDurationMinutes: Number(crawl.level_3_window_duration_minutes),
          minParticipationPercent: Number(crawl.min_participation_percent),
          isActive: Boolean(crawl.is_active),
          createdAt: crawl.created_at,
          updatedAt: crawl.updated_at,
        },
        instance: {
          id: instanceRes.rows[0].id,
          status: instanceRes.rows[0].status,
        },
      })
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {})
      }
      console.error('[admin/dungeon-crawls][POST]', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create dungeon crawl' },
        { status: 500 }
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  } catch (error) {
    console.error('[admin/dungeon-crawls][POST] Infrastructure error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to initialize infrastructure' },
      { status: 500 }
    )
  }
}

// PATCH - Update dungeon crawl (admin)
export async function PATCH(request: NextRequest) {
  const pool = getPool()
  try {
    const body = await request.json().catch(() => ({}))
    const { wallet, crawlId, updates } = body

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 }
      )
    }

    if (!crawlId || !updates) {
      return NextResponse.json(
        { success: false, error: 'crawlId and updates are required' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Build update query dynamically
      const updateFields: string[] = []
      const updateValues: any[] = []
      let paramIndex = 1

      const allowedFields = [
        'name',
        'description',
        'required_participants',
        'allow_multiple_from_stock',
        'allowed_traits',
        'restart_after_failure_hours',
        'cooldown_hours',
        'never_restart_after_completion',
        'reward_type',
        'reward_value',
        'reward_drop_chance_1_ordinal',
        'reward_drop_chance_2_ordinals',
        'reward_drop_chance_3plus_ordinals',
        'level_1_window_start_minutes',
        'level_1_window_duration_minutes',
        'level_2_window_start_minutes',
        'level_2_window_duration_minutes',
        'level_3_window_start_minutes',
        'level_3_window_duration_minutes',
        'min_participation_percent',
        'is_active',
      ]

      for (const [key, value] of Object.entries(updates)) {
        let dbKey = key
          .replace(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^_/, '')
        
        // Fix special cases for reward drop chance fields
        dbKey = dbKey.replace('chance1_ordinal', 'chance_1_ordinal')
        dbKey = dbKey.replace('chance2_ordinals', 'chance_2_ordinals')
        dbKey = dbKey.replace('chance3_plus', 'chance_3plus')

        if (allowedFields.includes(dbKey)) {
          updateFields.push(`${dbKey} = $${paramIndex}`)
          updateValues.push(value)
          paramIndex++
        }
      }

      if (updateFields.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'No valid fields to update' },
          { status: 400 }
        )
      }

      updateFields.push(`updated_at = NOW()`)
      updateValues.push(crawlId)

      await client.query(
        `
          UPDATE dungeon_crawls
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex}
        `,
        updateValues
      )

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: 'Dungeon crawl updated',
      })
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {})
      }
      console.error('[admin/dungeon-crawls][PATCH]', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update dungeon crawl' },
        { status: 500 }
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  } catch (error) {
    console.error('[admin/dungeon-crawls][PATCH] Infrastructure error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to initialize infrastructure' },
      { status: 500 }
    )
  }
}

