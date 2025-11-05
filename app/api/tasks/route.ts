import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Get tasks
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') // 'good' or 'bad'
    const includeCompleted = searchParams.get('includeCompleted') === 'true'
    const walletAddress = searchParams.get('walletAddress')
    
    const pool = getPool()
    
    let query = 'SELECT * FROM karma_tasks WHERE is_active = true'
    const params: any[] = []
    
    if (type && (type === 'good' || type === 'bad')) {
      query += ` AND type = $${params.length + 1}`
      params.push(type)
    }
    
    query += ' ORDER BY points DESC, created_at DESC'
    
    const result = await pool.query(query, params)
    let tasks = result.rows
    
    // If wallet address provided, check which tasks are completed
    if (walletAddress && includeCompleted) {
      const profileResult = await pool.query(
        'SELECT id FROM profiles WHERE wallet_address = $1',
        [walletAddress]
      )
      
      if (profileResult.rows.length > 0) {
        const profileId = profileResult.rows[0].id
        const completionsResult = await pool.query(
          'SELECT task_id FROM user_task_completions WHERE profile_id = $1',
          [profileId]
        )
        
        const completedTaskIds = new Set(completionsResult.rows.map((r: any) => r.task_id))
        
        tasks = tasks.map((task: any) => ({
          ...task,
          isCompleted: completedTaskIds.has(task.id)
        }))
      }
    }
    
    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('Tasks fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Create task (admin function)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, type, points, category, createdBy } = body
    
    if (!title || !type || !points) {
      return NextResponse.json(
        { error: 'title, type, and points are required' },
        { status: 400 }
      )
    }
    
    if (type !== 'good' && type !== 'bad') {
      return NextResponse.json(
        { error: 'type must be "good" or "bad"' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const result = await pool.query(
      `INSERT INTO karma_tasks (title, description, type, points, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description || null, type, points, category || null, createdBy || null]
    )
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Task creation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


