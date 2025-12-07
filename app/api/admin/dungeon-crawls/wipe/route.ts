import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// DELETE - Wipe all dungeon crawl data (for testing/cleanup)
export async function DELETE(request: NextRequest) {
  const pool = getPool()
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Helper function to safely delete from a table if it exists
      const safeDelete = async (tableName: string) => {
        try {
          const tableExists = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = $1
            )
          `, [tableName])
          
          if (tableExists.rows[0]?.exists) {
            await client.query(`DELETE FROM ${tableName}`)
            return true
          }
          return false
        } catch (error) {
          console.warn(`Table ${tableName} may not exist or error deleting:`, error)
          return false
        }
      }

      // Delete in order to respect foreign key constraints
      // Try to delete from all tables, but don't fail if they don't exist
      await safeDelete('dungeon_crawl_reward_items')
      await safeDelete('dungeon_crawl_rewards')
      await safeDelete('dungeon_crawl_participants')
      await safeDelete('dungeon_crawl_instances')
      await safeDelete('dungeon_crawls')

      await client.query('COMMIT')

      // Verify cleanup (only check tables that exist)
      const counts: Record<string, number> = {}
      const tablesToCheck = [
        'dungeon_crawls',
        'dungeon_crawl_instances',
        'dungeon_crawl_participants',
        'dungeon_crawl_rewards',
        'dungeon_crawl_reward_items',
      ]

      for (const table of tablesToCheck) {
        try {
          const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`)
          counts[table] = Number(result.rows[0]?.count || 0)
        } catch (error) {
          // Table doesn't exist, set count to 0
          counts[table] = 0
        }
      }

      return NextResponse.json({
        success: true,
        message: 'All dungeon crawl data wiped successfully',
        counts,
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[admin/dungeon-crawls/wipe][DELETE]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to wipe dungeon crawl data' },
      { status: 500 }
    )
  }
}

