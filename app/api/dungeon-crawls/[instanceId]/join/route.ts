import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { upsertCrawlTiming } from '@/lib/dungeon-crawl-timing'

export const dynamic = 'force-dynamic'

const AFK_CIRCLE_ID = '00000000-0000-0000-0000-000000000000'

export async function POST(
  request: NextRequest,
  { params }: { params: { instanceId: string } },
) {
  const pool = getPool()
  try {
    const body = await request.json().catch(() => ({}))
    const { wallet, inscriptionIds } = body

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'wallet is required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(inscriptionIds) || inscriptionIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'inscriptionIds array is required' },
        { status: 400 }
      )
    }

    const { instanceId } = params
    if (!instanceId) {
      return NextResponse.json(
        { success: false, error: 'Missing instanceId' },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get instance with crawl config
      const instanceRes = await client.query(
        `
          SELECT 
            i.*,
            c.required_participants,
            c.allow_multiple_from_stock,
            c.allowed_traits,
            c.min_participation_percent
          FROM dungeon_crawl_instances i
          JOIN dungeon_crawls c ON c.id = i.crawl_id
          WHERE i.id = $1
          FOR UPDATE OF i
        `,
        [instanceId]
      )

      if (instanceRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'Dungeon crawl instance not found' },
          { status: 404 }
        )
      }

      const instance = instanceRes.rows[0]
      const crawl = {
        requiredParticipants: Number(instance.required_participants),
        allowMultipleFromStock: Boolean(instance.allow_multiple_from_stock),
        allowedTraits: instance.allowed_traits || 'all',
        minParticipationPercent: Number(instance.min_participation_percent),
      }

      // Explicitly reject failed, completed, or expired instances
      if (['failed', 'completed', 'expired'].includes(instance.status)) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: `This dungeon crawl instance is ${instance.status} and cannot accept participants` },
          { status: 409 }
        )
      }

      if (!['open', 'filling', 'ready'].includes(instance.status)) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'This dungeon crawl is not accepting participants' },
          { status: 409 }
        )
      }

      // Check current participant count
      const participantCountRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM dungeon_crawl_participants WHERE instance_id = $1 AND archived_at IS NULL`,
        [instanceId]
      )
      const currentCount = participantCountRes.rows[0]?.count ?? 0

      // Check if inscriptions are already in this instance
      const existingInscriptions = await client.query(
        `SELECT inscription_id FROM dungeon_crawl_participants 
         WHERE instance_id = $1 AND inscription_id = ANY($2) AND archived_at IS NULL`,
        [instanceId, inscriptionIds]
      )

      if (existingInscriptions.rows.length > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: `Some inscriptions are already in this dungeon crawl`,
            existingInscriptions: existingInscriptions.rows.map((r) => r.inscription_id),
          },
          { status: 409 }
        )
      }

      // Check if inscriptions are in AFK circle
      const afkCheck = await client.query(
        `SELECT 1 FROM afk_circle_participants 
         WHERE circle_id = $1 AND inscription_id = ANY($2) LIMIT 1`,
        [AFK_CIRCLE_ID, inscriptionIds]
      )

      if (afkCheck.rows.length > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: 'Some inscriptions are in the AFK circle. Remove them first.',
          },
          { status: 409 }
        )
      }

      // Check if inscriptions are dead (life_force = 0 or is_dead = true)
      const deadCheck = await client.query(
        `
          SELECT inscription_id, life_force, is_dead
          FROM battle_ordinals
          WHERE inscription_id = ANY($1)
            AND (life_force = 0 OR is_dead = true)
        `,
        [inscriptionIds]
      )

      if (deadCheck.rows.length > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: 'Cannot join dungeon crawl with dead ordinals. Please resurrect them first.',
            deadInscriptions: deadCheck.rows.map((r) => r.inscription_id),
          },
          { status: 409 }
        )
      }

      // Check if inscriptions are in other active dungeon crawls
      const otherCrawlCheck = await client.query(
        `
          SELECT dcp.inscription_id
          FROM dungeon_crawl_participants dcp
          JOIN dungeon_crawl_instances dci ON dci.id = dcp.instance_id
          WHERE dcp.inscription_id = ANY($1)
            AND dci.status IN ('open', 'filling', 'ready', 'level_1', 'level_2', 'level_3')
            AND dci.id != $2
            AND dcp.archived_at IS NULL
          LIMIT 1
        `,
        [inscriptionIds, instanceId]
      )

      if (otherCrawlCheck.rows.length > 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: 'Some inscriptions are already in another active dungeon crawl',
          },
          { status: 409 }
        )
      }

      // If not allowing multiple from stock, check if wallet already has inscriptions in this instance
      if (!crawl.allowMultipleFromStock) {
        const walletCheck = await client.query(
          `SELECT 1 FROM dungeon_crawl_participants 
           WHERE instance_id = $1 AND LOWER(wallet) = LOWER($2) AND archived_at IS NULL LIMIT 1`,
          [instanceId, wallet]
        )

        if (walletCheck.rows.length > 0) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            {
              success: false,
              error: 'You already have inscriptions in this dungeon crawl',
            },
            { status: 409 }
          )
        }
      }

      // Check if adding these would exceed capacity
      const newCount = currentCount + inscriptionIds.length
      if (newCount > crawl.requiredParticipants) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: `Adding ${inscriptionIds.length} inscriptions would exceed the limit of ${crawl.requiredParticipants}`,
            currentCount,
            required: crawl.requiredParticipants,
          },
          { status: 409 }
        )
      }

      // First, check database for existing traits (faster and more reliable)
      const dbTraitRes = await client.query(
        `
          SELECT inscription_id, trait
          FROM battle_ordinals
          WHERE inscription_id = ANY($1)
        `,
        [inscriptionIds]
      )
      
      const dbTraits: Record<string, { trait?: 'Angelic' | 'Demonic' }> = {}
      for (const row of dbTraitRes.rows) {
        dbTraits[row.inscription_id] = {
          trait: row.trait as 'Angelic' | 'Demonic' | undefined,
        }
      }
      
      // Fetch inscription data from Magic Eden API to get traits and images for missing ones
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      
      let inscriptionData: Record<string, { trait?: 'Angelic' | 'Demonic', image?: string }> = { ...dbTraits }
      
      // Only fetch from Magic Eden for inscriptions missing traits or images
      const missingTraitIds = inscriptionIds.filter(id => !inscriptionData[id]?.trait)
      
      if (missingTraitIds.length > 0) {
        try {
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
            
            for (const token of tokens) {
              const inscriptionId = token.id || token.inscriptionId
              if (!inscriptionId || !missingTraitIds.includes(inscriptionId)) continue

              let attributes: Array<{ trait_type?: string; traitType?: string; value?: string }> = []
              if (token.meta?.attributes) attributes = token.meta.attributes
              else if (token.metadata?.attributes) attributes = token.metadata.attributes
              else if (token.attributes) attributes = token.attributes

              const ascendedTrait = attributes.find(
                (attr) =>
                  (attr.trait_type === 'Ascended' || attr.traitType === 'Ascended') &&
                  (attr.value === 'Angelic' || attr.value === 'Demonic')
              )

              inscriptionData[inscriptionId] = {
                trait: ascendedTrait?.value as 'Angelic' | 'Demonic' | undefined,
                image: token.contentURI || token.imageURI || 
                  `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(inscriptionId)}`,
              }
            }
          }
        } catch (error) {
          console.error('Error fetching inscription data from Magic Eden:', error)
          // Continue with database traits only
        }
      }
      
      // Fill in missing images - use Magic Eden content URL as fallback
      for (const inscriptionId of inscriptionIds) {
        if (!inscriptionData[inscriptionId]) {
          inscriptionData[inscriptionId] = {}
        }
        if (!inscriptionData[inscriptionId].image) {
          inscriptionData[inscriptionId].image = `https://ord-mirror.magiceden.dev/content/${encodeURIComponent(inscriptionId)}`
        }
      }

      // Validate trait restrictions
      if (crawl.allowedTraits !== 'all') {
        const invalidInscriptions: string[] = []
        for (const inscriptionId of inscriptionIds) {
          const data = inscriptionData[inscriptionId]
          const trait = data?.trait
          
          if (!trait) {
            invalidInscriptions.push(inscriptionId)
            continue
          }
          
          if (crawl.allowedTraits === 'angelic' && trait !== 'Angelic') {
            invalidInscriptions.push(inscriptionId)
          } else if (crawl.allowedTraits === 'demonic' && trait !== 'Demonic') {
            invalidInscriptions.push(inscriptionId)
          }
        }
        
        if (invalidInscriptions.length > 0) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            {
              success: false,
              error: `This dungeon crawl only allows ${crawl.allowedTraits === 'angelic' ? 'Angelic' : 'Demonic'} ordinals. Some of your selected ordinals don't match.`,
              invalidInscriptions,
            },
            { status: 409 }
          )
        }
      }

      // Insert participants - use single query with multiple values for better performance
      // Use RETURNING to verify what was actually inserted
      const insertValues = inscriptionIds.map((inscriptionId, index) => {
        const data = inscriptionData[inscriptionId] || {}
        const paramIndex = index * 5
        return `($${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`
      }).join(', ')

      const insertParams: any[] = []
      inscriptionIds.forEach((inscriptionId) => {
        const data = inscriptionData[inscriptionId] || {}
        insertParams.push(instanceId, wallet, inscriptionId, data.image, data.trait)
      })

      const insertRes = await client.query(
          `
            INSERT INTO dungeon_crawl_participants 
            (instance_id, wallet, inscription_id, inscription_image, trait)
          VALUES ${insertValues}
            ON CONFLICT (instance_id, inscription_id) DO NOTHING
          RETURNING inscription_id
        `,
        insertParams
      )

      const actuallyInserted = insertRes.rows.length
      
      // If nothing was inserted, it means all inscriptions were already in the crawl
      if (actuallyInserted === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            success: false,
            error: 'All selected inscriptions are already in this dungeon crawl',
          },
          { status: 409 }
        )
      }

      // If only some were inserted, warn the user
      if (actuallyInserted < inscriptionIds.length) {
        const insertedIds = insertRes.rows.map((r: any) => r.inscription_id)
        const skippedIds = inscriptionIds.filter(id => !insertedIds.includes(id))
        console.warn(`[dungeon-crawls][join] Some inscriptions were skipped:`, skippedIds)
      }

      // Update instance status if full
      const updatedCountRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM dungeon_crawl_participants WHERE instance_id = $1 AND archived_at IS NULL`,
        [instanceId]
      )
      const updatedCount = updatedCountRes.rows[0]?.count ?? 0

      if (updatedCount >= crawl.requiredParticipants) {
        // Set status to 'ready' and calculate expires_at (10 minutes from now for 3 levels)
        // Also set level_1_started_at when instance becomes ready - this starts the timer
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
        const now = new Date()
        await client.query(
          `
            UPDATE dungeon_crawl_instances
            SET status = 'ready',
                level_1_started_at = COALESCE(level_1_started_at, NOW()),
                expires_at = $1,
                updated_at = NOW()
            WHERE id = $2
          `,
          [expiresAt.toISOString(), instanceId]
        )
        
        // Update timing table - Level 1 starts now
        await upsertCrawlTiming(client, instance.crawl_id, {
          instanceId,
          level1StartedAt: now,
          level1Active: true,
        })
      } else if (instance.status === 'open') {
        await client.query(
          `UPDATE dungeon_crawl_instances SET status = 'filling', updated_at = NOW() WHERE id = $1`,
          [instanceId]
        )
      }

      await client.query('COMMIT')

      const message = actuallyInserted === inscriptionIds.length
        ? `Joined dungeon crawl with ${actuallyInserted} inscription(s)`
        : `Joined dungeon crawl with ${actuallyInserted} of ${inscriptionIds.length} inscription(s) (some were already in the crawl)`

      return NextResponse.json({
        success: true,
        message,
        participantCount: updatedCount,
        required: crawl.requiredParticipants,
        actuallyInserted,
        requested: inscriptionIds.length,
      })
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {})
      }
      console.error('[dungeon-crawls][join]', error)
      return NextResponse.json(
        { success: false, error: 'Failed to join dungeon crawl' },
        { status: 500 }
      )
    } finally {
      if (client) {
        client.release()
      }
    }
  } catch (error) {
    console.error('[dungeon-crawls][join] Infrastructure error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to initialize infrastructure' },
      { status: 500 }
    )
  }
}

