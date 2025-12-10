'use client'

import { useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'

type TabId = 
  | 'abyss'
  | 'crystallization'
  | 'battle'
  | 'battlefield'
  | 'pooloflife'
  | 'treeofascension'
  | 'horde'
  | 'leaderboard'
  | 'graveyard'
  | 'abyss-summon'
  | 'resurrect'

const tabs: { id: TabId; label: string; emoji: string }[] = [
  { id: 'abyss', label: 'Abyss', emoji: '🔥' },
  { id: 'crystallization', label: 'Crystallization', emoji: '💎' },
  { id: 'battle', label: 'Battle Arena', emoji: '⚔️' },
  { id: 'battlefield', label: 'Battlefield', emoji: '🗺️' },
  { id: 'pooloflife', label: 'Pool of Life', emoji: '💚' },
  { id: 'treeofascension', label: 'Tree of Ascension', emoji: '🌳' },
  { id: 'horde', label: 'The Horde', emoji: '👹' },
  { id: 'leaderboard', label: 'Leaderboard', emoji: '🏆' },
  { id: 'graveyard', label: 'Graveyard', emoji: '⚰️' },
  { id: 'abyss-summon', label: 'Abyss Summon', emoji: '🔮' },
  { id: 'resurrect', label: 'Resurrection', emoji: '💀' },
]

export default function RedemptionDocsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('abyss')

  const renderContent = () => {
    switch (activeTab) {
      case 'abyss':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                The main sacrifice mechanic where you burn your Damned ordinals. Each burn grants you ascension powder and adds the ordinal to your graveyard.
              </p>
              <p className="mt-2 leading-relaxed text-red-200/80">
                Currently <strong className="text-red-400">DISABLED</strong> (cap reached at 500 burns). Can be temporarily opened via &quot;burn windows&quot; for bonus credit holders.
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/abyss" className="text-amber-400 underline hover:text-amber-300">→ Go to Abyss</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>Select a Damned ordinal to sacrifice</li>
                <li>Select a payment wallet/address</li>
                <li>Sign the transaction to burn the ordinal</li>
                <li>Receive ascension powder (amount varies by source)</li>
                <li>Burned ordinal appears in your graveyard</li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Special Features</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li><strong>Bonus Burn Credits:</strong> Complete portal circles to earn bonus burn credits that let you burn even when the abyss is full</li>
                <li><strong>Burn Windows:</strong> Temporary openings (usually 30min-1hr) after completing portal circles</li>
                <li><strong>Cooldown:</strong> 15 minutes between burns</li>
              </ul>
            </div>
          </div>
        )
      case 'crystallization':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                Passive ascension powder generation system. Place your ordinals in the chamber to earn powder over time.
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/crystallizationz" className="text-amber-400 underline hover:text-amber-300">→ Go to Crystallization Chamber</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>Select ordinals from your army (must have life force &gt; 0)</li>
                <li>Click &quot;Enter Crystallization&quot; to place them in the chamber</li>
                <li>Each ordinal earns <strong>+1 ascension powder every 30 minutes</strong></li>
                <li>Click &quot;Claim&quot; to collect all earned powder</li>
                <li>Powder is added to your profile&apos;s total</li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Important Notes</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li>Ordinals in crystallization <strong>cannot</strong> be readied for battle</li>
                <li>You must &quot;Exit Crystallization&quot; before using them in battle</li>
                <li>Powder accumulates based on time spent in chamber</li>
                <li>Daily history tracks your earnings</li>
              </ul>
            </div>
          </div>
        )
      case 'battle':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                Prepare your ordinals for battle against the horde. Set ordinals to &quot;Ready&quot; or &quot;Sanctuary&quot; status. Apply reward items to boost stats.
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/battlez" className="text-amber-400 underline hover:text-amber-300">→ Go to Battle Arena</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>View all your ordinals (Angelic and Demonic)</li>
                <li><strong>Ready Status:</strong> Ordinal can be attacked by the horde</li>
                <li><strong>Sanctuary Status:</strong> Ordinal is protected from attacks</li>
                <li>Apply dungeon crawl reward items to boost stats</li>
                <li>View current block chance and life force caps</li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Reward Items</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li><strong>Block Chance Bonus:</strong> Increases your block chance (base 10% + bonus)</li>
                <li><strong>Life Force Cap Bonus:</strong> Increases your maximum life force</li>
                <li>Items are earned from completing dungeon crawls</li>
                <li>Items can be applied to specific ordinals</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Important</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li>Dead ordinals (0 life force) show &quot;Dead&quot; button and link to resurrection</li>
                <li>Ordinals in crystallization cannot be readied until they exit</li>
                <li>Visual indicators show which ordinals have item bonuses</li>
              </ul>
            </div>
          </div>
        )
      case 'battlefield':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                Interactive map showing battle locations and territories. Visual representation of the war between Angelic and Demonic forces.
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/battlefield" className="text-amber-400 underline hover:text-amber-300">→ Go to Battlefield</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>View the map (no wallet connection required for viewing)</li>
                <li>See territories controlled by each side</li>
                <li>Track battle locations and outcomes</li>
                <li>Monitor the ongoing war</li>
              </ol>
            </div>
            <div>
              <p className="leading-relaxed text-red-200/80">
                <strong>Note:</strong> This is primarily a visualization/map page showing the state of the war.
              </p>
            </div>
          </div>
        )
      case 'pooloflife':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                Heal your armies that have taken damage in battle. Restore life force to your ordinals. Track healing history.
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/pooloflife" className="text-amber-400 underline hover:text-amber-300">→ Go to Pool of Life</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>View all your armies with their current life force</li>
                <li>Select individual armies to heal OR use &quot;Heal All&quot;</li>
                <li><strong>Cooldown:</strong> 6 hours between heals</li>
                <li>Each heal restores life force (amount varies)</li>
                <li>View your healing history</li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Important</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li><strong>Cannot heal dead armies</strong> (0 life force) - use Resurrection Chamber instead</li>
                <li>Dead armies are automatically hidden from the list</li>
                <li>Cooldown timer shows when you can heal again</li>
                <li>History log tracks all your healing sessions</li>
              </ul>
            </div>
          </div>
        )
      case 'treeofascension':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                View and mint your ascended images. Manage images that are awaiting minting. Regenerate images (if you have regeneration credits).
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/treeofascension" className="text-amber-400 underline hover:text-amber-300">→ Go to Tree of Ascension</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>View all images in your mint queue</li>
                <li>See mint status for each image:
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li>⏳ Pending Signature</li>
                    <li>📡 Commit Broadcasting</li>
                    <li>⚡ Commit in Mempool</li>
                    <li>🚀 Reveal Broadcasting</li>
                    <li>✅ Minted!</li>
                    <li>❌ Failed</li>
                  </ul>
                </li>
                <li>Click &quot;Mint&quot; button to start the minting process</li>
                <li><strong>Regenerate:</strong> Use regeneration credits to generate new versions of images</li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Regeneration</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li>Earn regeneration credits by completing portal circles</li>
                <li>Regenerate button appears on images that haven&apos;t started minting</li>
                <li>Choose between original and regenerated version</li>
                <li>Credit is consumed when you generate (even if you keep original)</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Image Features</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li>Shows Silver and Glow traits</li>
                <li>Displays compressed file size (KB)</li>
                <li>Auto-compresses images to reduce size</li>
              </ul>
            </div>
          </div>
        )
      case 'horde':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                View all members of the horde that attack armies. See horde stats, images, and battle history. Public page (no wallet required).
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/horde" className="text-amber-400 underline hover:text-amber-300">→ Go to The Horde</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>View the list of the horde</li>
                <li>See each member&apos;s:
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li>Name and image</li>
                    <li>Total fights/battles</li>
                    <li>Last update time</li>
                  </ul>
                </li>
                <li>The horde attacks all ready armies every hour automatically</li>
              </ol>
            </div>
            <div>
              <p className="leading-relaxed text-red-200/80">
                <strong>Note:</strong> This is a view-only page showing the horde. The actual attacks happen automatically via cron job.
              </p>
            </div>
          </div>
        )
      case 'leaderboard':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                Track Angelic vs Demonic war statistics. See total battles, deaths, and resurrections for each side. View overall war score.
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/leaderboard" className="text-amber-400 underline hover:text-amber-300">→ Go to Leaderboard</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>View the leaderboard (public, no wallet required)</li>
                <li>See statistics for:
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li><strong>Total Battles:</strong> Number of times armies fought</li>
                    <li><strong>Total Deaths:</strong> Number of armies that died (life force reached 0)</li>
                    <li><strong>Total Resurrections:</strong> Number of armies brought back to life</li>
                    <li><strong>Score:</strong> Calculated from battles and outcomes</li>
                  </ul>
                </li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Statistics</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li>Updated from horde attack logs</li>
                <li>Tracks both Angelic and Demonic sides</li>
                <li>Shows which side is winning the war</li>
              </ul>
            </div>
          </div>
        )
      case 'graveyard':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                View all your sacrificed ordinals. Channel ascension powder to ascend ordinals. Access ascended images for minting. Claim chest rewards (300 powder).
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/graveyard" className="text-amber-400 underline hover:text-amber-300">→ Go to Graveyard</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>View all your burned ordinals (from abyss and summons)</li>
                <li><strong>Ascension Powder:</strong>
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li>Use powder to ascend ordinals (500 powder for first ascension, 1000 for second)</li>
                    <li>Powder comes from burns, chests, and other sources</li>
                  </ul>
                </li>
                <li><strong>Ascension Process:</strong>
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li>First ascension: Burn ordinal → Ascend with 500 powder → Image goes to limbo</li>
                    <li>Second ascension: Burn another ordinal → Ascend with 1000 powder → New image</li>
                  </ul>
                </li>
                <li><strong>Chest:</strong> Click the chest icon to claim 300 ascension powder (one-time per wallet)</li>
                <li><strong>Grave Robbing:</strong> Eligible graves (7+ days old) can be robbed by others</li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Limbo</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li>When you ascend, the image goes to &quot;limbo&quot;</li>
                <li>Choose to save for mint OR throw back in abyss</li>
                <li>Second ascension requires burning another ordinal</li>
              </ul>
            </div>
          </div>
        )
      case 'abyss-summon':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                Create or join portal circles (summoning circles). Complete circles to earn rewards. Multiple modes: Portal Circles (40-man), Powder Circles (10-man), Dead Demons (10-man).
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/abyss-summon" className="text-amber-400 underline hover:text-amber-300">→ Go to Abyss Summon</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li><strong>Create a Circle:</strong>
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li>Select an ordinal to be the host</li>
                    <li>Choose circle type (Portal/Powder/Dead Demons)</li>
                    <li>Wait for participants to join</li>
                  </ul>
                </li>
                <li><strong>Join a Circle:</strong>
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li>Browse active circles</li>
                    <li>Select your ordinals to join</li>
                    <li>Wait for circle to fill</li>
                  </ul>
                </li>
                <li><strong>Complete Circle:</strong>
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li>Host completes when all participants are ready</li>
                    <li><strong>Rewards:</strong>
                      <ul className="ml-4 mt-1 list-disc space-y-1 text-xs">
                        <li><strong>Portal Circles (40-man):</strong> Burn window (1 hour) + bonus burn credit to host</li>
                        <li><strong>Regular Circles:</strong> +1 bonus burn credit to all participants</li>
                        <li><strong>Powder Circles:</strong> Ascension powder to all participants</li>
                      </ul>
                    </li>
                  </ul>
                </li>
                <li><strong>Completion Window:</strong>
                  <ul className="ml-6 mt-1 list-disc space-y-1 text-sm">
                    <li>Portal circles have a 3-minute completion window</li>
                    <li>Participants must mark themselves as &quot;completed&quot; during this window</li>
                  </ul>
                </li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Circle Types</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li><strong>Portal Circles (40-man):</strong> Opens abyss for 1 hour, grants bonus credit to host</li>
                <li><strong>Powder Circles (10-man):</strong> Grants ascension powder to all</li>
                <li><strong>Dead Demons (10-man):</strong> Special mode for dead demon ordinals</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Timing</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li>Opens for 1 hour every 6 hours (UTC: 05:00, 11:00, 17:00, 23:00)</li>
                <li>Can be overridden by global start time setting</li>
              </ul>
            </div>
          </div>
        )
      case 'resurrect':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Overview</h3>
              <p className="leading-relaxed text-red-200/80">
                Bring dead armies (0 life force) back to life. Restore ordinals that died in battle.
              </p>
              <p className="mt-2 leading-relaxed">
                <Link href="/resurrect" className="text-amber-400 underline hover:text-amber-300">→ Go to Resurrection Chamber</Link>
              </p>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">How it Works</h3>
              <ol className="ml-4 list-decimal space-y-2 leading-relaxed text-red-200/80">
                <li>View all your dead armies (life force = 0)</li>
                <li>See resurrection timer for each dead army</li>
                <li><strong>Resurrection Time:</strong> 1 hour after death</li>
                <li>Click &quot;Resurrect&quot; when timer expires</li>
                <li>Army is restored to full life force</li>
                <li>View resurrection history</li>
              </ol>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold uppercase tracking-[0.15em] text-red-300">Important</h3>
              <ul className="ml-4 list-disc space-y-1 leading-relaxed text-red-200/80">
                <li>Dead armies cannot join dungeon crawls</li>
                <li>Dead armies cannot be healed at Pool of Life</li>
                <li>Must wait 1 hour after death before resurrecting</li>
                <li>Resurrection history tracks all resurrections</li>
              </ul>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-black text-red-100">
      <Header connected={false} showMusicControls={false} />

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-4 py-8 md:px-8">
        <div className="mb-6 text-center">
          <h1 className="text-4xl font-black uppercase tracking-[0.4em] text-red-200 md:text-5xl">Redemption System</h1>
          <p className="mt-2 text-sm uppercase tracking-[0.3em] text-red-300/70">
            Complete guide to all game pages
          </p>
        </div>

        {/* Fixed Tabs */}
        <div className="sticky top-0 z-20 mb-6 rounded-t-2xl border-b border-red-600/40 bg-black/95 backdrop-blur-sm">
          <div className="flex flex-wrap gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-mono uppercase tracking-[0.2em] transition ${
                    isActive
                      ? 'border-red-500 bg-red-700/80 text-red-100 shadow-[0_0_18px_rgba(220,38,38,0.45)]'
                      : 'border-red-700/50 bg-black/70 text-red-200/80 hover:border-red-500/70 hover:bg-red-900/30'
                  }`}
                >
                  <span className="mr-2">{tab.emoji}</span>
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content Area - Fixed Height with Scroll */}
        <div className="rounded-b-2xl border border-red-600/40 border-t-0 bg-black/70 shadow-[0_0_30px_rgba(220,38,38,0.35)] backdrop-blur">
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto px-6 py-6">
            {renderContent()}
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-red-300/60">
            <Link href="/docs" className="text-red-400 underline hover:text-red-300">← Back to Documentation</Link>
          </p>
        </div>
      </main>
    </div>
  )
}

