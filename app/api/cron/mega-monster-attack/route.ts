import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  if (!cronSecret) {
    // In development, allow without secret
    return process.env.NODE_ENV === 'development'
  }
  
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  let client
  try {
    client = await getPool().connect()

    // Get all mega monsters
    const monstersResult = await client.query(
      'SELECT id FROM mega_monsters WHERE image_blob_url IS NOT NULL OR image_data IS NOT NULL'
    )
    const monsterCount = monstersResult.rows.length

    if (monsterCount === 0) {
      return NextResponse.json({
        success: true,
        message: 'No mega monsters to attack with',
        attacksProcessed: 0,
      })
    }

    // Get all armies that are ready for battle (not dead, not in sanctuary)
    const armiesResult = await client.query(`
      SELECT 
        bo.id,
        bo.wallet_address,
        bo.inscription_id,
        bo.life_force,
        bo.status
      FROM battle_ordinals bo
      WHERE bo.status = 'ready' 
        AND bo.is_dead = false
        AND bo.life_force > 0
    `)

    const armies = armiesResult.rows
    let attacksProcessed = 0
    let deaths = 0

    // Group armies by wallet to calculate angel/demon balance
    const armiesByWallet = new Map<string, typeof armies>()
    for (const army of armies) {
      const wallet = army.wallet_address.toLowerCase()
      if (!armiesByWallet.has(wallet)) {
        armiesByWallet.set(wallet, [])
      }
      armiesByWallet.get(wallet)!.push(army)
    }

    // Process each wallet's armies
    for (const [wallet, walletArmies] of armiesByWallet.entries()) {
      // Fetch ordinals from Magic Eden to get trait information
      let angelCount = 0
      let demonCount = 0
      
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        const magicEdenResponse = await fetch(
          `${baseUrl}/api/magic-eden?ownerAddress=${encodeURIComponent(wallet)}&collectionSymbol=the-damned&fetchAll=true`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          }
        )

        if (magicEdenResponse.ok) {
          const magicEdenData = await magicEdenResponse.json()
          const tokens = Array.isArray(magicEdenData.tokens) ? magicEdenData.tokens : []
          
          // Count angels and demons from ready armies
          const readyInscriptionIds = new Set(walletArmies.map(a => a.inscription_id))
          
          for (const token of tokens) {
            const inscriptionId = token.id || token.inscriptionId
            if (!inscriptionId || !readyInscriptionIds.has(inscriptionId)) continue
            
            // Get attributes
            let attributes: Array<{ trait_type?: string; traitType?: string; value?: string }> = []
            if (token.meta?.attributes) attributes = token.meta.attributes
            else if (token.metadata?.attributes) attributes = token.metadata.attributes
            else if (token.attributes) attributes = token.attributes
            
            const ascendedTrait = attributes.find(
              (attr) =>
                (attr.trait_type === 'Ascended' || attr.traitType === 'Ascended') &&
                (attr.value === 'Angelic' || attr.value === 'Demonic')
            )
            
            if (ascendedTrait?.value === 'Angelic') angelCount++
            else if (ascendedTrait?.value === 'Demonic') demonCount++
          }
        }
      } catch (error) {
        console.error(`Error fetching traits for wallet ${wallet}:`, error)
      }
      
      const baseDamage = 10 // Base damage per mega monster
      const totalDamage = baseDamage * monsterCount
      
      // Check if wallet has balanced army (equal angels/demons)
      const isBalanced = angelCount > 0 && demonCount > 0 && angelCount === demonCount
      
      // Reduce damage by 50% if balanced
      const damage = isBalanced ? Math.floor(totalDamage * 0.5) : totalDamage

      // Apply damage to each army
      for (const army of walletArmies) {
        const newLifeForce = Math.max(0, army.life_force - damage)
        const isNowDead = newLifeForce === 0

        await client.query(`
          UPDATE battle_ordinals
          SET 
            life_force = $1,
            is_dead = $2,
            death_time = CASE WHEN $2 = true AND is_dead = false THEN NOW() ELSE death_time END,
            updated_at = NOW()
          WHERE id = $3
        `, [newLifeForce, isNowDead, army.id])

        attacksProcessed++
        if (isNowDead && !army.is_dead) {
          deaths++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Mega monster attack completed',
      monsterCount,
      attacksProcessed,
      deaths,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error processing mega monster attack:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  } finally {
    if (client) client.release()
  }
}

