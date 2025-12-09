import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET - Retrieve global settings
export async function GET(request: NextRequest) {
  let client
  try {
    const { searchParams } = request.nextUrl
    const key = searchParams.get('key')

    client = await getPool().connect()

    if (key) {
      // Get specific setting
      const result = await client.query(
        `SELECT setting_key, setting_value, description, updated_at
         FROM global_settings
         WHERE setting_key = $1`,
        [key]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Setting not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        setting: result.rows[0]
      })
    } else {
      // Get all settings
      const result = await client.query(
        `SELECT setting_key, setting_value, description, updated_at
         FROM global_settings
         ORDER BY setting_key`
      )

      return NextResponse.json({
        success: true,
        settings: result.rows
      })
    }
  } catch (error) {
    console.error('Error fetching global settings:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch global settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

// POST - Update or create a global setting
export async function POST(request: NextRequest) {
  let client
  try {
    const body = await request.json()
    const { key, value, description } = body

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Setting key is required' },
        { status: 400 }
      )
    }

    if (value === undefined || value === null) {
      return NextResponse.json(
        { success: false, error: 'Setting value is required' },
        { status: 400 }
      )
    }

    client = await getPool().connect()

    // Validate global_start_time if it's being set
    if (key === 'global_start_time') {
      const trimmedValue = String(value).trim()
      if (trimmedValue !== '') {
        // Validate ISO 8601 timestamp
        const timestamp = new Date(trimmedValue)
        if (isNaN(timestamp.getTime())) {
          return NextResponse.json(
            { success: false, error: 'Invalid timestamp format. Use ISO 8601 format (e.g., 2025-01-01T00:00:00Z)' },
            { status: 400 }
          )
        }
      }
    }

    // Upsert the setting
    const result = await client.query(
      `INSERT INTO global_settings (setting_key, setting_value, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET
         setting_value = EXCLUDED.setting_value,
         description = COALESCE(EXCLUDED.description, global_settings.description),
         updated_at = NOW()
       RETURNING setting_key, setting_value, description, updated_at`,
      [key, String(value).trim(), description || null]
    )

    return NextResponse.json({
      success: true,
      setting: result.rows[0],
      message: 'Setting updated successfully'
    })
  } catch (error) {
    console.error('Error updating global settings:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update global settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

