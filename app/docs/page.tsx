'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, User, Skull, Sparkles, Trophy } from 'lucide-react'

import Header from '@/components/Header'

type DocSection = {
  id: string
  title: string
  icon: React.ReactNode
  content: React.ReactNode
}

function AccordionSection({ section, isOpen, onToggle }: { section: DocSection; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-red-600/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-4 text-left transition hover:bg-red-900/20"
      >
        <div className="flex items-center gap-3">
          {section.icon}
          <h2 className="text-xl font-bold uppercase tracking-[0.2em] text-red-200">{section.title}</h2>
        </div>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-red-400" />
        ) : (
          <ChevronRight className="h-5 w-5 text-red-400" />
        )}
      </button>
      {isOpen && <div className="px-4 pb-4 text-base text-red-200/80">{section.content}</div>}
    </div>
  )
}

export default function DocsPage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['profile']))

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const sections: DocSection[] = [
    {
      id: 'profile',
      title: 'Profile',
      icon: <User className="h-5 w-5 text-red-400" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
            <p className="leading-relaxed">
              Your profile tracks your karma, chosen side (Good or Evil), holder status, and social connections. Connect your wallet to view and manage your profile.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Holder Status</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>You must have at least one unlisted Damned ordinal in your wallet to access certain features</li>
              <li>Marketplace listings are detected automatically</li>
              <li>If you have active listings, links to Graveyard, Summoning Circles, and Abyss are disabled</li>
              <li>Remove all listings to regain full access</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Choosing a Side</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>Choose Good or Evil on the Dashboard</li>
              <li>Choosing a side <strong>wipes all existing karma records</strong> for your wallet</li>
              <li>Once chosen, you can reset and switch sides anytime</li>
              <li>Resetting clears all karma and task completions</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Karma System</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>Earn karma by completing tasks aligned with your chosen side</li>
              <li>Good karma: positive points for Good-aligned actions</li>
              <li>Evil karma: negative points (displayed as positive for Evil-aligned)</li>
              <li>Karma Standing = Good Karma - Bad Karma</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Social Connections</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>Link Discord to sync your username and avatar</li>
              <li>Link Twitter/X to bind your handle</li>
              <li>Both are optional and can be disconnected anytime</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'graveyard',
      title: 'Graveyard',
      icon: <Skull className="h-5 w-5 text-amber-400" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
            <p className="leading-relaxed">
              The Graveyard displays ordinals that have been sacrificed to the Abyss. Here you can spend ascension powder to revive and ascend them.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Ascension Powder</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>Earned by participating in Summoning Circles</li>
              <li>Also earned hourly in the AFK Circle (1 per ordinal)</li>
              <li>Spend powder to add power to ordinals in the graveyard</li>
              <li>Each spend adds 1 powder to an ordinal&apos;s ascension power</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">First Ascension</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>When an ordinal reaches 500 ascension powder, it can ascend</li>
              <li>Creates a new ascended image in &quot;Limbo&quot; status</li>
              <li>You must choose to keep the ascended version or burn it for a second ascension</li>
              <li>If you burn it, the original ordinal becomes eligible for a second ascension</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Second Ascension</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>After burning a first ascension, the original needs 1000 powder total for second ascension</li>
              <li>This creates a more powerful ascended version</li>
              <li>The second ascension is final - no third ascension</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Grave Robbing</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>Costs 200 ascension powder per attempt</li>
              <li>Can only target ordinals that haven&apos;t been updated in 7+ days</li>
              <li>10% success chance to steal ownership of someone else&apos;s ordinal</li>
              <li>Powder is deducted even if the attempt fails</li>
              <li>Cannot rob already ascended ordinals</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Limbo & Mint Queue</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>Limbo: Ascended images awaiting your choice (keep or burn)</li>
              <li>Mint Queue: Ordinals waiting to be minted as ascended inscriptions</li>
              <li>Manage both from the Graveyard interface</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'summoning',
      title: 'Summoning Circles',
      icon: <Sparkles className="h-5 w-5 text-cyan-400" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
            <p className="leading-relaxed">
              Summoning Circles are collaborative rituals where participants pledge ordinals to earn ascension powder. Summoning is open 9 AM - 10 PM EST daily.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Circle Types</h3>
            
            <div className="ml-4 space-y-3">
              <div className="rounded border border-amber-500/40 bg-amber-900/20 p-3">
                <h4 className="mb-2 text-base font-semibold text-amber-300">Ascension Circles (Powder Mode)</h4>
                <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
                  <li>10 participants required</li>
                  <li>10 minute duration</li>
                  <li>Must mark &quot;Ready&quot; in the last 2 minutes</li>
                  <li>9 of 10 must complete to succeed</li>
                  <li><strong>Rewards:</strong> 6 powder (host) • 4 powder (participants)</li>
                </ul>
              </div>

              <div className="rounded border border-indigo-500/40 bg-indigo-900/20 p-3">
                <h4 className="mb-2 text-base font-semibold text-indigo-300">Portal Circles (Damned Pool)</h4>
                <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
                  <li><strong>20 seats:</strong> Bonus burns only (requires burn tokens)</li>
                  <li><strong>40 seats:</strong> Open to all</li>
                  <li>30 minute duration for 40-man, 20 minutes for 20-man</li>
                  <li>Burn window opens in last 3 minutes</li>
                  <li>36 of 40 must complete (or 18 of 20)</li>
                  <li><strong>Rewards:</strong> 16 powder (host) • 12 powder (participants)</li>
                </ul>
              </div>

              <div className="rounded border border-purple-500/40 bg-purple-900/20 p-3">
                <h4 className="mb-2 text-base font-semibold text-purple-300">Dead Demons Circles</h4>
                <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
                  <li>Requires ascended inscriptions (ID starts with &quot;ascended_&quot;)</li>
                  <li>10 participants required</li>
                  <li>10 minute duration</li>
                  <li>All 10 must complete in the last 1 minute</li>
                  <li><strong>Rewards:</strong> 5 powder (host) • 4 powder (participants)</li>
                </ul>
              </div>

              <div className="rounded border border-cyan-500/40 bg-cyan-900/20 p-3">
                <h4 className="mb-2 text-base font-semibold text-cyan-300">AFK Circle</h4>
                <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
                  <li>Single permanent circle (max 100 participants)</li>
                  <li>No time limit, no completion required</li>
                  <li>Deposit ordinals to earn +1 powder per ordinal every hour</li>
                  <li>Can add/remove ordinals anytime</li>
                  <li>Ordinals in AFK circle cannot be used in other circles</li>
                  <li>Automatically rewards every hour on the hour</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How to Participate</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li><strong>Host:</strong> Select an ordinal and click &quot;Initiate Circle&quot;</li>
              <li><strong>Join:</strong> Browse active circles and click &quot;Join&quot; with an available ordinal</li>
              <li>Each ordinal can only be in one circle at a time</li>
              <li>Maximum 6 active circles per user (hosting + participating)</li>
              <li>Maximum 2 hosted circles per user</li>
              <li>Maximum 10 active circles globally</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Completing Circles</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>When a circle reaches capacity, it locks and enters completion phase</li>
              <li>Mark yourself &quot;Ready&quot; during the completion window</li>
              <li>If enough participants complete, rewards are granted automatically</li>
              <li>If too few complete, the circle expires with no rewards</li>
              <li>Check countdown timers to know when to mark ready</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Restrictions</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>Cannot join if you have active marketplace listings</li>
              <li>Must be a holder (unlisted ordinals or past burns)</li>
              <li>Summoning closed 10 PM - 9 AM EST daily</li>
              <li>Ordinals in AFK circle cannot be used elsewhere</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'leaderboard',
      title: 'Ascension Leaderboard',
      icon: <Trophy className="h-5 w-5 text-amber-400" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
            <p className="leading-relaxed">
              The Ascension Leaderboard ranks all players by total ascension powder (available + spent). Only holders can view the leaderboard.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Ranking System</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li><strong>Available:</strong> Current ascension powder in your profile</li>
              <li><strong>Spent:</strong> Total powder used on graveyard ordinals (cumulative)</li>
              <li><strong>Total:</strong> Available + Spent (your ranking score)</li>
              <li>Leaderboard updates every 30 seconds</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Access</h3>
            <ul className="ml-4 list-disc space-y-1 leading-relaxed">
              <li>Must have at least one unlisted Damned ordinal to view</li>
              <li>Your rank is highlighted if you&apos;re on the leaderboard</li>
              <li>Shows username, avatar (if Discord linked), and wallet address</li>
            </ul>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="relative min-h-screen w-full bg-black text-red-100">
      <Header connected={false} showMusicControls={false} />

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-16 md:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-black uppercase tracking-[0.4em] text-red-200 md:text-5xl">Documentation</h1>
          <p className="mt-4 text-sm uppercase tracking-[0.3em] text-red-300/70">
            Guide to The Damned ecosystem
          </p>
        </div>

        <div className="rounded-3xl border border-red-600/40 bg-black/70 shadow-[0_0_30px_rgba(220,38,38,0.35)] backdrop-blur">
          {sections.map((section) => (
            <AccordionSection
              key={section.id}
              section={section}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>

        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-red-300/60">
            Need more help? <Link href="https://discord.gg/vJ4yw9N55j" target="_blank" rel="noopener noreferrer" className="text-red-400 underline hover:text-red-300">Join Discord</Link>
          </p>
        </div>
      </main>
    </div>
  )
}

