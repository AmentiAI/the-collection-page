'use client'

import { ReactNode } from 'react'
import dynamicImport from 'next/dynamic'
import Link from 'next/link'
import Header from '@/components/Header'

const LaserEyesWrapper = dynamicImport(() => import('@/components/LaserEyesWrapper'), {
  ssr: false,
  loading: () => null
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

export default function DualityGuideClient() {
  return (
    <LaserEyesWrapper>
      <div className="relative min-h-screen bg-gradient-to-b from-black via-[#1a0000] to-black text-white">
        <Header />
        <main className="relative z-10">
          <div className="max-w-5xl mx-auto px-5 md:px-10 py-16 space-y-10">
            <header className="space-y-4 text-center">
              <p className="text-sm uppercase tracking-[0.4em] text-red-500">The Damned Duality Protocol</p>
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-widest text-red-200">
                How To Play & Earn Karma
              </h1>
              <p className="text-sm md:text-base text-gray-300 font-mono max-w-3xl mx-auto">
                The Duality Protocol is a week-long alignment war for verified holders. Choose your side, coordinate with your partner,
                and ride the waves of fate to claim the leaderboard. This guide covers everything from joining the dashboard to stacking karma.
              </p>
              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <Link
                  href="/dashboard"
                  className="px-6 py-3 border border-red-500/60 rounded-lg text-sm md:text-base font-bold uppercase tracking-wide bg-red-900/40 hover:bg-red-700/50 transition"
                >
                  Launch Dashboard
                </Link>
                <Link
                  href="/"
                  className="px-6 py-3 border border-gray-500/60 rounded-lg text-sm md:text-base font-bold uppercase tracking-wide bg-black/50 hover:bg-black/70 transition"
                >
                  View Collection
                </Link>
              </div>
            </header>

            <section className="space-y-6">
              <SectionTitle>Getting Inside</SectionTitle>
              <div className="grid gap-6 md:grid-cols-2">
                <Card title="1. Hit the Dashboard">
                  <p>
                    Visit <code className="text-red-300">/dashboard</code>. Connect your wallet using LaserEyes and verify holder status for The Damned collection.
                  </p>
                  <p>
                    Once verified, the dashboard unlocks your profile, daily check-ins, morality quests, leaderboard, and the new Duality Protocol status panel.
                  </p>
                </Card>
                <Card title="2. Pick Your Side">
                  <p>
                    You must choose a permanent alignment—<span className="text-green-400">Good</span> or <span className="text-red-400">Evil</span>—to access quests and karma feeds. Changing sides requires a full karma reset, so choose wisely.
                  </p>
                  <p>
                    Your chosen side filters every list on the dashboard: quests, point history, leaderboard ranks, and Duality pairing options.
                  </p>
                </Card>
              </div>
            </section>

            <section className="space-y-6">
              <SectionTitle>Daily Karma Loop</SectionTitle>
              <div className="grid gap-6 md:grid-cols-2">
                <Card title="Daily Check-In">
                  <ul className="list-disc list-inside space-y-2">
                    <li>Once per 24h, choose “Check in for Good” (+5) or “Check in for Evil” (-5).</li>
                    <li>Cooldown runs on server time; the UI shows the exact unlock countdown.</li>
                    <li>Completing the check-in also auto-completes the Daily Check-In task for your side.</li>
                  </ul>
                </Card>
                <Card title="Morality Quests">
                  <ul className="list-disc list-inside space-y-2">
                    <li>Admins curate quests with proof uploads and platform requirements.</li>
                    <li>Submit evidence, wait for approval if needed, and earn side-aligned karma.</li>
                    <li>Proof uploads flow through the secure Vercel Blob pipeline.</li>
                  </ul>
                </Card>
                <Card title="Automatic Karma">
                  <ul className="list-disc list-inside space-y-2">
                    <li>Buying or creating The Damned ordinals awards +20 per unique acquisition.</li>
                    <li>Owning an ordinal also grants a one-time +20 and completes the “Own an Ordinal” task.</li>
                    <li>Selling deducts the corresponding karma using the opposite alignment.</li>
                  </ul>
                </Card>
                <Card title="Leaderboard & History">
                  <ul className="list-disc list-inside space-y-2">
                    <li>Leaderboards split by side, updating automatically as karma moves.</li>
                    <li>Your point history only shows entries matching your alignment to avoid clutter.</li>
                    <li>Resetting karma wipes these logs but keeps profile and social data intact.</li>
                  </ul>
                </Card>
              </div>
            </section>

            <section className="space-y-6">
              <SectionTitle>Duality Protocol Cycle</SectionTitle>
              <div className="grid gap-6 md:grid-cols-2">
                <Card title="Weekly Flow">
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong>Alignment Day:</strong> Lock alignment, confirm participation.</li>
                    <li><strong>Pairing:</strong> Balanced good/evil holders are matched with shared fate meters.</li>
                    <li><strong>Days 2-5:</strong> Daily event cards (Blessing, Temptation, Fate Roll) trigger karma swings.</li>
                    <li><strong>Days 6-7:</strong> Trial of Karma if your karma dips too low and you completed at least one quest.</li>
                  </ul>
                </Card>
                <Card title="Global Effects">
                  <ul className="list-disc list-inside space-y-2">
                    <li>Dark Surge, Mercy Hour, Mischief Winds, and Karmic Eclipse can strike at random.</li>
                    <li>Effects modify karma multipliers, fate meters, or reshuffle pairings for limited hours.</li>
                    <li>Active effects and expiry timers appear on your dashboard Duality status panel.</li>
                  </ul>
                </Card>
                <Card title="Trials & Voting">
                  <ul className="list-disc list-inside space-y-2">
                    <li>Low-karma holders face the community. Trials open with Discord embeds and reaction voting.</li>
                    <li>⚪️ Absolve or 🔴 Condemn votes swing final karma adjustments.</li>
                    <li>Participants receive DMs when voting opens and when verdicts land.</li>
                  </ul>
                </Card>
                <Card title="Weekly Reset">
                  <ul className="list-disc list-inside space-y-2">
                    <li>Resolved trials, final leaderboard standings, and fate meters reset on cycle close.</li>
                    <li>Admins can post summaries, assign rewards, and launch the next alignment window.</li>
                    <li>All Duality history remains visible in the admin console for audit.</li>
                  </ul>
                </Card>
              </div>
            </section>

            <section className="space-y-6">
              <SectionTitle>Tips & Troubleshooting</SectionTitle>
              <div className="grid gap-6 md:grid-cols-2">
                <Card title="Stay Synced">
                  <p>
                    Wallet disconnects clear cached karma calculations. Reconnect and refresh the dashboard if new activities are missing.
                  </p>
                  <p>
                    The Duality panel refreshes automatically, but you can force a sync via the “Refresh Status” button in the admin console.
                  </p>
                </Card>
                <Card title="Need Help?">
                  <p>
                    Reach out in Discord with transaction hashes or wallet addresses. Admins can trigger manual rescans or reset your profile if necessary.
                  </p>
                  <p>
                    Bot status updates land in the Duality Events and Trials channels every few minutes—watch those feeds for live calls to action.
                  </p>
                </Card>
              </div>
            </section>

            <footer className="pt-10 border-t border-red-800/50 text-center space-y-3">
              <p className="text-sm uppercase tracking-[0.3em] text-red-500">Choose a side. Tip the fate meter. Stay damned.</p>
              <div className="flex justify-center gap-4">
                <Link
                  href="/dashboard"
                  className="px-6 py-2 border border-red-500/60 rounded-lg text-xs md:text-sm font-bold uppercase tracking-wide bg-red-900/40 hover:bg-red-700/50 transition"
                >
                  Enter Dashboard
                </Link>
                <Link
                  href="/admin/morality"
                  className="px-6 py-2 border border-gray-500/60 rounded-lg text-xs md:text-sm font-bold uppercase tracking-wide bg-black/50 hover:bg-black/70 transition"
                >
                  Admin Console
                </Link>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </LaserEyesWrapper>
  )
}

