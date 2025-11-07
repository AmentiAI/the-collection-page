import Link from 'next/link'
import { Zap, Waves, Undo2 } from 'lucide-react'
import Header from '@/components/Header'

export const metadata = {
  title: 'Pools of the Damned | The Damned',
  description: 'Slip into our infernal pools to access holder utilities.'
}

const pools = [
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

export default function PoolsOfTheDamnedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black">
      <Header />
      <div className="px-4 py-12 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
          <header className="space-y-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-900/20 px-4 py-1 text-xs font-mono uppercase tracking-[0.3em] text-blue-200">
              <Waves className="h-4 w-4" /> Pools of the Damned
            </div>
            <h1 className="text-4xl font-black uppercase tracking-[0.6em] text-blue-200 md:text-5xl">Infernal Utility Pools</h1>
            <p className="mx-auto max-w-2xl text-sm text-zinc-400 md:text-base">
              Wade in for holder-only rituals. Start with Transaction Speedup; more cursed tools surface soon.
            </p>
          </header>

          <section className="grid gap-6 md:grid-cols-2">
            {pools.map((tool) => (
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
                  <span className="text-xs font-mono uppercase tracking-[0.3em] text-blue-200">Enter</span>
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

