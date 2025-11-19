export type SummonParticipant = {
  id: string
  wallet: string
  inscriptionId: string
  role: string
  image?: string | null
  joinedAt?: string | null
  completed?: boolean
  completedAt?: string | null
  username?: string | null
  avatarUrl?: string | null
}

export type SummonRecord = {
  id: string
  creatorWallet: string
  creatorInscriptionId: string
  status: string
  requiredParticipants: number
  lockedAt?: string | null
  completedAt?: string | null
  expiresAt?: string | null
  bonusGranted: boolean
  createdAt: string
  updatedAt: string
  participants: SummonParticipant[]
}

export type DamnedOption = {
  inscriptionId: string
  name?: string | null
  image?: string | null
}

export type SummonLeaderboardEntry = {
  wallet: string
  username: string | null
  avatarUrl: string | null
  burns: number
  confirmedBurns: number
  hosted: number
  participated: number
  score: number
  lastBurnAt: string | null
  lastHostedAt: string | null
  lastParticipatedAt: string | null
}

export type Mode = 'abyss' | 'powder' | 'damned_pool' | 'dead_demons' | 'afk'
export type ActiveTab = 'active' | 'created' | 'joined'

