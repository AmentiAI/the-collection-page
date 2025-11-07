import Link from 'next/link'
import { Zap, Wrench } from 'lucide-react'
import Header from '@/components/Header'

export const metadata = {
  title: 'Tools | The Damned',
  description: 'Utility hub for holders of The Damned.'
}

const tools = [
  {
    name: 'Transaction Speedup',
    description: 'Accelerate stuck reveals or wallet transactions by crafting a CPFP boost.',
    href: '/tools/speedup',
    icon: Zap
  }
]

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black">
      <Header />
      <div className="px-4 py-12 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-600/40 bg-red-900/20 px-4 py-1 text-xs font-mono uppercase tracking-[0.3em] text-red-300">
            <Wrench className="h-4 w-4" /> Tools Lab
          </div>
          <h1 className="text-4xl font-black uppercase tracking-widest text-red-500 md:text-5xl">Utility Arsenal</h1>
          <p className="mx-auto max-w-2xl text-sm text-zinc-400 md:text-base">
            Dial in holder-only mechanics. Start with the Transaction Speedup to unstick reveals, then check back as we add more cult utilities.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group relative overflow-hidden rounded-2xl border border-red-700/40 bg-zinc-950/70 p-6 transition-all duration-300 hover:border-red-500 hover:bg-red-950/20 hover:shadow-[0_0_40px_rgba(255,0,0,0.25)]"
            >
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg border border-red-500/40 bg-red-900/40 p-3 text-red-300 shadow-[0_0_20px_rgba(255,0,0,0.3)]">
                      <tool.icon className="h-6 w-6" />
                    </span>
                    <h2 className="text-xl font-bold text-white transition-colors group-hover:text-red-200">{tool.name}</h2>
                  </div>
                  <span className="text-xs font-mono uppercase tracking-[0.3em] text-red-300">Open</span>
                </div>
                <p className="flex-1 text-sm text-zinc-400">{tool.description}</p>
              </div>
            </Link>
          ))}
        </section>
        </div>
      </div>
    </div>
  )
}

