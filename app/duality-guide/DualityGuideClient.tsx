'use client'

import { ReactNode } from 'react'
import dynamicImport from 'next/dynamic'
import Link from 'next/link'
import Header from '@/components/Header'

const LaserEyesWrapper = dynamicImport(() => import('@/components/LaserEyesWrapper'), {
  ssr: false,
  loading: () => null,
})

const SectionTitle = ({ children }: { children: string }) => (
  <h2 className="text-2xl font-black uppercase tracking-widest text-red-400 drop-shadow-[0_0_10px_rgba(255,0,0,0.6)]">
    {children}
  </h2>
)

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="bg-black/60 border border-red-600/40 rounded-xl p-6 shadow-xl space-y-3">
    <h3 className="text-xl font-bold text-red-300 uppercase tracking-wide">{title}</h3>
    <div className="text-sm md:text-base text-gray-200 leading-relaxed font-mono space-y-3">
      {children}
    </div>
  </div>
)

function DualityGuide() {
  return (
    <LaserEyesWrapper>
      <div className="min-h-screen bg-gradient-to-b from-black via-[#0b0202] to-black text-red-100">
        <Header showMusicControls={false} />
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-12">
          <header className="space-y-4 text-center">
            <p className="text-xs font-mono uppercase tracking-[0.4em] text-red-300/80">
              Survive the Rite. Earn redemption.
            </p>
            <h1 className="text-3xl font-black uppercase tracking-[0.5em] text-red-100 drop-shadow-[0_0_25px_rgba(248,113,113,0.55)] md:text-4xl">
              Duality Protocol Field Guide
            </h1>
            <p className="mx-auto max-w-2xl text-sm text-red-200/80">
              This manual keeps freshly damned acolytes alive long enough to harvest karma. Read it before you step
              into the arena, refer to it whenever the void whispers, and share it with any damned still fumbling in the
              dark.
            </p>
          </header>

          <section className="space-y-6">
            <SectionTitle>Prepare Your Wallet</SectionTitle>
            <Card title="1. Prove you belong">
              <p>
                Connect through the header button and verify holder status. The protocol only opens to wallets that can
                prove ownership of a The Damned inscription. Non-believers can spectate but will not accrue karma.
              </p>
              <p>
                If verification reports <strong>Not A Holder</strong>, double-check you are connected with the correct
                wallet. Need help? Visit the{' '}
                <Link href="/profile" className="text-red-200 underline underline-offset-4">
                  profile ritual
                </Link>{' '}
                to update your details.
              </p>
            </Card>
            <Card title="2. Ready your offerings">
              <ul className="list-inside space-y-2 text-sm text-red-100/90">
                <li>Ensure at least one confirmed The Damned ordinal is available.</li>
                <li>Keep a payment UTXO with enough sats for fees (10k–20k sats is safe).</li>
                <li>Disable browser extensions that block popups; the ritual requires multiple confirmations.</li>
              </ul>
            </Card>
          </section>

          <section className="space-y-6">
            <SectionTitle>Inside The Arena</SectionTitle>
            <Card title="3. Joining a cycle">
              <p>
                Every cycle pairs you with a counterpart. Invitations appear in the <strong>Pairings</strong> panel. When
                you accept, you are locked in until the ritual completes or the countdown expires.
              </p>
              <p>
                Missing a check-in drains karma. Set reminders or keep the duel window open. Tardy offerings anger the
                abyss and can forfeit your share of rewards.
              </p>
            </Card>
            <Card title="4. Trials &amp; votes">
              <p>
                Trials demand sacrifices—burning ordinals, staking runes, or offering powder. Complete the required
                action before the timer reaches zero. When other damned submit offerings, cast your vote to influence the
                outcome. Each vote returns a sliver of karma.
              </p>
            </Card>
          </section>

          <section className="space-y-6">
            <SectionTitle>Karma &amp; Ascension</SectionTitle>
            <Card title="5. Track your standing">
              <p>
                The <Link href="/dashboard" className="text-red-200 underline underline-offset-4">dashboard</Link>{' '}
                tracks karma, cooldowns, and powder reserves. Green spikes mark verified completions; red arrows warn of
                missed rites. Keep powder stocked to unlock emergency escapes.
              </p>
            </Card>
            <Card title="6. When the cycle ends">
              <p>
                Confirmed sacrifices raise your karma tier. Hit the ascension threshold to claim permanent honors on the
                leaderboard. If you fall behind, repeat the rites—no damned is beyond redemption.
              </p>
            </Card>
            <Card title="Need more help?">
              <p>
                Join the cultists in{' '}
                <a
                  href="https://discord.gg/vJ4yw9N55j"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-200 underline underline-offset-4"
                >
                  Discord
                </a>{' '}
                or return to the{' '}
                <Link href="/" className="text-red-200 underline underline-offset-4">
                  main gallery
                </Link>{' '}
                to gather reinforcements.
              </p>
            </Card>
          </section>
        </main>
      </div>
    </LaserEyesWrapper>
  )
}

export default function DualityGuideClient() {
  return <DualityGuide />
}

