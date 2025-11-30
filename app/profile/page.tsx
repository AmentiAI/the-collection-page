'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BookOpen, Flame, Loader2, Skull, Trophy } from 'lucide-react'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { useLaserEyes } from '@omnisat/lasereyes'
import { useToast } from '@/components/Toast'
import TotalSacrifices from '@/components/TotalSacrifices'
import LinkedWalletsManager from '../components/LinkedWalletsManager'
import { getCachedRequest, invalidateCache } from '@/lib/request-cache'

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

type GraveyardEntry = {
  inscriptionId: string
  txId: string
  status: string
  source: string
  createdAt?: string | null
  confirmedAt?: string | null
  updatedAt?: string | null
}

type SummonOverview = {
  created: SummonRecord[]
  joined: SummonRecord[]
  open: SummonRecord[]
}

type AbyssStats = {
  ascensionTotal: number
  demonsRevived: number
  totalBurns: number
  leaderboard: Array<{
    ordinalWallet: string
    paymentWallet: string
    total: number
    confirmed: number
  }>
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
  return <ProfileContent />
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
    totalHoldings,
    executioner,
    bonusAllowance,
    summons,
    summonsCreatedOpenCount,
    summonsJoinedActiveCount,
    portalSummary,
    abyssStats,
    refreshProfile,
    triggerDiscordAuth,
    triggerTwitterAuth,
  } = useProfileState()
  const toast = useToast()

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

      <Header connected={connected} showMusicControls={true} />

      {!connected && (
        <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-8 px-4 py-32 md:px-8">
          <div className="flex flex-col items-center gap-6 rounded-3xl border border-red-600/40 bg-black/70 p-16 shadow-[0_0_30px_rgba(220,38,38,0.35)] backdrop-blur text-center">
            <Skull className="h-16 w-16 text-red-500" />
            <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-red-300 md:text-4xl">
              Profile Access Required
            </h1>
            <p className="text-lg uppercase tracking-[0.3em] text-red-200/70">
              Please connect your wallet via the header to view your profile.
            </p>
          </div>
        </main>
      )}

      {connected && (
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
            totalHoldings={totalHoldings}
            executioner={executioner}
            bonusAllowance={bonusAllowance}
            summons={summons}
            summonsCreatedOpenCount={summonsCreatedOpenCount}
            summonsJoinedActiveCount={summonsJoinedActiveCount}
            portalSummary={portalSummary}
          />
          {!connected && (
            <p className="text-xs uppercase tracking-[0.35em] text-red-200/70">
              Connect your wallet via the header to update your profile.
            </p>
          )}
          {connected && (
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex items-center gap-2 rounded-full border border-red-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-200 hover:bg-red-600/20"
                onClick={refreshProfile}
              >
                Refresh Profile
              </Button>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 rounded-full border border-cyan-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-cyan-200 transition hover:bg-cyan-500/20"
              >
                <BookOpen className="h-4 w-4" /> Docs
              </Link>
              {isHolder === true && inventory.listedCount === 0 && (
                <>
                  <Link
                    href="/graveyard"
                    className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-amber-200 transition hover:bg-amber-500/20"
                  >
                    <Skull className="h-4 w-4" /> Graveyard
                  </Link>
                  <Link
                    href="/abyss-summon"
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-200 transition hover:bg-red-500/20"
                  >
                    Summoning Circles
                  </Link>
              <Link
                href="/abyss"
                className="inline-flex items-center gap-2 rounded-full border border-red-500/60 bg-black/40 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.3em] text-red-200 transition hover:bg-red-500/20"
              >
                <Flame className="h-4 w-4" /> Abyss
              </Link>
                </>
              )}
            </div>
          )}
        </section>

        <SummoningOverviewCard />

        {/* Abyss Stats Card */}
        <section className="rounded-3xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.3)] backdrop-blur">
          <h2 className="text-lg font-semibold uppercase tracking-[0.35em] text-red-200">Abyss</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-red-600/40 bg-black/60 px-6 py-6 text-center shadow-[0_0_18px_rgba(220,38,38,0.25)]">
              <span className="text-[11px] uppercase tracking-[0.35em] text-red-300/80">Total Sacrifices</span>
              <div className="mt-2">
                <TotalSacrifices total={abyssStats?.totalBurns ?? 0} />
              </div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-900/20 px-6 py-6 text-center shadow-[0_0_18px_rgba(251,191,36,0.25)]">
              <span className="text-[11px] uppercase tracking-[0.35em] text-amber-200/80">Total Ascended / Revived</span>
              <span className="mt-2 text-3xl font-black text-amber-200">{abyssStats?.ascensionTotal ?? 0}</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-purple-500/40 bg-purple-900/20 px-6 py-6 text-center shadow-[0_0_18px_rgba(168,85,247,0.25)]">
              <span className="text-[11px] uppercase tracking-[0.35em] text-purple-200/80">Total Demons Revived</span>
              <span className="mt-2 text-3xl font-black text-purple-200">{abyssStats?.demonsRevived ?? 0}</span>
            </div>
          </div>
        </section>

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

        <section className="rounded-3xl border border-red-600/40 bg-black/60 shadow-[0_0_25px_rgba(220,38,38,0.3)] backdrop-blur">
          <LinkedWalletsManager />
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
      )}
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
  totalHoldings,
  executioner,
  bonusAllowance,
  summons,
  summonsCreatedOpenCount,
  summonsJoinedActiveCount,
  portalSummary,
}: {
  connected: boolean
  inventory: InventorySummary
  isHolder: boolean | null
  totalHoldings: number
  executioner: boolean | null
  bonusAllowance: number
  summons: SummonOverview
  summonsCreatedOpenCount: number
  summonsJoinedActiveCount: number
  portalSummary?: { isPortalSummoner: boolean; completedCreated: number; completedJoined: number } | null
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
        subtitle: `${totalHoldings} damned ordinal${totalHoldings === 1 ? '' : 's'} detected`,
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

  const portalCard = (() => {
    const yes = portalSummary?.isPortalSummoner === true
    if (yes) {
      const created = portalSummary?.completedCreated ?? 0
      const joined = portalSummary?.completedJoined ?? 0
      return {
        value: 'Yes',
        subtitle: `${created} hosted • ${joined} joined`,
        tone: 'success' as const,
        href: '/abyss-summon?type=damned_pool',
      }
    }
    return {
      value: 'No',
      subtitle: 'No completed portals yet',
      tone: 'danger' as const,
      href: '/abyss-summon?type=damned_pool',
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

  // Use counts from consolidated API instead of filtering arrays
  const createdOpenCount = summonsCreatedOpenCount
  const joinedActiveCount = summonsJoinedActiveCount
  const activeSummonsCount = createdOpenCount + joinedActiveCount

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
    { title: 'Portal Summoner', ...portalCard },
  ]

  if (activeSummonsCount > 0) {
    cards.push({
      title: 'Active Summons',
      value: `${activeSummonsCount}`,
      subtitle: `${createdOpenCount} created • ${joinedActiveCount} joined`,
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

function SummoningOverviewCard() {
  const { isHolder, inventory } = useProfileState()
  
  // Only show the card if user is a holder AND has no listings
  if (isHolder !== true || inventory.listedCount > 0) {
    return null
  }
  
  return (
    <section className="space-y-4 rounded-3xl border border-red-600/40 bg-black/70 p-6 shadow-[0_0_25px_rgba(220,38,38,0.3)] backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold uppercase tracking-[0.35em] text-red-200">Summoning Circles</h2>
        <Link
          href="/abyss-summon"
          className="text-[11px] font-mono uppercase tracking-[0.35em] text-amber-200 hover:text-amber-300"
        >
          Enter
        </Link>
      </div>
      <div className="mt-2 flex justify-center">
        <Link
          href="/abyss-summon"
          className="inline-flex items-center justify-center rounded-full border border-red-500 bg-red-700/80 px-8 py-3 text-[12px] font-mono uppercase tracking-[0.4em] text-red-100 shadow-[0_0_22px_rgba(220,38,38,0.35)] transition hover:bg-red-600"
        >
          Go to Summoning
        </Link>
      </div>
    </section>
  )
}

function useProfileState() {
  const wallet = useLaserEyes()
  const { connected, address, paymentAddress } = wallet
  const toast = useToast()
  const [profile, setProfile] = useState<ProfileDetails>(INITIAL_PROFILE)
  const [discord, setDiscord] = useState<SocialStatus>(INITIAL_SOCIAL)
  const [twitter, setTwitter] = useState<SocialStatus>(INITIAL_SOCIAL)
  const [inventory, setInventory] = useState<InventorySummary>(INITIAL_INVENTORY)
  const [isHolder, setIsHolder] = useState<boolean | null>(null)
  const [totalHoldings, setTotalHoldings] = useState<number>(0)
  const [executioner, setExecutioner] = useState<boolean | null>(null)
  const [bonusAllowance, setBonusAllowance] = useState<number>(0)
  const [summons, setSummons] = useState<SummonOverview>(INITIAL_SUMMON_OVERVIEW)
  const [summonsCreatedOpenCount, setSummonsCreatedOpenCount] = useState<number>(0)
  const [summonsJoinedActiveCount, setSummonsJoinedActiveCount] = useState<number>(0)
  const [portalSummary, setPortalSummary] = useState<{ isPortalSummoner: boolean; completedCreated: number; completedJoined: number } | null>(null)
  const [abyssStats, setAbyssStats] = useState<AbyssStats | null>(null)
  const isInitializing = useRef(false)

  const fetchProfileWithData = useCallback(
    async (wallet: string, payment?: string) => {
      try {
        const data = await getCachedRequest(
          `profile-with-data:${wallet}`,
          async () => {
            const url = payment 
              ? `/api/profile-with-data?walletAddress=${encodeURIComponent(wallet)}&paymentAddress=${encodeURIComponent(payment)}`
              : `/api/profile-with-data?walletAddress=${encodeURIComponent(wallet)}`
            const response = await fetch(url)
            return response.json()
          }
        )
        if (data?.success) {
          // Set profile data
          if (data.profile) {
        setProfile({
              username: data.profile.username ?? null,
              avatarUrl: data.profile.avatarUrl ?? null,
              totalGoodKarma: data.profile.totalGoodKarma ?? 0,
              totalBadKarma: data.profile.totalBadKarma ?? 0,
              chosenSide: data.profile.chosenSide ?? null,
        })
          }
          
          // Set Discord status from unified response
          if (data.social?.discord) {
            setDiscord({
              linked: data.social.discord.linked ?? false,
              identifier: data.social.discord.identifier ?? null,
              loading: false,
            })
          }
          
          // Set Twitter status from unified response
          if (data.social?.twitter) {
            setTwitter({
              linked: data.social.twitter.linked ?? false,
              identifier: data.social.twitter.identifier ?? null,
              loading: false,
            })
          }
          
          // Set holder status (includes both burns and grave robbing)
          if (data.holder) {
            setIsHolder(data.holder.isHolder)
            setTotalHoldings(data.holder.totalHoldings ?? 0)
      }
          
          // Set executioner status from abyss stats
          if (data.abyssStats) {
            setExecutioner(data.abyssStats.isExecutioner)
            setAbyssStats({
              ascensionTotal: data.abyssStats.ascensionTotal ?? 0,
              demonsRevived: data.abyssStats.demonsRevived ?? 0,
              totalBurns: data.abyssStats.totalBurns ?? 0,
              leaderboard: [], // We don't fetch full leaderboard anymore
            })
          }
          
          // Set summons counts and bonus allowance
          if (data.summons) {
            setBonusAllowance(data.summons.bonusAllowance ?? 0)
            setSummonsCreatedOpenCount(data.summons.createdOpenCount ?? 0)
            setSummonsJoinedActiveCount(data.summons.joinedActiveCount ?? 0)
          }
          
          // Set portal summary
          if (data.portal) {
            setPortalSummary({
              isPortalSummoner: data.portal.isPortalSummoner ?? false,
              completedCreated: data.portal.completedCreated ?? 0,
              completedJoined: data.portal.completedJoined ?? 0,
            })
          }
        }
      } catch (error) {
        console.error('Error fetching profile with data:', error)
      }
    },
    [],
  )


  const fetchInventory = useCallback(
    async (wallet: string) => {
      setInventory((prev) => ({ ...prev, loading: true, error: null }))
      try {
        // Fetch Magic Eden ordinals only (holder status already determined by /api/profile-with-data)
        const ordinalsResponse = await fetch(
          `/api/magic-eden?ownerAddress=${encodeURIComponent(wallet)}&collectionSymbol=the-damned&fetchAll=true`,
          {
            method: 'GET',
            headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
          },
        )

        if (!ordinalsResponse.ok) {
          throw new Error(`Magic Eden request failed (${ordinalsResponse.status})`)
        }

        const payload = await ordinalsResponse.json().catch(() => ({ tokens: [] }))
        const rawTokens =
          Array.isArray(payload?.tokens) ? payload.tokens : Array.isArray(payload) ? payload : []

        let listedCount = 0
        for (const token of rawTokens as Array<Record<string, any>>) {
          // Check if token is listed (either via listed flag or price)
          const isListed = token?.listed === true
          const rawPrice = Number(
            token?.priceInfo?.price ?? token?.listedPrice ?? token?.listingPrice ?? token?.price ?? token?.listing?.price ?? 0,
          )
          if (isListed || (Number.isFinite(rawPrice) && rawPrice > 0)) {
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


  const initializeProfile = useCallback(
    async (wallet: string) => {
      // Prevent duplicate initialization
      if (isInitializing.current) {
        console.log('[Profile] Already initializing, skipping...')
        return
      }

      isInitializing.current = true
      console.log('[Profile] Initializing profile for:', wallet)

      // Profile is auto-created by /api/profile-with-data if it doesn't exist
      await Promise.all([
        fetchProfileWithData(wallet, paymentAddress || undefined), // Consolidated endpoint: profile + socials + holder + abyss + summons + portal
        fetchInventory(wallet), // Still need Magic Eden external API
      ])

      isInitializing.current = false
    },
    [
      fetchProfileWithData,
      fetchInventory,
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
      setSummonsCreatedOpenCount(0)
      setSummonsJoinedActiveCount(0)
      setPortalSummary(null)
      setAbyssStats(null)
    }
  }, [connected, address, initializeProfile])

  useEffect(() => {
    if (!address) return
    const params = new URLSearchParams(window.location.search)
    const discordAuth = params.get('discord_auth')
    const twitterAuth = params.get('twitter_auth')

    if (discordAuth === 'success' || twitterAuth === 'success') {
      void Promise.all([
        fetchProfileWithData(address, paymentAddress || undefined), // Consolidated endpoint includes everything
        fetchInventory(address), // Magic Eden
      ])
      window.history.replaceState({}, '', '/profile')
    }
  }, [address, paymentAddress, fetchProfileWithData, fetchInventory])

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
      totalHoldings,
      executioner,
      bonusAllowance,
      summons,
      summonsCreatedOpenCount,
      summonsJoinedActiveCount,
      portalSummary,
      abyssStats,
      refreshProfile: () => {
        if (address) {
          console.log('[Profile] Manual refresh requested')
          invalidateCache() // Clear all cache
          isInitializing.current = false // Reset flag
          void Promise.all([
            fetchProfileWithData(address, paymentAddress || undefined), // Consolidated endpoint
            fetchInventory(address), // Magic Eden
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
      totalHoldings,
      executioner,
      bonusAllowance,
      summons,
      summonsCreatedOpenCount,
      summonsJoinedActiveCount,
      portalSummary,
      abyssStats,
      fetchProfileWithData,
      fetchInventory,
      triggerDiscordAuth,
      triggerTwitterAuth,
    ],
  )
}

