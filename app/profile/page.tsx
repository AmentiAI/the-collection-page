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
    refreshProfile,
    triggerDiscordAuth,
    triggerTwitterAuth,
  } = useProfileState()

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-red-100">
      <Header connected={connected} showMusicControls={false} />

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 md:px-8">
        <section className="flex flex-col items-center gap-6 rounded-3xl border border-red-600/40 bg-black/70 p-8 shadow-[0_0_30px_rgba(220,38,38,0.35)] backdrop-blur">
          <ProfileAvatar imageUrl={profile.avatarUrl} />
          <h1 className="text-3xl font-black uppercase tracking-[0.4em] text-red-300 md:text-4xl">
            {profile.username ?? 'Unknown Damned'}
          </h1>
          <ProfileKarma profile={profile} />
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

function useProfileState() {
  const { connected, address } = useLaserEyes()
  const toast = useToast()
  const [profile, setProfile] = useState<ProfileDetails>(INITIAL_PROFILE)
  const [discord, setDiscord] = useState<SocialStatus>(INITIAL_SOCIAL)
  const [twitter, setTwitter] = useState<SocialStatus>(INITIAL_SOCIAL)

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

      await Promise.all([fetchProfile(wallet), checkDiscordStatus(wallet), checkTwitterStatus(wallet)])
    },
    [fetchProfile, checkDiscordStatus, checkTwitterStatus],
  )

  useEffect(() => {
    if (connected && address) {
      void initializeProfile(address)
    } else {
      setProfile(INITIAL_PROFILE)
      setDiscord(INITIAL_SOCIAL)
      setTwitter(INITIAL_SOCIAL)
    }
  }, [connected, address, initializeProfile])

  useEffect(() => {
    if (!address) return
    const params = new URLSearchParams(window.location.search)
    const discordAuth = params.get('discord_auth')
    const twitterAuth = params.get('twitter_auth')

    if (discordAuth === 'success') {
      void Promise.all([fetchProfile(address), checkDiscordStatus(address)])
      window.history.replaceState({}, '', '/profile')
    }

    if (twitterAuth === 'success') {
      void Promise.all([fetchProfile(address), checkTwitterStatus(address)])
      window.history.replaceState({}, '', '/profile')
    }
  }, [address, checkDiscordStatus, checkTwitterStatus, fetchProfile])

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
      refreshProfile: () => {
        if (address) {
          void fetchProfile(address)
          void checkDiscordStatus(address)
          void checkTwitterStatus(address)
        }
      },
      triggerDiscordAuth,
      triggerTwitterAuth,
    }),
    [connected, address, profile, discord, twitter, fetchProfile, checkDiscordStatus, checkTwitterStatus, triggerDiscordAuth, triggerTwitterAuth],
  )
}

