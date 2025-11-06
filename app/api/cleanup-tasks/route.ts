import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const pool = getPool()
    
    // Remove all placeholder karma tasks (keep only Trial Win and Trial Loss)
    const placeholderTasks = [
      'Help a community member',
      'Share quality content',
      'Report a bug',
      'Create fan art',
      'Organize community event',
      'Mentor new member',
      'Translation contribution',
      'Social media promotion',
      'Spam in channels',
      'Harassment',
      'Scam attempt',
      'Spread misinformation',
      'Violate community rules',
      'Toxic behavior'
    ]
    
    // Delete placeholder tasks
    let deletedCount = 0
    for (const taskTitle of placeholderTasks) {
      const result = await pool.query(
        "DELETE FROM karma_tasks WHERE title = $1",
        [taskTitle]
      )
      deletedCount += result.rowCount || 0
    }
    
    // Ensure Trial Win exists
    const trialWinCheck = await pool.query(
      "SELECT id FROM karma_tasks WHERE title = 'Trial Win' AND type = 'good'"
    )
    if (trialWinCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO karma_tasks (title, description, type, points, category, is_active, proof_required, required_platform)
        VALUES ('Trial Win', 'Win a trial or challenge', 'good', 10, 'Trial', true, false, NULL)
      `)
    } else {
      await pool.query(`
        UPDATE karma_tasks 
        SET description = 'Win a trial or challenge', points = 10, category = 'Trial', is_active = true, proof_required = false, required_platform = NULL
        WHERE title = 'Trial Win' AND type = 'good'
      `)
    }
    
    // Ensure Trial Loss exists
    const trialLossCheck = await pool.query(
      "SELECT id FROM karma_tasks WHERE title = 'Trial Loss' AND type = 'evil'"
    )
    if (trialLossCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO karma_tasks (title, description, type, points, category, is_active, proof_required, required_platform)
        VALUES ('Trial Loss', 'Lose a trial or challenge', 'evil', -10, 'Trial', true, false, NULL)
      `)
    } else {
      await pool.query(`
        UPDATE karma_tasks 
        SET description = 'Lose a trial or challenge', points = -10, category = 'Trial', is_active = true, proof_required = false, required_platform = NULL
        WHERE title = 'Trial Loss' AND type = 'evil'
      `)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Cleaned up tasks. Deleted ${deletedCount} placeholder tasks.`,
      deletedCount 
    })
  } catch (error) {
    console.error('Cleanup tasks error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

