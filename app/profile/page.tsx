'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'

const LaserEyesWrapper = dynamic(() => import('@/components/LaserEyesWrapper'), {
  ssr: false,
  loading: () => null,
})

type ProfileDetails = {
  username: string | null
  avatarUrl: string | null
  totalGoodKarma: number
  totalBadKarma: number
  chosenSide: 'good' | 'evil' | null
}

type SocialStatus = {
  linked: boolean
  identifier: string | null
  loading: boolean
}

type InventorySummary = {
  loading: boolean
  error: string | null
  tokenCount: number
  listedCount: number
}

type SummonParticipant = {
  id: string
  wallet: string
  inscriptionId: string
  role: string
  joinedAt: string
}

type SummonRecord = {
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

type SummonOverview = {
  created: SummonRecord[]
  joined: SummonRecord[]
  open: SummonRecord[]
}

const INITIAL_PROFILE: ProfileDetails = {
  username: null,
  avatarUrl: null,
  totalGoodKarma: 0,
  totalBadKarma: 0,
  chosenSide: null,
}

const INITIAL_SOCIAL: SocialStatus = {
  linked: false,
  identifier: null,
  loading: false,
}

const INITIAL_INVENTORY: InventorySummary = {
  loading: false,
  error: null,
  tokenCount: 0,
  listedCount: 0,
}

const INITIAL_SUMMON_OVERVIEW: SummonOverview = {
  created: [],
  joined: [],
  open: [],
}

export default function ProfilePage() {
  return (
    <LaserEyesWrapper>
      <ProfileContent />
    </LaserEyesWrapper>
  )
}

function ProfileContent() {
  const {
    connected,
    address,
    profile,
    discord,
    twitter,
    inventory,
    isHolder,
    executioner,
    bonusAllowance,
    summons,
    refreshProfile,
    triggerDiscordAuth,
    triggerTwitterAuth,
  } = useProfileState()

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <iframe
          className="absolute left-1/2 top-1/2 h-[120vh] w-[120vw] -translate-x-1/2 -translate-y-1/2"
          src="https://www.youtube.com/embed/6WxfleWs-Ck?autoplay=1&mute=1&loop=1&playlist=6WxfleWs-Ck&controls=0&modestbranding=1&showinfo=0&rel=0&playsinline=1"
          title="The Damned Background"
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80" />
      </div>

      <Header connected={connected} showMusicControls={false} />

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 md:px-8">
        <section className="flex flex-col items-center gap-6 rounded-3xl border border-red-600/40 bg-black/70 p-8 shadow-[0_0_30px_rgba(220,38,38,0.35)] backdrop-blur">
          <ProfileAvatar imageUrl={profile.avatarUrl} />
          <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-red-300 md:text-4xl">
            {profile.username ?? 'Unknown Damned'}
          </h1>
          <ProfileKarma profile={profile} />
          <ProfileStatuses
            connected={connected}
            inventory={inventory}
            isHolder={isHolder}
            executioner={executioner}
            bonusAllowance={bonusAllowance}
            summons={summons}
          />
          {!connected && (
            <p className="text-xs uppercase tracking-[0.35em] text-red-200/70">
              Connect your wallet via the header to update your profile.
            </p>
          )}
          {connected && (
            <Button
              type="button"
              variant="outline"
              className="rounded-full border border-red-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-200 hover:bg-red-600/20"
              onClick={refreshProfile}
            >
              Refresh Profile
            </Button>
          )}
        </section>

        <SummoningOverviewCard summons={summons} />

        <section className="grid gap-5 rounded-3xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.3)] backdrop-blur md:grid-cols-2">
          <ConnectDiscord
            status={discord}
            onConnect={triggerDiscordAuth}
            walletConnected={connected}
          />
          <ConnectTwitter
            status={twitter}
            onConnect={triggerTwitterAuth}
            walletConnected={connected}
          />
        </section>

        <section className="rounded-3xl border border-red-600/40 bg-black/60 p-6 shadow-[0_0_25px_rgba(220,38,38,0.3)] backdrop-blur">
          <h2 className="text-lg font-semibold uppercase tracking-[0.35em] text-red-200">Need Help?</h2>
          <p className="mt-2 text-sm text-red-200/70">
            Discord and Twitter authorization links open secure pop-ups. After completing authentication, you’ll land back here and see
            the connected status update automatically.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="https://discord.gg/vJ4yw9N55j"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-blue-500/60 px-4 py-2 text-sm uppercase tracking-[0.3em] text-blue-200 transition hover:bg-blue-500/15"
            >
              Join Discord
            </Link>
            <Link
              href="https://x.com/The__Damned__"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-blue-500/60 px-4 py-2 text-sm uppercase tracking-[0.3em] text-blue-200 transition hover:bg-blue-500/15"
            >
              Follow on X
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}

function ProfileAvatar({ imageUrl }: { imageUrl: string | null }) {
  return (
    <div className="relative h-32 w-32 overflow-hidden rounded-full border border-red-600/60 bg-black/70 shadow-[0_0_25px_rgba(220,38,38,0.45)]">
      {imageUrl ? (
        <Image src={imageUrl} alt="Discord avatar" fill sizes="128px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-4xl text-red-400">?</div>
      )}
    </div>
  )
}

function ProfileKarma({ profile }: { profile: ProfileDetails }) {
  const totalKarma = profile.totalGoodKarma - profile.totalBadKarma

  if (!profile.chosenSide) {
    return (
      <p className="text-sm uppercase tracking-[0.3em] text-red-200/70">
        Align with a side in duality to earn your first karma points.
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-900/30 px-6 py-4 text-center shadow-[0_0_25px_rgba(220,38,38,0.35)]">
      <p className="text-xs uppercase tracking-[0.35em] text-red-200/70">Karma Standing</p>
      <p className="text-3xl font-black text-red-400">{totalKarma}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-red-200/80">
        {profile.chosenSide ? `Aligned with ${profile.chosenSide.toUpperCase()}` : 'No alignment yet'}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-red-200/60">
        Good: {profile.totalGoodKarma} • Evil: {profile.totalBadKarma}
      </p>
    </div>
  )
}

function ProfileStatuses({
  connected,
  inventory,
  isHolder,
  executioner,
  bonusAllowance,
  summons,
}: {
  connected: boolean
  inventory: InventorySummary
  isHolder: boolean | null
  executioner: boolean | null
  bonusAllowance: number
  summons: SummonOverview
}) {
  if (!connected) {
    return null
  }

  const holderCard = (() => {
    if (inventory.loading) {
      return {
        value: 'Checking…',
        subtitle: 'Verifying damned holdings',
        tone: 'neutral' as const,
      }
    }
    if (inventory.error) {
      return {
        value: 'Unknown',
        subtitle: 'Unable to load holdings',
        tone: 'warning' as const,
      }
    }
    if (isHolder === true) {
      return {
        value: 'Holder',
        subtitle: `${inventory.tokenCount} damned ordinal${inventory.tokenCount === 1 ? '' : 's'} detected`,
        tone: 'success' as const,
      }
    }
    if (isHolder === false) {
      return {
        value: 'Not detected',
        subtitle: 'No damned ordinals in wallet',
        tone: 'warning' as const,
      }
    }
    return {
      value: 'Checking…',
      subtitle: 'Verifying damned holdings',
      tone: 'neutral' as const,
    }
  })()

  const listingsCard = (() => {
    if (inventory.loading) {
      return {
        value: 'Checking…',
        subtitle: 'Fetching marketplace activity',
        tone: 'neutral' as const,
      }
    }
    if (inventory.error) {
      return {
        value: 'Unknown',
        subtitle: 'Unable to load listings',
        tone: 'warning' as const,
      }
    }
    if (inventory.listedCount > 0) {
      return {
        value: `${inventory.listedCount}`,
        subtitle: 'Active marketplace listings',
        tone: 'danger' as const,
      }
    }
    return {
      value: '0',
      subtitle: 'No active listings',
      tone: 'success' as const,
    }
  })()

  const executionerCard = (() => {
    if (executioner === true) {
      return {
        value: 'Executioner',
        subtitle: 'Recorded on the abyssal ledger',
        tone: 'success' as const,
      }
    }
    if (executioner === false) {
      return {
        value: 'Not yet',
        subtitle: 'No abyss burns detected',
        tone: 'warning' as const,
      }
    }
    return {
      value: 'Checking…',
      subtitle: 'Scanning abyssal records',
      tone: 'neutral' as const,
    }
  })()

  const bonusCard = (() => {
    if (bonusAllowance > 0) {
      return {
        value: `${bonusAllowance}`,
        subtitle: 'Redeemable bonus burn(s) earned via summoning',
        tone: 'success' as const,
        href: '/abyss',
      }
    }
    return {
      value: '0',
      subtitle: 'Complete a summoning circle to earn a bonus burn',
      tone: 'neutral' as const,
      href: undefined,
    }
  })()

  const openCreated = summons.created.filter((entry) =>
    ['open', 'filling', 'ready'].includes(entry.status),
  )
  const activeJoined = summons.joined.filter((entry) =>
    ['open', 'filling', 'ready'].includes(entry.status),
  )
  const activeSummonsCount = openCreated.length + activeJoined.length

  const cards: Array<{
    title: string
    value: string
    subtitle: string
    tone: 'neutral' | 'success' | 'warning' | 'danger'
    href?: string
  }> = [
    { title: 'Holder Status', ...holderCard },
    { title: 'Marketplace Listings', ...listingsCard },
    { title: 'Executioner Role', ...executionerCard },
    { title: 'Bonus Burns', ...bonusCard },
  ]

  if (activeSummonsCount > 0) {
    cards.push({
      title: 'Active Summons',
      value: `${activeSummonsCount}`,
      subtitle: `${openCreated.length} created • ${activeJoined.length} joined`,
      tone: 'warning',
      href: '/abyss-summon',
    })
  }

  return (
    <div className="w-full space-y-3">
      {inventory.error && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-900/30 px-4 py-2 text-center text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200">
          {inventory.error}
        </div>
      )}
      {inventory.listedCount > 0 && !inventory.loading && (
        <div className="rounded-2xl border-2 border-red-600 bg-red-950/80 px-4 py-4 text-center text-xs font-mono uppercase tracking-[0.35em] text-red-100 shadow-[0_0_30px_rgba(220,38,38,0.55)]">
          Active listings detected! Remove your damned ordinals from the marketplace to maintain cover.
        </div>
      )}
      <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) =>
          card.href ? (
            <Link key={card.title} href={card.href} className="block h-full">
              <StatusCard
                title={card.title}
                value={card.value}
                subtitle={card.subtitle}
                tone={card.tone}
                interactive
              />
            </Link>
          ) : (
            <StatusCard
              key={card.title}
              title={card.title}
              value={card.value}
              subtitle={card.subtitle}
              tone={card.tone}
            />
          ),
        )}
      </div>
    </div>
  )
}

function StatusCard({
  title,
  value,
  subtitle,
  tone = 'neutral',
  interactive = false,
}: {
  title: string
  value: string
  subtitle?: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
  interactive?: boolean
}) {
  let borderClass = 'border-red-700/40'
  let bgClass = 'bg-black/50'
  let valueClass = 'text-red-100'
  let subtitleClass = 'text-red-200/60'

  if (tone === 'success') {
    borderClass = 'border-green-500/50'
    bgClass = 'bg-green-900/25'
    valueClass = 'text-green-300'
    subtitleClass = 'text-green-200/70'
  } else if (tone === 'warning') {
    borderClass = 'border-amber-500/50'
    bgClass = 'bg-amber-900/25'
    valueClass = 'text-amber-200'
    subtitleClass = 'text-amber-200/70'
  } else if (tone === 'danger') {
    borderClass = 'border-red-600/70'
    bgClass = 'bg-red-900/35'
    valueClass = 'text-red-200'
    subtitleClass = 'text-red-100/70'
  }

  return (
    <div
      className={`rounded-2xl ${borderClass} ${bgClass} px-4 py-4 text-center shadow-[0_0_18px_rgba(220,38,38,0.25)] ${
        interactive ? 'cursor-pointer transition hover:border-amber-400 hover:shadow-[0_0_25px_rgba(251,191,36,0.35)]' : ''
      }`}
    >
      <p className="text-xs uppercase tracking-[0.35em] text-red-200/70">{title}</p>
      <p className={`mt-2 text-xl font-black uppercase tracking-[0.3em] ${valueClass}`}>{value}</p>
      {subtitle ? (
        <p className={`mt-1 text-[10px] uppercase tracking-[0.3em] ${subtitleClass}`}>
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

function ConnectDiscord({
  status,
  onConnect,
  walletConnected,
}: {
  status: SocialStatus
  onConnect: () => void
  walletConnected: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-blue-500/40 bg-blue-900/20 p-6 shadow-[0_0_25px_rgba(59,130,246,0.35)]">
      <h2 className="text-lg font-semibold uppercase tracking-[0.3em] text-blue-200">Discord</h2>
      <p className="text-sm text-blue-100/80">
        Link your Discord to sync identity and display your avatar across the damned domains.
      </p>
      {status.linked ? (
        <div className="rounded-lg border border-blue-500/40 bg-blue-900/30 px-4 py-3 text-sm">
          Connected as <span className="font-mono text-blue-200">{status.identifier ?? 'Unknown'}</span>
        </div>
      ) : (
        <Button
          type="button"
          onClick={onConnect}
          disabled={!walletConnected || status.loading}
          className="w-full border border-blue-500 bg-blue-600/80 text-sm font-mono uppercase tracking-[0.3em] text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {status.loading ? 'Checking…' : walletConnected ? 'Connect Discord' : 'Connect Wallet First'}
        </Button>
      )}
    </div>
  )
}

function ConnectTwitter({
  status,
  onConnect,
  walletConnected,
}: {
  status: SocialStatus
  onConnect: () => void
  walletConnected: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-blue-400/40 bg-blue-900/20 p-6 shadow-[0_0_25px_rgba(37,99,235,0.35)]">
      <h2 className="text-lg font-semibold uppercase tracking-[0.3em] text-blue-200">Twitter / X</h2>
      <p className="text-sm text-blue-100/80">
        Bind your X handle to broadcast your allegiance and track social rituals.
      </p>
      {status.linked ? (
        <div className="rounded-lg border border-blue-400/40 bg-blue-900/30 px-4 py-3 text-sm">
          Connected as <span className="font-mono text-blue-200">{status.identifier ? `@${status.identifier}` : 'Unknown'}</span>
        </div>
      ) : (
        <Button
          type="button"
          onClick={onConnect}
          disabled={!walletConnected || status.loading}
          className="w-full border border-blue-500 bg-blue-600/80 text-sm font-mono uppercase tracking-[0.3em] text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {status.loading ? 'Checking…' : walletConnected ? 'Connect Twitter' : 'Connect Wallet First'}
        </Button>
      )}
    </div>
  )
}

function SummoningOverviewCard({ summons }: { summons: SummonOverview }) {
  const active = summons.created.filter((entry) => ['open', 'filling', 'ready'].includes(entry.status))
  const joined = summons.joined.filter((entry) => ['open', 'filling', 'ready'].includes(entry.status))
  const completedHosted = summons.created.filter((entry) => entry.status === 'completed').length
  const completedTouched = completedHosted + summons.joined.filter((entry) => entry.status === 'completed').length

  if (active.length === 0 && joined.length === 0) {
    return (
      <section className="space-y-4 rounded-3xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.3)] backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold uppercase tracking-[0.35em] text-red-200">Summoning Circles</h2>
          <Link
            href="/abyss-summon"
            className="text-[11px] font-mono uppercase tracking-[0.35em] text-amber-200 hover:text-amber-300"
          >
            Enter the Ritual
          </Link>
        </div>
        <div className="rounded-2xl border border-amber-400/40 bg-black/60 px-4 py-4 text-center text-[11px] uppercase tracking-[0.3em] text-amber-200/80">
          No circles yet. Gather four damned to unlock bonus burns.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4 rounded-3xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.3)] backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold uppercase tracking-[0.35em] text-red-200">Summoning Circles</h2>
          <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-red-200/70">
            Completed:&nbsp;
            <span className="text-red-200">{completedHosted}</span> hosted •{' '}
            <span className="text-red-200">{completedTouched}</span> total touched
          </p>
        </div>
        <Link
          href="/abyss-summon"
          className="text-[11px] font-mono uppercase tracking-[0.35em] text-amber-200 hover:text-amber-300"
        >
          View Ritual Hall
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {active.map((record) => (
          <Link
            key={record.id}
            href="/abyss-summon"
            className="rounded-2xl border border-amber-500/40 bg-amber-900/15 px-4 py-4 shadow-[0_0_18px_rgba(251,191,36,0.25)] transition hover:border-amber-400"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-200">Created</p>
            <p className="mt-1 text-lg font-black uppercase tracking-[0.3em] text-amber-100">
              {record.status.toUpperCase()}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-amber-200/70">
              {record.participants.length}/{record.requiredParticipants} participants
            </p>
          </Link>
        ))}
        {joined.map((record) => (
          <Link
            key={record.id}
            href="/abyss-summon"
            className="rounded-2xl border border-red-500/40 bg-red-900/20 px-4 py-4 shadow-[0_0_18px_rgba(220,38,38,0.25)] transition hover:border-red-400"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-200">Joined</p>
            <p className="mt-1 text-lg font-black uppercase tracking-[0.3em] text-red-100">
              {record.status.toUpperCase()}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-red-200/70">
              {record.participants.length}/{record.requiredParticipants} participants
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}

function useProfileState() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [profile, setProfile] = useState<ProfileDetails>(INITIAL_PROFILE)
  const [discord, setDiscord] = useState<SocialStatus>(INITIAL_SOCIAL)
  const [twitter, setTwitter] = useState<SocialStatus>(INITIAL_SOCIAL)
  const [inventory, setInventory] = useState<InventorySummary>(INITIAL_INVENTORY)
  const [isHolder, setIsHolder] = useState<boolean | null>(null)
  const [executioner, setExecutioner] = useState<boolean | null>(null)
  const [bonusAllowance, setBonusAllowance] = useState<number>(0)
  const [summons, setSummons] = useState<SummonOverview>(INITIAL_SUMMON_OVERVIEW)

  const fetchProfile = useCallback(
    async (wallet: string) => {
      try {
        const response = await fetch(`/api/profile?walletAddress=${encodeURIComponent(wallet)}`)
        const data = await response.json()
        setProfile({
          username: data.username ?? null,
          avatarUrl: data.avatar_url ?? null,
          totalGoodKarma: data.total_good_karma ?? 0,
          totalBadKarma: data.total_bad_karma ?? 0,
          chosenSide: data.chosen_side ?? null,
        })
      } catch (error) {
        console.error('Error fetching profile:', error)
      }
    },
    [],
  )

  const checkDiscordStatus = useCallback(
    async (wallet: string) => {
      setDiscord((prev) => ({ ...prev, loading: true }))
      try {
        const response = await fetch(`/api/profile/discord?walletAddress=${encodeURIComponent(wallet)}`)
        const data = await response.json()
        setDiscord({
          linked: data.linked ?? false,
          identifier: data.discordUsername ?? data.discordUserId ?? null,
          loading: false,
        })
      } catch (error) {
        console.error('Error checking Discord status:', error)
        setDiscord((prev) => ({ ...prev, loading: false }))
      }
    },
    [],
  )

  const checkTwitterStatus = useCallback(
    async (wallet: string) => {
      setTwitter((prev) => ({ ...prev, loading: true }))
      try {
        const response = await fetch(`/api/profile/twitter?walletAddress=${encodeURIComponent(wallet)}`)
        const data = await response.json()
        setTwitter({
          linked: data.linked ?? false,
          identifier: data.twitterUsername ?? data.twitterUserId ?? null,
          loading: false,
        })
      } catch (error) {
        console.error('Error checking Twitter status:', error)
        setTwitter((prev) => ({ ...prev, loading: false }))
      }
    },
    [],
  )

  const fetchInventory = useCallback(
    async (wallet: string) => {
      setInventory((prev) => ({ ...prev, loading: true, error: null }))
      setIsHolder(null)
      try {
        const response = await fetch(
          `/api/magic-eden?ownerAddress=${encodeURIComponent(wallet)}&collectionSymbol=the-damned&fetchAll=true`,
          {
            method: 'GET',
            headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
          },
        )

        if (!response.ok) {
          throw new Error(`Magic Eden request failed (${response.status})`)
        }

        const payload = await response.json().catch(() => ({ tokens: [] }))
        const rawTokens =
          Array.isArray(payload?.tokens) ? payload.tokens : Array.isArray(payload) ? payload : []

        let listedCount = 0
        for (const token of rawTokens as Array<Record<string, any>>) {
          const rawPrice = Number(
            token?.priceInfo?.price ?? token?.listingPrice ?? token?.price ?? token?.listing?.price ?? 0,
          )
          if (Number.isFinite(rawPrice) && rawPrice > 0) {
            listedCount += 1
          }
        }

        const tokenCount = rawTokens.length
        setInventory({
          loading: false,
          error: null,
          tokenCount,
          listedCount,
        })
        setIsHolder(tokenCount > 0)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load holdings'
        setInventory({
          loading: false,
          error: message,
          tokenCount: 0,
          listedCount: 0,
        })
        setIsHolder(null)
        console.error('Error fetching inventory:', error)
      }
    },
    [],
  )

  const fetchExecutionerStatus = useCallback(
    async (wallet: string) => {
      try {
        const response = await fetch(`/api/abyss/burns?includeLeaderboard=true`, {
          headers: { 'Cache-Control': 'no-store' },
        })
        if (!response.ok) {
          throw new Error(`Abyss leaderboard request failed (${response.status})`)
        }
        const data = await response.json()
        const leaderboard = Array.isArray(data?.leaderboard) ? data.leaderboard : []
        const normalizedWallet = wallet.toLowerCase()
        const match = leaderboard.some(
          (entry: Record<string, unknown>) =>
            typeof entry?.ordinalWallet === 'string' &&
            entry.ordinalWallet.toLowerCase() === normalizedWallet,
        )
        setExecutioner(match)
      } catch (error) {
        console.error('Error determining executioner status:', error)
        setExecutioner(null)
      }
    },
    [],
  )

  const fetchSummonSummary = useCallback(
    async (wallet: string) => {
      try {
        const response = await fetch(
          `/api/abyss/summons?wallet=${encodeURIComponent(wallet)}&limit=50`,
          {
            headers: { 'Cache-Control': 'no-store' },
          },
        )
        if (!response.ok) {
          throw new Error(`Summon summary request failed (${response.status})`)
        }
        const data = await response.json()
        const allowance = Number(data?.bonusAllowance ?? 0)
        setBonusAllowance(Number.isFinite(allowance) ? allowance : 0)

        const createdList = Array.isArray(data?.createdSummons)
          ? (data.createdSummons as SummonRecord[])
          : []
        const joinedList = Array.isArray(data?.joinedSummons)
          ? (data.joinedSummons as SummonRecord[])
          : []
        const createdIds = new Set(createdList.map((entry) => entry.id))
        const filteredJoined = joinedList.filter((entry) => !createdIds.has(entry.id))

        setSummons({
          created: createdList,
          joined: filteredJoined,
          open: Array.isArray(data?.summons) ? data.summons : [],
        })
      } catch (error) {
        console.error('Error fetching summon summary:', error)
        setBonusAllowance(0)
        setSummons(INITIAL_SUMMON_OVERVIEW)
      }
    },
    [],
  )

  const initializeProfile = useCallback(
    async (wallet: string) => {
      try {
        await fetch('/api/profile/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: wallet,
            paymentAddress: wallet,
          }),
        })
      } catch (error) {
        console.error('Failed to create profile:', error)
      }

      await Promise.all([
        fetchProfile(wallet),
        checkDiscordStatus(wallet),
        checkTwitterStatus(wallet),
        fetchInventory(wallet),
        fetchExecutionerStatus(wallet),
        fetchSummonSummary(wallet),
      ])
    },
    [
      fetchProfile,
      checkDiscordStatus,
      checkTwitterStatus,
      fetchInventory,
      fetchExecutionerStatus,
      fetchSummonSummary,
    ],
  )

  useEffect(() => {
    if (connected && address) {
      void initializeProfile(address)
    } else {
      setProfile(INITIAL_PROFILE)
      setDiscord(INITIAL_SOCIAL)
      setTwitter(INITIAL_SOCIAL)
      setInventory(INITIAL_INVENTORY)
      setIsHolder(null)
      setExecutioner(null)
      setBonusAllowance(0)
      setSummons(INITIAL_SUMMON_OVERVIEW)
    }
  }, [connected, address, initializeProfile])

  useEffect(() => {
    if (!address) return
    const params = new URLSearchParams(window.location.search)
    const discordAuth = params.get('discord_auth')
    const twitterAuth = params.get('twitter_auth')

    if (discordAuth === 'success') {
      void Promise.all([
        fetchProfile(address),
        checkDiscordStatus(address),
        fetchInventory(address),
        fetchSummonSummary(address),
      ])
      window.history.replaceState({}, '', '/profile')
    }

    if (twitterAuth === 'success') {
      void Promise.all([
        fetchProfile(address),
        checkTwitterStatus(address),
        fetchInventory(address),
        fetchSummonSummary(address),
      ])
      window.history.replaceState({}, '', '/profile')
    }
  }, [address, checkDiscordStatus, checkTwitterStatus, fetchProfile, fetchInventory, fetchSummonSummary])

  const triggerDiscordAuth = useCallback(() => {
    if (!connected || !address) {
      toast.warning('Connect your wallet first.')
      return
    }
    window.location.href = `/api/discord/auth?walletAddress=${encodeURIComponent(address)}`
  }, [connected, address, toast])

  const triggerTwitterAuth = useCallback(() => {
    if (!connected || !address) {
      toast.warning('Connect your wallet first.')
      return
    }
    window.location.href = `/api/twitter/auth?walletAddress=${encodeURIComponent(address)}`
  }, [connected, address, toast])

  return useMemo(
    () => ({
      connected: Boolean(connected && address),
      address,
      profile,
      discord,
      twitter,
      inventory,
      isHolder,
      executioner,
      bonusAllowance,
      summons,
      refreshProfile: () => {
        if (address) {
          void Promise.all([
            fetchProfile(address),
            checkDiscordStatus(address),
            checkTwitterStatus(address),
            fetchInventory(address),
            fetchExecutionerStatus(address),
            fetchSummonSummary(address),
          ])
        }
      },
      triggerDiscordAuth,
      triggerTwitterAuth,
    }),
    [
      connected,
      address,
      profile,
      discord,
      twitter,
      inventory,
      isHolder,
      executioner,
      bonusAllowance,
      summons,
      fetchProfile,
      checkDiscordStatus,
      checkTwitterStatus,
      fetchInventory,
      fetchExecutionerStatus,
      fetchSummonSummary,
      triggerDiscordAuth,
      triggerTwitterAuth,
    ],
  )
}

