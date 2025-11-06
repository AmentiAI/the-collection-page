import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Complete a task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, taskId, proof } = body
    
    if (!walletAddress || !taskId) {
      return NextResponse.json(
        { error: 'walletAddress and taskId are required' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    
    // Get or create profile
    let profileResult = await pool.query(
      'SELECT id FROM profiles WHERE wallet_address = $1',
      [walletAddress]
    )
    
    if (profileResult.rows.length === 0) {
      const insertResult = await pool.query(
        'INSERT INTO profiles (wallet_address) VALUES ($1) RETURNING id',
        [walletAddress]
      )
      profileResult = insertResult
    }
    
    const profileId = profileResult.rows[0].id
    
    // Check if task exists and get details
    const taskResult = await pool.query(
      'SELECT * FROM karma_tasks WHERE id = $1 AND is_active = true',
      [taskId]
    )
    
    if (taskResult.rows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    const task = taskResult.rows[0]
    const proofRequired = !!task.proof_required
    
    if (proofRequired && (!proof || typeof proof !== 'string')) {
      return NextResponse.json({ error: 'Proof is required for this task' }, { status: 400 })
    }
    
    // Check if already completed
    const existingCompletion = await pool.query(
      'SELECT id FROM user_task_completions WHERE profile_id = $1 AND task_id = $2',
      [profileId, taskId]
    )
    
    if (existingCompletion.rows.length > 0) {
      return NextResponse.json({ error: 'Task already completed' }, { status: 400 })
    }
    
    // Record completion
    const completionResult = await pool.query(
      `INSERT INTO user_task_completions (profile_id, task_id, proof)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [profileId, taskId, proofRequired ? proof : proof || null]
    )
    
    // Award karma points
    const pointsValue = task.type === 'evil' ? -Math.abs(task.points) : Math.abs(task.points)
    
    const karmaResult = await pool.query(
      `INSERT INTO karma_points (profile_id, points, type, reason, given_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [profileId, pointsValue, task.type, `Completed task: ${task.title}`, 'system']
    )
    
    // Link karma points to completion
    await pool.query(
      'UPDATE user_task_completions SET karma_points_id = $1 WHERE id = $2',
      [karmaResult.rows[0].id, completionResult.rows[0].id]
    )
    
    // Get updated profile
    const updatedProfile = await pool.query(
      'SELECT * FROM profiles WHERE id = $1',
      [profileId]
    )
    
    return NextResponse.json({
      completion: completionResult.rows[0],
      karmaAwarded: pointsValue,
      profile: updatedProfile.rows[0]
    })
  } catch (error) {
    console.error('Task completion error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


