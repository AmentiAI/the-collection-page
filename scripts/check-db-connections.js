#!/usr/bin/env node

/**
 * Check database connection pool health
 * Usage: node scripts/check-db-connections.js
 */

async function checkConnections() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  
  console.log('🔍 Checking database connection pool health...\n')
  
  try {
    const response = await fetch(`${baseUrl}/api/health/db-pool`)
    const data = await response.json()
    
    console.log('📊 Pool Statistics:')
    console.log(`  Status: ${getStatusEmoji(data.status)} ${data.status}`)
    console.log(`  Total connections: ${data.pool.total}`)
    console.log(`  Active connections: ${data.pool.active}`)
    console.log(`  Idle connections: ${data.pool.idle}`)
    console.log(`  Waiting requests: ${data.pool.waiting}`)
    console.log(`  Utilization: ${data.pool.utilization}`)
    console.log(`  Checked at: ${data.timestamp}\n`)
    
    if (data.status === 'critical') {
      console.log('⚠️  CRITICAL: Connection pool is exhausted!')
      console.log('   Actions:')
      console.log('   1. Check for long-running queries')
      console.log('   2. Look for connection leaks (missing client.release())')
      console.log('   3. Consider increasing pool size if database tier supports it\n')
    } else if (data.status === 'warning') {
      console.log('⚠️  WARNING: Connection pool is highly utilized')
      console.log('   Monitor closely for potential exhaustion\n')
    } else {
      console.log('✅ Connection pool is healthy\n')
    }
    
  } catch (error) {
    console.error('❌ Error checking connection pool:', error.message)
    console.error('   Make sure your application is running\n')
    process.exit(1)
  }
}

function getStatusEmoji(status) {
  switch (status) {
    case 'healthy': return '✅'
    case 'warning': return '⚠️'
    case 'critical': return '🔴'
    case 'error': return '❌'
    default: return '❓'
  }
}

checkConnections()

