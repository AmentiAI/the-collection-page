'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Zap, Waves, Undo2, Package, Coins, Send } from 'lucide-react'
import Header from '@/components/Header'

const liveTools = [
  {
    name: 'Transaction Speedup',
    description: 'Accelerate stuck reveals or wallet transactions by crafting a CPFP boost.',
    href: '/tools/speedup',
    icon: Zap
  },
  {
    name: 'Cancel Transaction',
    description: 'RBF an opt-in send back to your payment wallet when miners ignore it.',
    href: '/tools/cancel',
    icon: Undo2
  }
]

const upcomingTools = [
  {
    name: 'Inscriptions Management',
    description: 'Streamline batch inscription housekeeping with queue-based actions.',
    icon: Package
  },
  {
    name: 'Recover Padding Sats',
    description: 'Pull back the extra sats sitting in oversized inscription UTXOs.',
    icon: Coins
  },
  {
    name: 'Transfer Inscriptions',
    description: 'Dispatch multiple inscriptions to one or many addresses in one go.',
    icon: Send
  }
]

export default function ToolsLandingContent() {
  const [isHolder, setIsHolder] = useState<boolean | undefined>(undefined)
  const [isVerifying, setIsVerifying] = useState(false)
  const [connected, setConnected] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black">
      <Header
        isHolder={isHolder}
        isVerifying={isVerifying}
        connected={connected}
        onHolderVerified={(holder) => {
          setIsHolder(holder)
          setIsVerifying(false)
        }}
        onVerifyingStart={() => setIsVerifying(true)}
        onConnectedChange={setConnected}
      />
      <div className="px-4 py-12 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
          <header className="space-y-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-900/20 px-4 py-1 text-xs font-mono uppercase tracking-[0.3em] text-blue-200">
              <Waves className="h-4 w-4" /> Pools of the Damned
            </div>
            <h1 className="text-4xl font-black uppercase tracking-[0.55em] text-blue-200 md:text-5xl">
              Pools of the Damned
            </h1>
            <p className="mx-auto max-w-2xl text-sm text-zinc-400 md:text-base">
              Tools forged for verified holders. Speed up transactions now; more infernal utilities surface soon.
            </p>
            {connected && isHolder && (
              <p className="text-xs uppercase tracking-[0.4em] text-emerald-300">Access granted — The Damned recognize you.</p>
            )}
          </header>

          <section className="grid gap-6 md:grid-cols-2">
            {liveTools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group relative overflow-hidden rounded-2xl border border-blue-700/40 bg-zinc-950/70 p-6 transition-all duration-300 hover:border-blue-400 hover:bg-blue-900/20 hover:shadow-[0_0_40px_rgba(56,189,248,0.25)]"
              >
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="rounded-lg border border-blue-400/40 bg-blue-900/40 p-3 text-blue-200 shadow-[0_0_20px_rgba(56,189,248,0.3)]">
                        <tool.icon className="h-6 w-6" />
                      </span>
                      <h2 className="text-xl font-bold text-white transition-colors group-hover:text-blue-100">{tool.name}</h2>
                    </div>
                    <span className="text-xs font-mono uppercase tracking-[0.3em] text-blue-200">Open</span>
                  </div>
                  <p className="flex-1 text-sm text-zinc-400">{tool.description}</p>
                </div>
              </Link>
            ))}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-zinc-500">Coming Soon</h2>
              <span className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-600">In fabrication</span>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {upcomingTools.map((tool) => (
                <div
                  key={tool.name}
                  className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-black/40 p-6 text-zinc-500"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[#ffffff05] to-transparent" aria-hidden="true" />
                  <div className="relative flex h-full flex-col gap-4 opacity-60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="rounded-lg border border-zinc-700/60 bg-zinc-900/70 p-3 text-zinc-500">
                          <tool.icon className="h-6 w-6" />
                        </span>
                        <h3 className="text-lg font-semibold text-zinc-300">{tool.name}</h3>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-600">Soon</span>
                    </div>
                    <p className="text-sm text-zinc-500">{tool.description}</p>
                  </div>
                  <div className="absolute inset-0 rounded-2xl border border-zinc-800/70" aria-hidden="true" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

