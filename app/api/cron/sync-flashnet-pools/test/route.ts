import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { ensureFlashnetTables } from '@/lib/flashnet'

export const dynamic = 'force-dynamic'

// Simple test endpoint to check if database and tables work
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const steps: string[] = []
  
  try {
    steps.push('Starting test...')
    
    steps.push('Step 1: Ensuring tables...')
    await ensureFlashnetTables()
    steps.push('Step 1: Complete')
    
    steps.push('Step 2: Getting database pool...')
    const db = getPool()
    steps.push('Step 2: Complete')
    
    steps.push('Step 3: Checking sync_state table...')
    const result = await db.query(`
      SELECT COUNT(*) as count FROM flashnet_sync_state
    `)
    steps.push(`Step 3: Complete - Found ${result.rows[0]?.count || 0} rows`)
    
    steps.push('Step 4: Checking pools table...')
    const poolsResult = await db.query(`
      SELECT COUNT(*) as count FROM flashnet_pools
    `)
    steps.push(`Step 4: Complete - Found ${poolsResult.rows[0]?.count || 0} pools`)
    
    const duration = Date.now() - startTime
    
    return NextResponse.json({
      success: true,
      steps,
      durationMs: duration,
      syncStateRows: result.rows[0]?.count || 0,
      poolsCount: poolsResult.rows[0]?.count || 0,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    steps.push(`ERROR after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      steps,
      durationMs: duration,
    }, { status: 500 })
  }
}

