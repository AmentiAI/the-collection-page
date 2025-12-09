import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET: Fetch global settings
export async function GET(request: NextRequest) {
  let client
  try {
    client = await getPool().connect()

    const result = await client.query(
      `SELECT setting_key, setting_value, description, updated_at
       FROM global_settings
       WHERE setting_key = 'global_start_time'`
    )

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        globalStartTime: null,
        description: 'Global start time for all game pages. Pages are inaccessible until this time passes. NULL means no restriction.'
      })
    }

    const setting = result.rows[0]
    return NextResponse.json({
      success: true,
      globalStartTime: setting.setting_value,
      description: setting.description,
      updatedAt: setting.updated_at
    })
  } catch (error) {
    console.error('Error fetching global settings:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch settings'
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

// POST: Update global start time
export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { globalStartTime } = body

    // Validate date format if provided
    if (globalStartTime !== null && globalStartTime !== undefined) {
      const date = new Date(globalStartTime)
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Invalid date format' },
          { status: 400 }
        )
      }
    }

    client = await getPool().connect()

    // Upsert the setting
    await client.query(
      `INSERT INTO global_settings (setting_key, setting_value, description)
       VALUES ('global_start_time', $1, 'Global start time for all game pages. Pages are inaccessible until this time passes. NULL means no restriction.')
       ON CONFLICT (setting_key)
       DO UPDATE SET 
         setting_value = EXCLUDED.setting_value,
         updated_at = NOW()`,
      [globalStartTime || null]
    )

    return NextResponse.json({
      success: true,
      message: 'Global start time updated successfully',
      globalStartTime: globalStartTime || null
    })
  } catch (error) {
    console.error('Error updating global settings:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update settings'
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

