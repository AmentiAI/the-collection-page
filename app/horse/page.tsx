'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/Toast'
import { useWallet } from '@/lib/wallet/compatibility'
import { Loader2, Rocket, Trophy } from 'lucide-react'

type FormInputRow = {
  txid: string
  vout: number
  value: number
}

type FormOutputRow = {
  address: string
  amount: number
}

type HorseState = {
  id: number
  label: string
  position: number
}

const HORSE_COUNT = 5
const RACE_DURATION_MS = 12_000
const FINISH_PHASE_START = 0.75
const UPDATE_INTERVAL_MS = 160
const PRESET_FINISH_ORDER = [3, 1, 5, 2, 4] // Horse numbers in the order they cross the finish line

export default function HorsePage() {
  const wallet = useWallet()
  const toast = useToast()

  const [inputs, setInputs] = useState<FormInputRow[]>([{ txid: '', vout: 0, value: 10000 }])
  const [outputs, setOutputs] = useState<FormOutputRow[]>([{ address: '', amount: 9000 }])
  const [feeRate, setFeeRate] = useState<number>(2)
  const [selectedHorse, setSelectedHorse] = useState<number>(1)
  const [psbt, setPsbt] = useState<string>('')
  const [creatingPsbt, setCreatingPsbt] = useState(false)

  const [raceState, setRaceState] = useState<'idle' | 'running' | 'finished'>('idle')
  const [horseStates, setHorseStates] = useState<HorseState[]>(
    Array.from({ length: HORSE_COUNT }, (_, index) => ({
      id: index + 1,
      label: `Horse ${index + 1}`,
      position: 0,
    })),
  )
  const [currentLeader, setCurrentLeader] = useState<number | null>(null)
  const [raceLog, setRaceLog] = useState<string[]>([])
  const [finalOrder, setFinalOrder] = useState<number[]>([])

  const raceTimerRef = useRef<number | null>(null)
  const raceStartRef = useRef<number | null>(null)

  const connectedAddress = wallet.currentAddress ?? ''

  const networkLabel = 'oylnet'

  const resetRace = useCallback(() => {
    setRaceState('idle')
    setHorseStates((prev) =>
      prev.map((horse) => ({
        ...horse,
        position: 0,
      })),
    )
    setCurrentLeader(null)
    setRaceLog([])
    setFinalOrder([])
    if (raceTimerRef.current) {
      window.clearInterval(raceTimerRef.current)
      raceTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (raceTimerRef.current) {
        window.clearInterval(raceTimerRef.current)
      }
    }
  }, [])

  const updateHorsePositions = useCallback((progress: number) => {
    const positions = horseStates.map((horse) => {
      const rankIndex = PRESET_FINISH_ORDER.indexOf(horse.id)

      if (progress >= FINISH_PHASE_START) {
        const phaseProgress = Math.min(1, (progress - FINISH_PHASE_START) / (1 - FINISH_PHASE_START))
        const finishTarget = 1 - rankIndex * 0.02
        const startOffset = 0.74 - rankIndex * 0.015
        const interpolated = startOffset + (finishTarget - startOffset) * phaseProgress
        return Math.min(1, interpolated)
      }

      const wave = Math.sin(progress * (horse.id + 1) * 7) * 0.08
      const wobble = Math.cos(progress * (HORSE_COUNT - horse.id + 1) * 5) * 0.05
      const burst = horse.id === selectedHorse ? Math.sin(progress * 12) * 0.03 : 0
      const base = progress + wave + wobble + burst
      return Math.max(0, Math.min(0.74, base))
    })

    setHorseStates((prev) =>
      prev.map((horse, index) => ({
        ...horse,
        position: positions[index],
      })),
    )

    const leaderEntry = positions
      .map((position, index) => ({ horse: horseStates[index].id, position }))
      .sort((a, b) => b.position - a.position)[0]

    if (leaderEntry && leaderEntry.horse !== currentLeader) {
      setCurrentLeader(leaderEntry.horse)
      setRaceLog((prev) => {
        const label = `Horse ${leaderEntry.horse} takes the lead!`
        if (prev[prev.length - 1] === label) {
          return prev
        }
        return [...prev, label]
      })
    }
  }, [currentLeader, horseStates, selectedHorse])

  const startRace = useCallback(() => {
    resetRace()
    setRaceState('running')
    raceStartRef.current = performance.now()

    raceTimerRef.current = window.setInterval(() => {
      if (!raceStartRef.current) return
      const elapsed = performance.now() - raceStartRef.current
      const progress = Math.min(1, elapsed / RACE_DURATION_MS)
      updateHorsePositions(progress)

      if (progress >= 1) {
        if (raceTimerRef.current) {
          window.clearInterval(raceTimerRef.current)
          raceTimerRef.current = null
        }
        setRaceState('finished')
        setFinalOrder([...PRESET_FINISH_ORDER])
        setRaceLog((prev) => [
          ...prev,
          `🏁 Official results: ${PRESET_FINISH_ORDER.map((horse) => `Horse ${horse}`).join(', ')}`,
        ])
      }
    }, UPDATE_INTERVAL_MS) as unknown as number
  }, [resetRace, updateHorsePositions])

  const handleAddInput = useCallback(() => {
    setInputs((prev) => [...prev, { txid: '', vout: 0, value: 0 }])
  }, [])

  const handleRemoveInput = useCallback((index: number) => {
    setInputs((prev) => prev.filter((_, idx) => idx !== index))
  }, [])

  const handleInputChange = useCallback(
    (index: number, field: keyof FormInputRow, value: string) => {
      setInputs((prev) =>
        prev.map((row, idx) => {
          if (idx !== index) return row
          if (field === 'txid') {
            return { ...row, txid: value }
          }
          if (field === 'vout') {
            return { ...row, vout: Number(value ?? 0) }
          }
          if (field === 'value') {
            return { ...row, value: Number(value ?? 0) }
          }
          return row
        }),
      )
    },
    [],
  )

  const handleAddOutput = useCallback(() => {
    setOutputs((prev) => [...prev, { address: '', amount: 0 }])
  }, [])

  const handleRemoveOutput = useCallback((index: number) => {
    setOutputs((prev) => prev.filter((_, idx) => idx !== index))
  }, [])

  const handleOutputChange = useCallback(
    (index: number, field: keyof FormOutputRow, value: string) => {
      setOutputs((prev) =>
        prev.map((row, idx) => {
          if (idx !== index) return row
          if (field === 'address') {
            return { ...row, address: value }
          }
          if (field === 'amount') {
            return { ...row, amount: Number(value ?? 0) }
          }
          return row
        }),
      )
    },
    [],
  )

  const handleBuildPsbt = useCallback(async () => {
    if (!connectedAddress) {
      toast.error('Connect your wallet to the oylnet first.')
      return
    }

    if (inputs.some((row) => row.txid.trim().length === 0)) {
      toast.error('Every input needs a transaction id.')
      return
    }
    if (outputs.some((row) => row.address.trim().length === 0)) {
      toast.error('Every output needs a destination address.')
      return
    }

    setCreatingPsbt(true)
    try {
      const response = await fetch('/api/horse/psbt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs,
          outputs,
          feeRate,
          horseNumber: selectedHorse,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message = payload?.error ?? `Horse PSBT creation failed (${response.status}).`
        throw new Error(message)
      }

      const payload = await response.json()
      setPsbt(payload?.psbt ?? '')
      toast.success('PSBT built for oylnet.')
      startRace()
    } catch (error) {
      console.error('Failed to create horse PSBT', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create PSBT.')
    } finally {
      setCreatingPsbt(false)
    }
  }, [connectedAddress, feeRate, inputs, outputs, selectedHorse, startRace, toast])

  const activeLeaderboard = useMemo(() => {
    if (raceState !== 'finished') {
      const positions = [...horseStates]
        .sort((a, b) => b.position - a.position)
        .map((horse) => horse.id)
      return positions
    }
    return finalOrder
  }, [finalOrder, horseStates, raceState])

  const showConnectHint = !connectedAddress

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-purple-950 via-black to-black text-white">
      <Header connected={Boolean(connectedAddress)} showMusicControls={false} />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-24 pt-20 md:px-8">
        <section className="space-y-4 rounded-3xl border border-purple-700/40 bg-black/70 p-8 shadow-[0_0_45px_rgba(168,85,247,0.35)] backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-3 font-mono text-xl uppercase tracking-[0.5em] text-purple-200 md:text-2xl">
                <Rocket className="h-6 w-6 text-purple-400 drop-shadow-[0_0_12px_rgba(192,132,252,0.8)]" />
                Horse Powered Transactions
              </h1>
              <p className="mt-2 max-w-xl font-mono text-xs uppercase tracking-[0.35em] text-purple-200/80">
                Connect on the <span className="text-purple-400">oylnet</span>, craft a PSBT, pick your horse, and watch
                the mempool stampede.
              </p>
            </div>
            <div className="rounded-2xl border border-purple-700/50 bg-purple-900/20 px-4 py-3 text-right font-mono text-[11px] uppercase tracking-[0.35em] text-purple-200">
              <div>Network: {networkLabel}</div>
              <div>Status: {connectedAddress ? 'Wallet connected' : 'Awaiting signature'}</div>
            </div>
          </div>

          {showConnectHint ? (
            <div className="rounded-2xl border border-purple-600/40 bg-purple-950/20 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.35em] text-purple-200">
              Use the wallet button in the header to connect on oylnet before building your PSBT.
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[2.2fr,1.3fr]">
            <div className="space-y-6 rounded-2xl border border-purple-700/40 bg-black/60 p-6">
              <h2 className="font-mono text-sm uppercase tracking-[0.4em] text-purple-200">Inputs</h2>
              <div className="space-y-4">
                {inputs.map((row, index) => (
                  <div
                    key={`input-${index}`}
                    className="grid gap-3 rounded-lg border border-purple-700/30 bg-purple-950/10 p-4 md:grid-cols-[2fr_1fr_1fr_auto]"
                  >
                    <Input
                      value={row.txid}
                      onChange={(event) => handleInputChange(index, 'txid', event.target.value)}
                      placeholder="Transaction ID"
                      className="bg-black/60 font-mono text-xs uppercase tracking-[0.3em] text-purple-100"
                    />
                    <Input
                      type="number"
                      value={row.vout}
                      onChange={(event) => handleInputChange(index, 'vout', event.target.value)}
                      placeholder="Vout"
                      className="bg-black/60 font-mono text-xs uppercase tracking-[0.3em] text-purple-100"
                      min={0}
                    />
                    <Input
                      type="number"
                      value={row.value}
                      onChange={(event) => handleInputChange(index, 'value', event.target.value)}
                      placeholder="Value (sats)"
                      className="bg-black/60 font-mono text-xs uppercase tracking-[0.3em] text-purple-100"
                      min={1}
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleRemoveInput(index)}
                      disabled={inputs.length === 1}
                      className="border-purple-700/50 bg-purple-900/30 text-xs font-mono uppercase tracking-[0.3em] text-purple-200 hover:bg-purple-800/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                onClick={handleAddInput}
                variant="outline"
                className="border-purple-600/60 bg-purple-900/30 text-xs font-mono uppercase tracking-[0.35em] text-purple-100 hover:bg-purple-800/40"
              >
                + Add Input
              </Button>

              <h2 className="pt-6 font-mono text-sm uppercase tracking-[0.4em] text-purple-200">Outputs</h2>
              <div className="space-y-4">
                {outputs.map((row, index) => (
                  <div
                    key={`output-${index}`}
                    className="grid gap-3 rounded-lg border border-purple-700/30 bg-purple-950/10 p-4 md:grid-cols-[2fr_1fr_auto]"
                  >
                    <Input
                      value={row.address}
                      onChange={(event) => handleOutputChange(index, 'address', event.target.value)}
                      placeholder="Destination address"
                      className="bg-black/60 font-mono text-xs uppercase tracking-[0.3em] text-purple-100"
                    />
                    <Input
                      type="number"
                      value={row.amount}
                      onChange={(event) => handleOutputChange(index, 'amount', event.target.value)}
                      placeholder="Amount (sats)"
                      className="bg-black/60 font-mono text-xs uppercase tracking-[0.3em] text-purple-100"
                      min={1}
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleRemoveOutput(index)}
                      disabled={outputs.length === 1}
                      className="border-purple-700/50 bg-purple-900/30 text-xs font-mono uppercase tracking-[0.3em] text-purple-200 hover:bg-purple-800/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                onClick={handleAddOutput}
                variant="outline"
                className="border-purple-600/60 bg-purple-900/30 text-xs font-mono uppercase tracking-[0.35em] text-purple-100 hover:bg-purple-800/40"
              >
                + Add Output
              </Button>

              <div className="grid gap-4 pt-6 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.35em] text-purple-300">
                    Fee Rate (sat/vB)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={feeRate}
                    onChange={(event) => setFeeRate(Number(event.target.value ?? 1))}
                    className="bg-black/60 font-mono text-xs uppercase tracking-[0.3em] text-purple-100"
                  />
                </label>
                <label className="space-y-2">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.35em] text-purple-300">
                    Your Horse (1-5)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={selectedHorse}
                    onChange={(event) => setSelectedHorse(Math.min(5, Math.max(1, Number(event.target.value ?? 1))))}
                    className="bg-black/60 font-mono text-xs uppercase tracking-[0.3em] text-purple-100"
                  />
                </label>
                <div className="space-y-2">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.35em] text-purple-300">
                    Action
                  </span>
                  <Button
                    type="button"
                    disabled={creatingPsbt}
                    onClick={handleBuildPsbt}
                    className="w-full border border-purple-500 bg-purple-700/70 text-xs font-mono uppercase tracking-[0.4em] text-purple-50 hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creatingPsbt ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Building PSBT…
                      </>
                    ) : (
                      'Build PSBT & Start Race'
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-purple-700/40 bg-black/60 p-6">
                <h2 className="flex items-center gap-2 font-mono text-sm uppercase tracking-[0.4em] text-purple-200">
                  <Trophy className="h-4 w-4 text-purple-400" />
                  Current Standings
                </h2>
                <ol className="mt-4 space-y-2 font-mono text-xs uppercase tracking-[0.3em] text-purple-100">
                  {activeLeaderboard.map((horse) => (
                    <li
                      key={`leader-${horse}`}
                      className={`flex items-center justify-between rounded-lg border border-purple-700/30 bg-purple-900/20 px-3 py-2 ${
                        horse === selectedHorse ? 'text-amber-200' : ''
                      }`}
                    >
                      <span>Horse {horse}</span>
                      <span>
                        {raceState === 'finished'
                          ? `Finish ${PRESET_FINISH_ORDER.indexOf(horse) + 1}`
                          : horseStates.find((entry) => entry.id === horse)?.position
                            ? `${Math.round(
                                (horseStates.find((entry) => entry.id === horse)?.position ?? 0) * 100,
                              )}%`
                            : 'Ready'}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-2xl border border-purple-700/40 bg-black/60 p-6">
                <h2 className="font-mono text-sm uppercase tracking-[0.4em] text-purple-200">Race Commentary</h2>
                <div className="mt-4 space-y-2 font-mono text-xs uppercase tracking-[0.3em] text-purple-100/80">
                  {raceLog.length === 0 ? (
                    <p className="text-purple-400/60">The crowd awaits the starting bell…</p>
                  ) : (
                    raceLog.map((entry, index) => (
                      <p key={`log-${index}`} className="rounded border border-purple-700/30 bg-purple-900/20 px-3 py-2">
                        {entry}
                      </p>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-purple-700/40 bg-black/60 p-6">
                <h2 className="font-mono text-sm uppercase tracking-[0.4em] text-purple-200">Latest PSBT</h2>
                <textarea
                  className="mt-3 h-48 w-full resize-none rounded-lg border border-purple-700/30 bg-black/70 p-3 font-mono text-xs text-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
                  readOnly
                  value={psbt}
                  placeholder="Build a PSBT to view the base64 payload."
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-purple-700/40 bg-black/70 p-8 shadow-[0_0_45px_rgba(168,85,247,0.35)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-mono text-lg uppercase tracking-[0.45em] text-purple-200 md:text-xl">
                Oylnet Derby
              </h2>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.35em] text-purple-200/80">
                Animated race simulates shifting leaders before honoring the configured finish order.
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-purple-300/60">
                Adjust <code>PRESET_FINISH_ORDER</code> in <code>/app/horse/page.tsx</code> to rig the results.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={resetRace}
              className="border-purple-600/60 bg-purple-900/30 text-xs font-mono uppercase tracking-[0.35em] text-purple-100 hover:bg-purple-800/40"
            >
              Reset Track
            </Button>
          </div>

          <div className="mt-6 space-y-4 rounded-2xl border border-purple-700/40 bg-gradient-to-r from-purple-950/50 via-black to-purple-950/50 p-6">
            {horseStates.map((horse) => (
              <div key={horse.id} className="relative h-16 overflow-hidden rounded-xl border border-purple-700/30 bg-black/70">
                <div className="absolute inset-y-0 left-0 flex w-20 items-center justify-center border-r border-purple-700/30 bg-purple-900/30 font-mono text-xs uppercase tracking-[0.35em] text-purple-200">
                  #{horse.id}
                </div>
                <div className="absolute inset-0 left-20 right-4">
                  <div
                    className="relative h-full w-full transition-transform duration-150 ease-linear"
                    style={{
                      transform: `translateX(${Math.min(1, Math.max(0, horse.position)) * 100}%)`,
                    }}
                  >
                    <div className="absolute top-1/2 flex -translate-y-1/2 items-center gap-3 rounded-full border border-purple-600/50 bg-purple-900/80 px-4 py-2 shadow-[0_0_15px_rgba(168,85,247,0.45)]">
                      <span className="font-mono text-xs uppercase tracking-[0.35em] text-purple-100">
                        Horse {horse.id}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-purple-200/70">
                        {Math.round(horse.position * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-purple-600/40 to-transparent" />
              </div>
            ))}
          </div>

          {raceState === 'finished' ? (
            <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-900/10 px-6 py-4 font-mono text-xs uppercase tracking-[0.35em] text-amber-200">
              Final standings:{' '}
              {finalOrder.length > 0
                ? finalOrder.map((horse, index) => `${index + 1}. Horse ${horse}`).join(' • ')
                : 'Race reset.'}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}


