import { NextResponse } from 'next/server'
import { getPoolStats } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Check database pool health
export async function GET() {
  try {
    const stats = getPoolStats()
    
    const health = {
      status: 'healthy',
      pool: {
        total: stats.total,
        idle: stats.idle,
        waiting: stats.waiting,
        active: stats.total - stats.idle,
        utilization: stats.total > 0 ? ((stats.total - stats.idle) / stats.total * 100).toFixed(1) + '%' : '0%'
      },
      timestamp: new Date().toISOString()
    }
    
    // Flag as warning if pool is heavily utilized
    if (stats.total - stats.idle >= stats.total * 0.8) {
      health.status = 'warning'
    }
    
    // Flag as critical if there are waiting requests
    if (stats.waiting > 0) {
      health.status = 'critical'
    }
    
    return NextResponse.json(health)
  } catch (error) {
    console.error('Database pool health check error:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

