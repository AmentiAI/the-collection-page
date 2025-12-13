/**
 * Simplified Dungeon Crawl Timing System
 * Central timing table controls all instance and level timing
 */

export interface CrawlTiming {
  id: string
  crawlId: string
  instanceId: string | null
  instanceStartedAt: Date | null
  instanceEndedAt: Date | null
  instanceStatus: 'active' | 'completed' | 'failed' | null
  level1StartedAt: Date | null
  level1EndedAt: Date | null
  level1Active: boolean
  level2StartedAt: Date | null
  level2EndedAt: Date | null
  level2Active: boolean
  level3StartedAt: Date | null
  level3EndedAt: Date | null
  level3Active: boolean
  nextInstanceStartsAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Get or create timing record for a crawl
 */
export async function getCrawlTiming(client: any, crawlId: string): Promise<CrawlTiming | null> {
  const result = await client.query(
    `SELECT * FROM dungeon_crawl_timing WHERE crawl_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [crawlId]
  )
  
  if (result.rows.length === 0) {
    return null
  }
  
  const row = result.rows[0]
  return {
    id: row.id,
    crawlId: row.crawl_id,
    instanceId: row.instance_id,
    instanceStartedAt: row.instance_started_at ? new Date(row.instance_started_at) : null,
    instanceEndedAt: row.instance_ended_at ? new Date(row.instance_ended_at) : null,
    instanceStatus: row.instance_status,
    level1StartedAt: row.level_1_started_at ? new Date(row.level_1_started_at) : null,
    level1EndedAt: row.level_1_ended_at ? new Date(row.level_1_ended_at) : null,
    level1Active: row.level_1_active,
    level2StartedAt: row.level_2_started_at ? new Date(row.level_2_started_at) : null,
    level2EndedAt: row.level_2_ended_at ? new Date(row.level_2_ended_at) : null,
    level2Active: row.level_2_active,
    level3StartedAt: row.level_3_started_at ? new Date(row.level_3_started_at) : null,
    level3EndedAt: row.level_3_ended_at ? new Date(row.level_3_ended_at) : null,
    level3Active: row.level_3_active,
    nextInstanceStartsAt: row.next_instance_starts_at ? new Date(row.next_instance_starts_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * Create or update timing record for a crawl
 */
export async function upsertCrawlTiming(
  client: any,
  crawlId: string,
  updates: Partial<CrawlTiming>
): Promise<CrawlTiming> {
  // Check if active timing exists
  const existing = await client.query(
    `SELECT id FROM dungeon_crawl_timing WHERE crawl_id = $1 AND instance_status = 'active'`,
    [crawlId]
  )
  
  if (existing.rows.length > 0) {
    // Update existing
    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramCount = 1
    
    if (updates.instanceId !== undefined) {
      updateFields.push(`instance_id = $${paramCount++}`)
      updateValues.push(updates.instanceId)
    }
    if (updates.instanceStartedAt !== undefined) {
      updateFields.push(`instance_started_at = $${paramCount++}`)
      updateValues.push(updates.instanceStartedAt)
    }
    if (updates.instanceEndedAt !== undefined) {
      updateFields.push(`instance_ended_at = $${paramCount++}`)
      updateValues.push(updates.instanceEndedAt)
    }
    if (updates.instanceStatus !== undefined) {
      updateFields.push(`instance_status = $${paramCount++}`)
      updateValues.push(updates.instanceStatus)
    }
    if (updates.level1StartedAt !== undefined) {
      updateFields.push(`level_1_started_at = $${paramCount++}`)
      updateValues.push(updates.level1StartedAt)
    }
    if (updates.level1EndedAt !== undefined) {
      updateFields.push(`level_1_ended_at = $${paramCount++}`)
      updateValues.push(updates.level1EndedAt)
    }
    if (updates.level1Active !== undefined) {
      updateFields.push(`level_1_active = $${paramCount++}`)
      updateValues.push(updates.level1Active)
    }
    if (updates.level2StartedAt !== undefined) {
      updateFields.push(`level_2_started_at = $${paramCount++}`)
      updateValues.push(updates.level2StartedAt)
    }
    if (updates.level2EndedAt !== undefined) {
      updateFields.push(`level_2_ended_at = $${paramCount++}`)
      updateValues.push(updates.level2EndedAt)
    }
    if (updates.level2Active !== undefined) {
      updateFields.push(`level_2_active = $${paramCount++}`)
      updateValues.push(updates.level2Active)
    }
    if (updates.level3StartedAt !== undefined) {
      updateFields.push(`level_3_started_at = $${paramCount++}`)
      updateValues.push(updates.level3StartedAt)
    }
    if (updates.level3EndedAt !== undefined) {
      updateFields.push(`level_3_ended_at = $${paramCount++}`)
      updateValues.push(updates.level3EndedAt)
    }
    if (updates.level3Active !== undefined) {
      updateFields.push(`level_3_active = $${paramCount++}`)
      updateValues.push(updates.level3Active)
    }
    if (updates.nextInstanceStartsAt !== undefined) {
      updateFields.push(`next_instance_starts_at = $${paramCount++}`)
      updateValues.push(updates.nextInstanceStartsAt)
    }
    
    if (updateFields.length === 0) {
      // No updates, just return existing
      const result = await client.query(
        `SELECT * FROM dungeon_crawl_timing WHERE id = $1`,
        [existing.rows[0].id]
      )
      return mapTimingRow(result.rows[0])
    }
    
    updateValues.push(existing.rows[0].id)
    const result = await client.query(
      `UPDATE dungeon_crawl_timing SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      updateValues
    )
    return mapTimingRow(result.rows[0])
  } else {
    // Create new
    const result = await client.query(
      `INSERT INTO dungeon_crawl_timing (
        crawl_id, instance_id, instance_started_at, instance_ended_at, instance_status,
        level_1_started_at, level_1_ended_at, level_1_active,
        level_2_started_at, level_2_ended_at, level_2_active,
        level_3_started_at, level_3_ended_at, level_3_active,
        next_instance_starts_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      ) RETURNING *`,
      [
        crawlId,
        updates.instanceId || null,
        updates.instanceStartedAt || null,
        updates.instanceEndedAt || null,
        updates.instanceStatus || null,
        updates.level1StartedAt || null,
        updates.level1EndedAt || null,
        updates.level1Active ?? false,
        updates.level2StartedAt || null,
        updates.level2EndedAt || null,
        updates.level2Active ?? false,
        updates.level3StartedAt || null,
        updates.level3EndedAt || null,
        updates.level3Active ?? false,
        updates.nextInstanceStartsAt || null,
      ]
    )
    return mapTimingRow(result.rows[0])
  }
}

function mapTimingRow(row: any): CrawlTiming {
  return {
    id: row.id,
    crawlId: row.crawl_id,
    instanceId: row.instance_id,
    instanceStartedAt: row.instance_started_at ? new Date(row.instance_started_at) : null,
    instanceEndedAt: row.instance_ended_at ? new Date(row.instance_ended_at) : null,
    instanceStatus: row.instance_status,
    level1StartedAt: row.level_1_started_at ? new Date(row.level_1_started_at) : null,
    level1EndedAt: row.level_1_ended_at ? new Date(row.level_1_ended_at) : null,
    level1Active: row.level_1_active,
    level2StartedAt: row.level_2_started_at ? new Date(row.level_2_started_at) : null,
    level2EndedAt: row.level_2_ended_at ? new Date(row.level_2_ended_at) : null,
    level2Active: row.level_2_active,
    level3StartedAt: row.level_3_started_at ? new Date(row.level_3_started_at) : null,
    level3EndedAt: row.level_3_ended_at ? new Date(row.level_3_ended_at) : null,
    level3Active: row.level_3_active,
    nextInstanceStartsAt: row.next_instance_starts_at ? new Date(row.next_instance_starts_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * Check if a new instance should be created for a crawl
 */
export async function shouldCreateNewInstance(
  client: any,
  crawlId: string,
  restartAfterFailureHours: number,
  cooldownHours: number,
  neverRestartAfterCompletion: boolean
): Promise<{ shouldCreate: boolean; reason?: string }> {
  const timing = await getCrawlTiming(client, crawlId)
  
  // No timing record exists - first time, allow creation
  if (!timing) {
    return { shouldCreate: true, reason: 'No previous timing record' }
  }
  
  // Active instance exists - don't create
  // But first verify there's actually an active instance in the database
  if (timing.instanceStatus === 'active') {
    const activeCheck = await client.query(
      `SELECT COUNT(*)::int as count
       FROM dungeon_crawl_instances 
       WHERE crawl_id = $1 
         AND status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')`,
      [crawlId]
    )
    
    // If timing table says active but no actual instance exists, treat as if no active instance
    if (activeCheck.rows[0]?.count === 0) {
      // Timing table is inconsistent - continue with checks
    } else {
      return { shouldCreate: false, reason: 'Active instance exists' }
    }
  }
  
  // Check if we should wait for next_instance_starts_at
  if (timing.nextInstanceStartsAt) {
    const now = new Date()
    if (now < timing.nextInstanceStartsAt) {
      return { shouldCreate: false, reason: `Waiting until ${timing.nextInstanceStartsAt.toISOString()}` }
    }
  }
  
  // If completed and never restart, don't create
  if (timing.instanceStatus === 'completed' && neverRestartAfterCompletion) {
    return { shouldCreate: false, reason: 'Never restart after completion is enabled' }
  }
  
  // If completed, check cooldown
  if (timing.instanceStatus === 'completed' && timing.instanceEndedAt) {
    const cooldownEnds = new Date(timing.instanceEndedAt.getTime() + cooldownHours * 60 * 60 * 1000)
    const now = new Date()
    if (now < cooldownEnds) {
      return { shouldCreate: false, reason: `Cooldown until ${cooldownEnds.toISOString()}` }
    }
  }
  
  // If failed, check restart delay
  if (timing.instanceStatus === 'failed' && timing.instanceEndedAt) {
    const restartTime = new Date(timing.instanceEndedAt.getTime() + restartAfterFailureHours * 60 * 60 * 1000)
    const now = new Date()
    if (now < restartTime) {
      return { shouldCreate: false, reason: `Restart delay until ${restartTime.toISOString()}` }
    }
  }
  
  // All checks passed, can create
  return { shouldCreate: true, reason: 'All conditions met' }
}

/**
 * Calculate level window times based on timing
 */
export function calculateLevelWindow(
  timing: CrawlTiming,
  level: 1 | 2 | 3,
  windowStartMinutes: number,
  windowDurationMinutes: number
): { windowStartMs: number; windowEndMs: number } | null {
  // Use level 1 start time as base for all levels
  const baseTime = timing.level1StartedAt
  if (!baseTime) {
    return null
  }
  
  const windowStartMs = baseTime.getTime() + windowStartMinutes * 60 * 1000
  const windowEndMs = windowStartMs + windowDurationMinutes * 60 * 1000
  
  return { windowStartMs, windowEndMs }
}

