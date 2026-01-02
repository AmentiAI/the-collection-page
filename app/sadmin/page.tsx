'use client'

import Link from 'next/link'
import { Shield, Skull, FileText, Users, AlertTriangle, TrendingUp, Image, Settings, Sparkles, Coins, Zap, Sword, Flame, Ghost, Trophy, List } from 'lucide-react'

type AdminLink = {
  href: string
  title: string
  description: string
  icon: React.ReactNode
  color: string
}

const adminLinks: AdminLink[] = [
  {
    href: '/admin/graverobbing',
    title: 'Grave Robbing',
    description: 'Monitor eligible graves by wallet (abandoned for 7+ days)',
    icon: <Skull className="h-8 w-8" />,
    color: 'red',
  },
  {
    href: '/admin/meta',
    title: 'Metadata Generator',
    description: 'Generate metadata JSON for The Damned collection',
    icon: <FileText className="h-8 w-8" />,
    color: 'blue',
  },
  {
    href: '/admin/abyss-burns',
    title: 'Abyss Burns',
    description: 'View and manage abyss burn records',
    icon: <AlertTriangle className="h-8 w-8" />,
    color: 'orange',
  },
  {
    href: '/admin/burn-audit',
    title: 'Burn Audit',
    description: 'Audit and verify burn transactions',
    icon: <Shield className="h-8 w-8" />,
    color: 'green',
  },
  {
    href: '/admin/damned-pool-audit',
    title: 'Damned Pool Audit',
    description: 'Monitor and audit damned pool activity',
    icon: <TrendingUp className="h-8 w-8" />,
    color: 'purple',
  },
  {
    href: '/admin/morality',
    title: 'Morality',
    description: 'Track karma and morality metrics',
    icon: <Users className="h-8 w-8" />,
    color: 'yellow',
  },
  {
    href: '/admin/ordinals',
    title: 'Ordinals',
    description: 'Manage and view ordinal collections',
    icon: <Image className="h-8 w-8" />,
    color: 'cyan',
  },
  {
    href: '/admin/ascended-queue',
    title: 'Ascended Queue',
    description: 'Manage mint queue, missing profiles, and second ascension images',
    icon: <Sparkles className="h-8 w-8" />,
    color: 'purple',
  },
  {
    href: '/admin/mint-inscriptions',
    title: 'Mint Inscriptions',
    description: 'View and monitor mint inscription records with pagination',
    icon: <Coins className="h-8 w-8" />,
    color: 'blue',
  },
  {
    href: '/admin/megamonsters',
    title: 'Mega Monster Creation',
    description: 'Generate and manage mega monster images with AI',
    icon: <Zap className="h-8 w-8" />,
    color: 'cyan',
  },
  {
    href: '/admin/dungeon-crawls',
    title: 'Dungeon Crawls',
    description: 'Create and manage dungeon crawl configurations',
    icon: <Sword className="h-8 w-8" />,
    color: 'purple',
  },
  {
    href: '/sadmin/settings',
    title: 'Global Settings',
    description: 'Configure global start time for game pages',
    icon: <Settings className="h-8 w-8" />,
    color: 'green',
  },
  {
    href: '/sadmin/burn-window',
    title: 'Burn Window',
    description: 'Manually create abyss burn windows for bonus credits',
    icon: <Flame className="h-8 w-8" />,
    color: 'red',
  },
  {
    href: '/sadmin/graveyard',
    title: 'Graveyard Viewer',
    description: 'View all graveyard entries, minted, and awaiting mint items for any wallet',
    icon: <Ghost className="h-8 w-8" />,
    color: 'red',
  },
  {
    href: '/sadmin/redemption-leaderboard',
    title: 'Redemption Leaderboard',
    description: 'Comprehensive leaderboard with wallet stats, battles, heals, crystallizations, and more',
    icon: <Trophy className="h-8 w-8" />,
    color: 'red',
  },
  {
    href: '/sadmin/collection-viewer',
    title: 'Collection Viewer',
    description: 'View all ordinals with rarity ranks and trait filters',
    icon: <List className="h-8 w-8" />,
    color: 'purple',
  },
]

const colorClasses: Record<string, { border: string; bg: string; text: string; hover: string }> = {
  red: {
    border: 'border-red-600/40',
    bg: 'bg-red-950/20',
    text: 'text-red-400',
    hover: 'hover:bg-red-950/40 hover:border-red-500/60',
  },
  blue: {
    border: 'border-blue-600/40',
    bg: 'bg-blue-950/20',
    text: 'text-blue-400',
    hover: 'hover:bg-blue-950/40 hover:border-blue-500/60',
  },
  orange: {
    border: 'border-orange-600/40',
    bg: 'bg-orange-950/20',
    text: 'text-orange-400',
    hover: 'hover:bg-orange-950/40 hover:border-orange-500/60',
  },
  green: {
    border: 'border-green-600/40',
    bg: 'bg-green-950/20',
    text: 'text-green-400',
    hover: 'hover:bg-green-950/40 hover:border-green-500/60',
  },
  purple: {
    border: 'border-purple-600/40',
    bg: 'bg-purple-950/20',
    text: 'text-purple-400',
    hover: 'hover:bg-purple-950/40 hover:border-purple-500/60',
  },
  yellow: {
    border: 'border-yellow-600/40',
    bg: 'bg-yellow-950/20',
    text: 'text-yellow-400',
    hover: 'hover:bg-yellow-950/40 hover:border-yellow-500/60',
  },
  cyan: {
    border: 'border-cyan-600/40',
    bg: 'bg-cyan-950/20',
    text: 'text-cyan-400',
    hover: 'hover:bg-cyan-950/40 hover:border-cyan-500/60',
  },
}

export default function SuperAdminPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Settings className="h-12 w-12 text-red-500" />
            <h1 className="text-5xl font-bold text-red-500">Super Admin</h1>
          </div>
          <p className="text-gray-400 text-lg">
            Central hub for all administrative tools and monitoring
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminLinks.map((link) => {
            const colors = colorClasses[link.color]
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  group relative flex flex-col gap-4 p-6 rounded-2xl border transition-all
                  ${colors.border} ${colors.bg} ${colors.hover}
                  shadow-[0_0_25px_rgba(0,0,0,0.3)]
                `}
              >
                <div className={`${colors.text} transition-transform group-hover:scale-110`}>
                  {link.icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2 group-hover:text-gray-100">
                    {link.title}
                  </h2>
                  <p className="text-sm text-gray-400 group-hover:text-gray-300">
                    {link.description}
                  </p>
                </div>
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs font-mono text-gray-500">→</span>
                </div>
              </Link>
            )
          })}
        </div>

        <div className="mt-12 p-6 rounded-2xl border border-gray-700 bg-gray-900/50">
          <h3 className="text-lg font-semibold text-gray-300 mb-2">Quick Access</h3>
          <p className="text-sm text-gray-500">
            Click any card above to navigate to the admin tool. All tools require proper authentication.
          </p>
        </div>
      </div>
    </div>
  )
}

