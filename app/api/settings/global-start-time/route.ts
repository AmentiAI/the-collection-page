import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Public endpoint to check if global start time has passed
export async function GET(request: NextRequest) {
  let client
  try {
    client = await getPool().connect()

    const result = await client.query(
      `SELECT setting_value
       FROM global_settings
       WHERE setting_key = 'global_start_time'`
    )

    const globalStartTime = result.rows.length > 0 ? result.rows[0].setting_value : null

    // If no start time is set, pages are accessible
    if (!globalStartTime) {
      return NextResponse.json({
        success: true,
        isAccessible: true,
        globalStartTime: null,
        timeRemaining: null
      })
    }

    const startTime = new Date(globalStartTime)
    const now = new Date()
    const timeRemaining = startTime.getTime() - now.getTime()
    const isAccessible = timeRemaining <= 0

    return NextResponse.json({
      success: true,
      isAccessible,
      globalStartTime: globalStartTime,
      timeRemaining: isAccessible ? 0 : Math.max(0, timeRemaining),
      startTimeISO: startTime.toISOString()
    })
  } catch (error) {
    console.error('Error checking global start time:', error)
    // On error, allow access (fail open)
    return NextResponse.json({
      success: true,
      isAccessible: true,
      globalStartTime: null,
      timeRemaining: null
    })
  } finally {
    if (client) client.release()
  }
}

