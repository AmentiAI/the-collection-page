import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Get tasks
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') // 'good' or 'evil'
    const includeCompleted = searchParams.get('includeCompleted') === 'true'
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const walletAddress = searchParams.get('walletAddress')
    
    const pool = getPool()
    
    let query = 'SELECT * FROM karma_tasks'
    const params: any[] = []
    const conditions: string[] = []
    
    if (!includeInactive) {
      conditions.push('is_active = true')
    }
    
    if (type && (type === 'good' || type === 'evil')) {
      conditions.push(`type = $${params.length + 1}`)
      params.push(type)
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
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
    const { title, description, type, points, category, createdBy, proofRequired, requiredPlatform } = body
    
    if (!title || !type || !points) {
      return NextResponse.json(
        { error: 'title, type, and points are required' },
        { status: 400 }
      )
    }
    
    if (type !== 'good' && type !== 'evil') {
      return NextResponse.json(
        { error: 'type must be "good" or "evil"' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const result = await pool.query(
      `INSERT INTO karma_tasks (title, description, type, points, category, proof_required, required_platform, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        title,
        description || null,
        type,
        points,
        category || null,
        proofRequired ?? false,
        requiredPlatform ?? null,
        createdBy || null
      ]
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

// Update task (admin function)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, title, description, type, points, category, isActive, proofRequired, requiredPlatform } = body
    
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    
    const pool = getPool()
    
    // Build dynamic update query based on provided fields
    const fields: string[] = []
    const values: any[] = []
    let index = 1
    
    if (title !== undefined) {
      fields.push(`title = $${index++}`)
      values.push(title)
    }
    if (description !== undefined) {
      fields.push(`description = $${index++}`)
      values.push(description)
    }
    if (type !== undefined) {
      if (type !== 'good' && type !== 'evil') {
        return NextResponse.json({ error: 'type must be "good" or "evil"' }, { status: 400 })
      }
      fields.push(`type = $${index++}`)
      values.push(type)
    }
    if (points !== undefined) {
      fields.push(`points = $${index++}`)
      values.push(points)
    }
    if (category !== undefined) {
      fields.push(`category = $${index++}`)
      values.push(category)
    }
    if (isActive !== undefined) {
      fields.push(`is_active = $${index++}`)
      values.push(isActive)
    }
    if (proofRequired !== undefined) {
      fields.push(`proof_required = $${index++}`)
      values.push(!!proofRequired)
    }
    if (requiredPlatform !== undefined) {
      fields.push(`required_platform = $${index++}`)
      values.push(requiredPlatform)
    }
    
    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }
    
    fields.push(`updated_at = NOW()`)
    
    values.push(id)
    
    const query = `UPDATE karma_tasks SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`
    const result = await pool.query(query, values)
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Task update error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

// Delete task (admin function)
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    
    const pool = getPool()
    const result = await pool.query(
      'DELETE FROM karma_tasks WHERE id = $1 RETURNING *',
      [id]
    )
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Task deletion error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}


