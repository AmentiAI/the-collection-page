import { Pool, PoolClient } from 'pg'
import { getPool } from './db'

const DEFAULT_REWARD_POINTS = Number.isFinite(Number(process.env.DUALITY_PAIR_REWARD_POINTS))
  ? Math.max(1, Number(process.env.DUALITY_PAIR_REWARD_POINTS))
  : 15

type PairRow = {
  id: string
  cycle_id: string
  good_participant_id: string
  evil_participant_id: string
  fate_meter: number | null
  status: string
  window_start: string | null
  window_end: string | null
  cooldown_minutes: number | null
  completed_at: string | null
  created_at: string | null
  updated_at: string | null
  good_checkin_at: string | null
  evil_checkin_at: string | null
  reward_status: string | null
  reward_processed_at: string | null
  reward_points_good: number | null
  reward_points_evil: number | null
  failure_reason: string | null
}

type ParticipantRow = {
  id: string
  cycle_id: string
  profile_id: string
  alignment: 'good' | 'evil'
  discord_user_id: string | null
}

const ALTER_STATEMENTS = [
  `ALTER TABLE duality_pairs ADD COLUMN IF NOT EXISTS good_checkin_at TIMESTAMPTZ`,
  `ALTER TABLE duality_pairs ADD COLUMN IF NOT EXISTS evil_checkin_at TIMESTAMPTZ`,
  `ALTER TABLE duality_pairs ADD COLUMN IF NOT EXISTS reward_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE duality_pairs ADD COLUMN IF NOT EXISTS reward_processed_at TIMESTAMPTZ`,
  `ALTER TABLE duality_pairs ADD COLUMN IF NOT EXISTS reward_points_good INTEGER DEFAULT 0`,
  `ALTER TABLE duality_pairs ADD COLUMN IF NOT EXISTS reward_points_evil INTEGER DEFAULT 0`,
  `ALTER TABLE duality_pairs ADD COLUMN IF NOT EXISTS failure_reason TEXT`,
]

export async function ensureDualitySchema(pool?: Pool) {
  const db = pool ?? getPool()
  for (const statement of ALTER_STATEMENTS) {
    await db.query(statement)
  }
  await db.query(
    `UPDATE duality_pairs SET reward_status = 'pending' WHERE reward_status IS NULL`,
  )
}

export async function completeDualityPairSuccess(
  client: PoolClient,
  pair: PairRow,
  options: { reason?: string } = {},
) {
  const rewardPoints = DEFAULT_REWARD_POINTS
  const participantIds = [pair.good_participant_id, pair.evil_participant_id]
  const participantRes = await client.query<ParticipantRow>(
    `SELECT dp.id, dp.cycle_id, dp.profile_id, dp.alignment, du.discord_user_id
     FROM duality_participants dp
     JOIN profiles p ON dp.profile_id = p.id
     LEFT JOIN discord_users du ON du.profile_id = p.id
     WHERE dp.id = ANY($1::uuid[])`,
    [participantIds],
  )

  const participants = participantRes.rows
  if (participants.length !== participantIds.length) {
    throw new Error('Unable to load Duality participants for reward processing')
  }

  let goodCount = 0
  let evilCount = 0

  const now = new Date()
  const cooldownMinutes = Number.isFinite(Number(pair.cooldown_minutes))
    ? Number(pair.cooldown_minutes)
    : 60
  const cooldownEnds = new Date(now.getTime() + cooldownMinutes * 60 * 1000)

  for (const participant of participants) {
    const pointsType = participant.alignment === 'evil' ? 'evil' : 'good'
    if (pointsType === 'good') {
      goodCount += 1
    } else {
      evilCount += 1
    }
    await client.query(
      `INSERT INTO karma_points (profile_id, points, type, reason, given_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        participant.profile_id,
        rewardPoints,
        pointsType,
        `Duality pairing success (${pointsType})`,
        'duality-checkin',
      ],
    )
  }

  await client.query(
    `UPDATE duality_participants
     SET current_pair_id = NULL,
         ready_for_pairing = false,
         next_available_at = $2,
         participation_count = participation_count + 1,
         updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [participantIds, cooldownEnds.toISOString()],
  )

  await client.query(
    `UPDATE duality_pairs
     SET status = 'completed',
         completed_at = NOW(),
         reward_status = 'awarded',
         reward_processed_at = NOW(),
         reward_points_good = $2,
         reward_points_evil = $3,
         failure_reason = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [
      pair.id,
      goodCount * rewardPoints,
      evilCount * rewardPoints,
    ],
  )

  return {
    rewardPoints,
    cooldownEnds: cooldownEnds.toISOString(),
    reason: options.reason ?? null,
  }
}

export async function failDualityPair(
  client: PoolClient,
  pair: PairRow,
  options: { reason?: string; cooldownMinutes?: number } = {},
) {
  const participantIds = [pair.good_participant_id, pair.evil_participant_id]
  const cooldownMinutes = Number.isFinite(Number(options.cooldownMinutes))
    ? Number(options.cooldownMinutes)
    : Number.isFinite(Number(pair.cooldown_minutes))
    ? Number(pair.cooldown_minutes)
    : 60
  const now = new Date()
  const cooldownEnds = new Date(now.getTime() + cooldownMinutes * 60 * 1000)

  await client.query(
    `UPDATE duality_participants
     SET current_pair_id = NULL,
         ready_for_pairing = false,
         next_available_at = $2,
         updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [participantIds, cooldownEnds.toISOString()],
  )

  await client.query(
    `UPDATE duality_pairs
     SET status = 'expired',
         reward_status = 'missed',
         reward_processed_at = NOW(),
         reward_points_good = 0,
         reward_points_evil = 0,
         failure_reason = $2,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [pair.id, options.reason ?? 'Window expired without both check-ins'],
  )

  return {
    cooldownEnds: cooldownEnds.toISOString(),
    reason: options.reason ?? 'Window expired without both check-ins',
  }
}


