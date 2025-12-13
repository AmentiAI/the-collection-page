import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Cron job to restart dungeon crawls based on restart_after_failure_hours and cooldown_hours
export async function GET(request: NextRequest) {
  const pool = getPool()
  try {
    const client = await pool.connect()
    try {
      const now = new Date()

      // Find crawl configs that need new instances
      // 1. Active crawls with no active instances
      // 2. Failed instances where restart_after_failure_hours has passed
      // 3. Completed instances where cooldown_hours has passed (unless never_restart_after_completion is true)
      const crawlsToRestart = await client.query(
        `
          SELECT DISTINCT 
            c.id, 
            COALESCE(c.restart_after_failure_hours, c.restart_interval_hours, 2) as restart_after_failure_hours,
            COALESCE(c.cooldown_hours, c.cooldown_days * 24, 168) as cooldown_hours,
            COALESCE(c.never_restart_after_completion, FALSE) as never_restart_after_completion
          FROM dungeon_crawls c
          WHERE c.is_active = TRUE
            AND (
              -- No active instance exists
              NOT EXISTS (
                SELECT 1 FROM dungeon_crawl_instances i
                WHERE i.crawl_id = c.id
                  AND i.status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
              )
              OR
              -- Failed instance: restart after failure hours
              EXISTS (
                SELECT 1 FROM dungeon_crawl_instances i
                WHERE i.crawl_id = c.id
                  AND i.status = 'failed'
                  AND i.updated_at <= NOW() - (COALESCE(c.restart_after_failure_hours, c.restart_interval_hours, 2) || ' hours')::INTERVAL
              )
              OR
              -- Completed instance: restart after cooldown (unless never_restart_after_completion is true)
              (
                EXISTS (
                  SELECT 1 FROM dungeon_crawl_instances i
                  WHERE i.crawl_id = c.id
                    AND i.status = 'completed'
                    AND i.completed_at IS NOT NULL
                    AND i.completed_at <= NOW() - (COALESCE(c.cooldown_hours, c.cooldown_days * 24, 168) || ' hours')::INTERVAL
                )
                AND COALESCE(c.never_restart_after_completion, FALSE) = FALSE
              )
            )
        `,
        [now.toISOString()]
      )

      let restarted = 0

      for (const crawl of crawlsToRestart.rows) {
        // Check if there's already an active instance (race condition check)
        const activeCheck = await client.query(
          `SELECT 1 FROM dungeon_crawl_instances 
           WHERE crawl_id = $1 AND status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
           LIMIT 1`,
          [crawl.id]
        )

        if (activeCheck.rows.length > 0) {
          continue // Already has active instance
        }

        // Create new instance
        console.log(`[cron/dungeon-crawl-restart] 🔄 Creating new instance for crawl ${crawl.id}`)
        console.log(`[cron/dungeon-crawl-restart] 📝 EXECUTING INSERT: INSERT INTO dungeon_crawl_instances (crawl_id, status) VALUES ('${crawl.id}', 'open')`)
        const instanceResult = await client.query(
          `
            INSERT INTO dungeon_crawl_instances (crawl_id, status)
            VALUES ($1, 'open')
            RETURNING id, crawl_id, status, created_at
          `,
          [crawl.id]
        )
        console.log(`[cron/dungeon-crawl-restart] 📊 INSERT RESULT: rowCount=${instanceResult.rowCount}, rows=${JSON.stringify(instanceResult.rows)}`)
        
        if (instanceResult.rows.length > 0) {
          const instance = instanceResult.rows[0]
          console.log(`[cron/dungeon-crawl-restart] ✅ INSERTED instance ${instance.id} for crawl ${crawl.id} - status: ${instance.status}, created_at: ${instance.created_at}`)
          restarted++
        } else {
          console.log(`[cron/dungeon-crawl-restart] ⚠️ Failed to create instance for crawl ${crawl.id} - INSERT returned no rows`)
        }
      }

      // Rewards are now permanent, so no cleanup needed

      return NextResponse.json({
        success: true,
        message: `Restarted ${restarted} dungeon crawl(s)`,
        restarted,
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[cron/dungeon-crawl-restart]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to restart dungeon crawls' },
      { status: 500 }
    )
  }
}

