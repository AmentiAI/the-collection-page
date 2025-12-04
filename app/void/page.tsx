"use client"

import { useRef, useState, useEffect, useMemo, Suspense, useCallback } from "react"
import { Canvas, useFrame, useLoader } from "@react-three/fiber"
import { OrbitControls, Text, Environment, Float, Stars, Sparkles } from "@react-three/drei"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useVoidboxProgress } from "@/hooks/useVoidboxProgress"
import { TextureLoader, SRGBColorSpace, type Group, type Texture } from "three"

type MinigameType =
  | "code-guesser"
  | "match-game"
  | "storm-memory"
  | "shadow-runes"
  | "stone-plates"
  | "light-prism"
  | "infinity-loop"

interface MinigameConfig {
  type: MinigameType
  title: string
  description: string
  instructions?: string
  answer?: string
  hint?: string
  sequenceLength?: number
  symbols?: string[]
  targetPattern?: number[]
  beamTargets?: { primary: number; secondary: number }
  glyphSequence?: string[]
  energyTarget?: number
  timeLimit?: number
  gridSize?: number
}

interface FaceState {
  id: number
  name: string
  isAwake: boolean
  isUnlocked: boolean
  isCompleted: boolean
  progress: number
  color: string
  accentColor: string
  sigilEarned?: string
  textureUrl: string
  minigame: MinigameConfig
}

const MATCH_GAME_PALETTE = [
  { key: "ember", label: "Ember", base: "#ef4444", glow: "rgba(239,68,68,0.55)" },
  { key: "flare", label: "Flare", base: "#f97316", glow: "rgba(249,115,22,0.55)" },
  { key: "pulse", label: "Pulse", base: "#22d3ee", glow: "rgba(34,211,238,0.45)" },
  { key: "aether", label: "Aether", base: "#a855f7", glow: "rgba(168,85,247,0.55)" },
  { key: "verdant", label: "Verdant", base: "#34d399", glow: "rgba(52,211,153,0.45)" },
  { key: "void", label: "Void", base: "#6366f1", glow: "rgba(99,102,241,0.45)" },
] as const

type MatchGamePaletteItem = (typeof MATCH_GAME_PALETTE)[number]

const baseFaces: Omit<FaceState, "isUnlocked" | "isCompleted" | "progress">[] = [
  {
    id: 0,
    name: "Chamber I: Blood Sigil",
    isAwake: true,
    color: "#7f1d1d",
    accentColor: "#ef4444",
    sigilEarned: "🩸",
    textureUrl: "/6%20sides/333.png",
    minigame: {
      type: "code-guesser",
      title: "Bloody Code Guesser",
      description: "A blood-drenched keypad flickers in the gloom. Only those who know the damned mantra may pass.",
      instructions: "Spin the glyph wheels to reveal the mantra that opens the blood chamber.",
      answer: "im damned",
      hint: "Each wheel cycles the alphabet. Align them to whisper the crimson phrase.",
    },
  },
  {
    id: 1,
    name: "Chamber II: Core Resonance",
    isAwake: true,
    color: "#1e3a8a",
    accentColor: "#fbbf24",
    textureUrl: "/6%20sides/2222.png",
    minigame: {
      type: "match-game",
      title: "Resonance Matrix",
      description: "Charge the core by aligning prismatic shards before the energy bleed drains the chamber.",
      instructions: "Select two adjacent shards to swap them. Only swaps that create a chain of three or more will resonate.",
      hint: "Quick multi-matches feed the core faster—keep an eye on the timer.",
      energyTarget: 120,
      timeLimit: 60,
      gridSize: 6,
      symbols: ["ember", "flare", "pulse", "aether", "verdant"],
    },
  },
  {
    id: 2,
    name: "Chamber III: Shadow Sigil",
    isAwake: true,
    color: "#000000",
    accentColor: "#7c3aed",
    textureUrl: "/6%20sides/11111111.png",
    minigame: {
      type: "shadow-runes",
      title: "Runes of Betrayal",
      description: "Whispers coil in the void; only aligned runes silence the traitors.",
      instructions: "Select the rune in each column that matches the shadow's chant.",
      hint: "Only one rune per column mirrors the void's hum.",
    },
  },
  {
    id: 3,
    name: "Chamber IV: Stone Sigil",
    isAwake: true,
    color: "#6b7280",
    accentColor: "#fbbf24",
    textureUrl: "/6%20sides/1111.png",
    minigame: {
      type: "stone-plates",
      title: "Echoes of Stone",
      description: "The monolith demands the resonance of alternate plates before it yields.",
      instructions: "Toggle the pressure plates to match the ancient pattern.",
      hint: "Each strike echoes to neighboring stones.",
      targetPattern: [1, 0, 1, 0, 1],
    },
  },
  {
    id: 4,
    name: "Chamber V: Light Sigil",
    isAwake: true,
    color: "#ffffff",
    accentColor: "#a855f7",
    textureUrl: "/6%20sides/image.png",
    minigame: {
      type: "light-prism",
      title: "Crown of Light",
      description: "Radiance hums softly—split the prism to balance the twin beams.",
      instructions: "Tune the luminous sliders until both beams strike equilibrium.",
      hint: "The sigil stabilizes when the beams almost mirror the ordained intensities.",
      beamTargets: { primary: 68, secondary: 32 },
    },
  },
  {
    id: 5,
    name: "Chamber VI: Infinity Sigil",
    isAwake: true,
    color: "#312e81",
    accentColor: "#ec4899",
    textureUrl: "/6%20sides/c0f5b649435f74a8a7b9f058368092895a9b87883057cfcebdab5685c43e823ai0.png",
    minigame: {
      type: "infinity-loop",
      title: "Ouroboros Paradox",
      description: "Reality coils endlessly; trace the glyph loop to close the paradox.",
      instructions: "Press the glyphs in the eternal order before the loop snaps shut.",
      hint: "The Ouroboros begins in the mind, bends through chaos, and resolves in infinity.",
      glyphSequence: ["Ψ", "Ω", "∞", "Φ"],
    },
  },
]

export default function Component() {
  const { loading, faceProgress, userChoices, updateFaceProgress, addEarnedSigil, removeEarnedSigil, isOnline, hasRemoteSync } =
    useVoidboxProgress()

  const [selectedFace, setSelectedFace] = useState<number | null>(0)
  // Merge base faces with user progress
  const faces: FaceState[] = baseFaces.map((baseFace) => {
    const progress = faceProgress.find((p) => p.face_id === baseFace.id)

    return {
      ...baseFace,
      isUnlocked: progress?.is_unlocked ?? baseFace.id === 0,
      isCompleted: progress?.is_completed ?? false,
      progress: progress?.progress ?? 0,
    }
  })

  const completedFaces = faces.filter((f) => f.isCompleted).length

  const completeFace = async (faceId: number) => {
    const face = faces.find((f) => f.id === faceId)
    if (!face || face.isCompleted || !face.isUnlocked) return

    await updateFaceProgress(faceId, {
      is_completed: true,
      is_unlocked: true,
      progress: 100,
    })

    const nextFace = faces.find((f) => f.id === faceId + 1)
    if (nextFace && !nextFace.isUnlocked) {
      await updateFaceProgress(nextFace.id, {
        is_unlocked: true,
        progress: Math.max(nextFace.progress, 1),
      })
    }

    if (face.sigilEarned) {
      await addEarnedSigil(face.sigilEarned)
    }
  }

  const resetFace = async (faceId: number) => {
    const face = faces.find((f) => f.id === faceId)
    if (!face) return

    await updateFaceProgress(faceId, {
      is_completed: false,
      is_unlocked: true,
      progress: 0,
    })

    if (face.sigilEarned) {
      await removeEarnedSigil(face.sigilEarned)
    }
  }

  const renderMinigame = () => {
    if (selectedFace === null) return null

    const currentFace = faces[selectedFace]
    if (!currentFace.isUnlocked) {
      return <div className="text-gray-400 italic">Unlock this chamber by completing the previous ritual.</div>
    }

    const minigame = currentFace.minigame

    switch (minigame.type) {
      case "code-guesser":
        return (
          <CodeGuesserMinigame
            answer={minigame.answer ?? ""}
            isCompleted={currentFace.isCompleted}
            onSuccess={() => completeFace(currentFace.id)}
          />
        )
      case "match-game":
        return (
          <MatchGameMinigame
            isCompleted={currentFace.isCompleted}
            onSuccess={() => completeFace(currentFace.id)}
            gridSize={minigame.gridSize}
            energyTarget={minigame.energyTarget}
            timeLimit={minigame.timeLimit}
            paletteKeys={minigame.symbols}
          />
        )
      case "storm-memory":
        return (
          <StormMemoryMinigame
            sequenceLength={minigame.sequenceLength ?? 5}
            symbols={minigame.symbols ?? ["⚡", "🌩️", "🌪️", "💥", "🌧️"]}
            hint={minigame.hint}
            isCompleted={currentFace.isCompleted}
            onSuccess={() => completeFace(currentFace.id)}
          />
        )
      case "shadow-runes":
        return (
          <ShadowRunesMinigame
            hint={minigame.hint}
            isCompleted={currentFace.isCompleted}
            onSuccess={() => completeFace(currentFace.id)}
          />
        )
      case "stone-plates":
        return (
          <StonePlatesMinigame
            targetPattern={minigame.targetPattern ?? [1, 0, 1, 0, 1]}
            hint={minigame.hint}
            isCompleted={currentFace.isCompleted}
            onSuccess={() => completeFace(currentFace.id)}
          />
        )
      case "light-prism":
        return (
          <LightPrismMinigame
            beamTargets={minigame.beamTargets ?? { primary: 70, secondary: 30 }}
            hint={minigame.hint}
            isCompleted={currentFace.isCompleted}
            onSuccess={() => completeFace(currentFace.id)}
          />
        )
      case "infinity-loop":
        return (
          <InfinityLoopMinigame
            glyphSequence={minigame.glyphSequence ?? ["Ψ", "Ω", "∞", "Φ"]}
            hint={minigame.hint}
            isCompleted={currentFace.isCompleted}
            onSuccess={() => completeFace(currentFace.id)}
          />
        )
      default:
        return <div className="text-gray-400 italic">The ritual sigil shimmers uncertainly. Return later.</div>
    }
  }

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="voidbox-blood-title text-4xl mb-4">The Void Of The Damned</div>
          <div className="text-lg tracking-[0.4em] text-red-200 uppercase">Summoning your fate...</div>
        </div>
      </div>
    )
  }

  return (
    <div
      suppressHydrationWarning
      className="w-full h-screen relative overflow-hidden bg-black"
    >
      <div className="pointer-events-none absolute top-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <h1 className="voidbox-blood-title text-3xl md:text-4xl lg:text-5xl whitespace-nowrap">Void Of The Damned</h1>
      </div>

      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <Suspense fallback={null}>
          <Scene faces={faces} selectedFace={selectedFace} setSelectedFace={setSelectedFace} />
        </Suspense>
      </Canvas>

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 text-white space-y-2">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg p-4 border border-red-700/60 w-64">
          <h2 className="text-xl font-bold mb-2 tracking-[0.3em] text-red-300 uppercase">Void Ledger</h2>
          <Progress value={(completedFaces / 6) * 100} className="w-full mb-2" />
          <p className="text-sm text-red-100">{completedFaces}/6 Chambers Cleansed</p>

          <div className="mt-4 space-y-2 text-xs">
            {faces.map((face) => (
              <div key={face.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                      face.isCompleted
                        ? "border-green-500 bg-green-500/40"
                        : face.isUnlocked
                        ? "border-red-500 bg-transparent"
                        : "border-gray-600 bg-transparent"
                    }`}
                  >
                    {face.isCompleted ? "✓" : ""}
                  </span>
                  <span
                    className={
                      face.isCompleted
                        ? "text-green-300"
                        : face.isUnlocked
                        ? "text-gray-200"
                        : "text-gray-500"
                    }
                  >
                    {face.name}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-red-200">
                  {face.isCompleted ? "Cleared" : face.isUnlocked ? "Active" : "Locked"}
                </span>
              </div>
            ))}
          </div>

          {userChoices.earned_sigils.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-300 mb-1">Earned Sigils:</p>
              <div className="flex flex-wrap gap-1">
                {userChoices.earned_sigils.map((sigil, index) => (
                  <Badge key={index} className="text-xs">
                    {sigil}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 text-[10px] uppercase tracking-[0.4em] text-gray-400">
            {hasRemoteSync ? (isOnline ? "Neon Sync Active" : "Offline - Local Cache") : "Local Chronicle"}
          </div>
        </div>
      </div>

      {/* Face Info Display */}
      {selectedFace !== null && (
        <div className="absolute top-4 right-4 text-white max-w-sm">
          <div className="bg-black/80 backdrop-blur-sm rounded-lg p-4 border border-gray-600">
            <h3 className="text-lg font-bold mb-1">{faces[selectedFace].name}</h3>
            <p className="text-sm text-red-300 mb-4">{faces[selectedFace].minigame.title}</p>

            <div className="space-y-3 text-xs">
              <p className="text-gray-300">{faces[selectedFace].minigame.description}</p>

              <div className="p-3 bg-red-900/20 border border-red-800/60 rounded">
                <p className="text-gray-200 leading-relaxed">{faces[selectedFace].minigame.instructions}</p>
              </div>

              <div className="mt-4">
                {renderMinigame()}
              </div>

              {faces[selectedFace].isCompleted && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => resetFace(faces[selectedFace].id)}
                    className="w-full rounded border border-red-600/70 bg-black/40 px-4 py-2 text-xs uppercase tracking-[0.4em] text-red-200 hover:bg-red-800/30"
                  >
                    Reset Chamber
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

interface SceneProps {
  faces: FaceState[]
  selectedFace: number | null
  setSelectedFace: (faceId: number | null) => void
}

function CodeGuesserMinigame({
  answer,
  onSuccess,
  isCompleted,
}: {
  answer: string
  onSuccess: () => Promise<void> | void
  isCompleted: boolean
}) {
  const normalizedAnswer = useMemo(() => answer.trim().toLowerCase(), [answer])
  const answerGroups = useMemo<string[][]>(() => normalizedAnswer.split(" ").map((word) => word.split("")), [normalizedAnswer])
  const answerLetters = useMemo<string[]>(
    () =>
      answerGroups.flatMap((word, wordIndex) => {
        if (wordIndex === 0) return word
        return [" ", ...word]
      }),
    [answerGroups],
  )
  const groupOffsets = useMemo(() => {
    const offsets: number[] = []
    let running = 0
    answerGroups.forEach((word, index) => {
      offsets.push(running)
      running += word.length
      if (index < answerGroups.length - 1) {
        running += 1 // account for the space between words
      }
    })
    return offsets
  }, [answerGroups])
  const alphabet = useMemo<string[]>(() => "abcdefghijklmnopqrstuvwxyz".split(""), [])
  const completionTriggeredRef = useRef(false)

  const [letters, setLetters] = useState(() =>
    answerLetters.map((char) => {
      if (char === " ") return " "
      const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)]
      return randomLetter
    }),
  )

  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isCompleted) {
      setLetters(answerLetters)
      setStatus("success")
      completionTriggeredRef.current = true
    }
  }, [answerLetters, isCompleted])

  useEffect(() => {
    if (!isCompleted) {
      setLetters(() =>
        answerLetters.map((char) => {
          if (char === " ") return " "
          return alphabet[Math.floor(Math.random() * alphabet.length)]
        }),
      )
      setStatus("idle")
      completionTriggeredRef.current = false
    }
  }, [answerLetters, alphabet, isCompleted])

  const cycleLetter = (index: number, direction: "up" | "down") => {
    if (isCompleted || answerLetters[index] === " ") return

    setLetters((prev) => {
      const next = [...prev]
      const currentIndex = alphabet.indexOf(prev[index])
      const nextIndex =
        direction === "up"
          ? (currentIndex + 1) % alphabet.length
          : (currentIndex - 1 + alphabet.length) % alphabet.length
      next[index] = alphabet[nextIndex]
      setStatus("idle")
      return next
    })
  }

  const resetToRandom = () => {
    if (isCompleted) return
    setLetters(() =>
      answerLetters.map((char) => {
        if (char === " ") return " "
        return alphabet[Math.floor(Math.random() * alphabet.length)]
      }),
    )
    setStatus("idle")
  }

  const submitAnswer = async () => {
    if (isCompleted || isSubmitting) return

    setIsSubmitting(true)
    const current = letters.join("").toLowerCase()

    try {
      if (current === normalizedAnswer) {
        setStatus("success")
        if (!completionTriggeredRef.current) {
          completionTriggeredRef.current = true
          await onSuccess()
        }
      } else {
        setStatus("error")
      }
    } catch (error) {
      console.error("Failed to mark minigame as complete:", error)
      setStatus("error")
      completionTriggeredRef.current = false
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-[11px] uppercase tracking-[0.4em] text-red-300">Align the sigil</p>
        {!isCompleted && (
          <button
            type="button"
            onClick={resetToRandom}
            className="text-[10px] uppercase tracking-[0.4em] text-red-500 hover:text-red-200 transition-colors"
          >
            scramble
          </button>
        )}
      </div>

      <div className="space-y-3">
        {answerGroups.map((group, groupIndex) => {
          const baseIndex = groupOffsets[groupIndex]
          return (
            <div key={groupIndex} className="flex justify-center gap-2">
              {group.map((_, letterIndex) => {
                const globalIndex = baseIndex + letterIndex
                const char = letters[globalIndex]

                return (
                  <div
                    key={`${groupIndex}-${letterIndex}`}
                    className="flex h-20 w-16 flex-col items-center justify-between rounded border border-red-700/60 bg-black/70 p-2"
                  >
                    <button
                      type="button"
                      onClick={() => cycleLetter(globalIndex, "up")}
                      disabled={isCompleted}
                      className="text-[10px] uppercase tracking-[0.4em] text-red-200 hover:text-white disabled:opacity-40"
                    >
                      ▲
                    </button>
                    <div className="h-8 w-8 flex items-center justify-center text-2xl font-bold text-red-300 uppercase voidbox-letter">
                      {char}
                    </div>
                    <button
                      type="button"
                      onClick={() => cycleLetter(globalIndex, "down")}
                      disabled={isCompleted}
                      className="text-[10px] uppercase tracking-[0.4em] text-red-200 hover:text-white disabled:opacity-40"
                    >
                      ▼
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={submitAnswer}
        disabled={isCompleted || isSubmitting}
        className="w-full rounded border border-red-700/60 bg-red-700 px-4 py-2 text-sm uppercase tracking-[0.4em] text-red-100 hover:bg-red-800 disabled:opacity-60"
      >
        {isCompleted ? "Sigil accepted" : isSubmitting ? "Commune..." : "Submit phrase"}
      </button>

      {status === "success" && (
        <p className="text-xs text-green-400 uppercase tracking-[0.4em] text-center">Sigil accepted</p>
      )}
      {status === "error" && !isCompleted && (
        <p className="text-xs text-red-400 uppercase tracking-[0.3em] text-center">The void rejects your glyph</p>
      )}
    </div>
  )
}

function MatchGameMinigame({
  isCompleted,
  onSuccess,
  gridSize,
  energyTarget,
  timeLimit,
  paletteKeys,
}: {
  isCompleted: boolean
  onSuccess: () => Promise<void> | void
  gridSize?: number
  energyTarget?: number
  timeLimit?: number
  paletteKeys?: string[]
}) {
  const size = useMemo(() => Math.min(Math.max(gridSize ?? 6, 4), 8), [gridSize])
  const target = energyTarget ?? 120
  const limit = timeLimit ?? 60

  const palette = useMemo<MatchGamePaletteItem[]>(() => {
    if (paletteKeys && paletteKeys.length > 0) {
      const resolved = paletteKeys
        .map((key) => MATCH_GAME_PALETTE.find((item) => item.key === key))
        .filter((item): item is MatchGamePaletteItem => Boolean(item))
      if (resolved.length >= 3) {
        return resolved
      }
    }
    return MATCH_GAME_PALETTE.slice(0, Math.max(3, Math.min(5, MATCH_GAME_PALETTE.length)))
  }, [paletteKeys])

  const paletteMap = useMemo(() => {
    const map = new Map<string, MatchGamePaletteItem>()
    palette.forEach((item) => map.set(item.key, item))
    return map
  }, [palette])

  const createGem = useCallback((): string => {
    const choice = palette[Math.floor(Math.random() * palette.length)] ?? palette[0]
    return choice.key
  }, [palette])

  const findMatches = useCallback(
    (grid: (string | null)[][]) => {
      const matches = new Set<string>()

      for (let row = 0; row < size; row++) {
        let runLength = 1
        for (let col = 1; col <= size; col++) {
          const current = col < size ? grid[row][col] : null
          const previous = grid[row][col - 1]
          if (previous && current && previous === current) {
            runLength += 1
          } else {
            if (previous && runLength >= 3) {
              for (let offset = 0; offset < runLength; offset++) {
                matches.add(`${row},${col - 1 - offset}`)
              }
            }
            runLength = 1
          }
        }
      }

      for (let col = 0; col < size; col++) {
        let runLength = 1
        for (let row = 1; row <= size; row++) {
          const current = row < size ? grid[row][col] : null
          const previous = grid[row - 1][col]
          if (previous && current && previous === current) {
            runLength += 1
          } else {
            if (previous && runLength >= 3) {
              for (let offset = 0; offset < runLength; offset++) {
                matches.add(`${row - 1 - offset},${col}`)
              }
            }
            runLength = 1
          }
        }
      }

      return matches
    },
    [size],
  )

  const createInitialGrid = useCallback(() => {
    const attemptsLimit = 100
    for (let attempt = 0; attempt < attemptsLimit; attempt++) {
      const candidate: string[][] = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => createGem()),
      )
      if (findMatches(candidate).size === 0) {
        return candidate
      }
    }

    return Array.from({ length: size }, () => Array.from({ length: size }, () => createGem()))
  }, [size, createGem, findMatches])

  const [grid, setGrid] = useState<string[][]>(() => createInitialGrid())
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null)
  const [energy, setEnergy] = useState(0)
  const [timeLeft, setTimeLeft] = useState(limit)
  const [status, setStatus] = useState<"playing" | "complete" | "failed">(
    isCompleted ? "complete" : "playing",
  )
  const [feedback, setFeedback] = useState<string>("")
  const [comboChain, setComboChain] = useState(0)
  const completionRef = useRef(isCompleted)

  useEffect(() => {
    if (isCompleted) {
      completionRef.current = true
      setStatus("complete")
    }
  }, [isCompleted])

  useEffect(() => {
    if (isCompleted) {
      completionRef.current = true
      setStatus("complete")
      return
    }

    setGrid(createInitialGrid())
    setSelected(null)
    setEnergy(0)
    setTimeLeft(limit)
    setFeedback("")
    setComboChain(0)
    completionRef.current = false
    setStatus("playing")
  }, [createInitialGrid, limit, isCompleted])

  useEffect(() => {
    if (status !== "playing" || completionRef.current) return

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [status])

  useEffect(() => {
    if (status === "playing" && timeLeft === 0 && !completionRef.current) {
      setStatus("failed")
      setFeedback("The core destabilizes before it could charge.")
    }
  }, [timeLeft, status])

  const processMatches = useCallback(
    (inputGrid: string[][]) => {
      let working: (string | null)[][] = inputGrid.map((row) => [...row])
      let totalMatches = 0
      let chain = 0

      while (true) {
        const matches = findMatches(working)
        if (matches.size === 0) {
          break
        }

        chain += 1
        totalMatches += matches.size

        matches.forEach((key) => {
          const [r, c] = key.split(",").map(Number)
          if (!Number.isNaN(r) && !Number.isNaN(c)) {
            working[r][c] = null
          }
        })

        for (let col = 0; col < size; col++) {
          let writeRow = size - 1
          for (let row = size - 1; row >= 0; row--) {
            const value = working[row][col]
            if (value !== null && value !== undefined) {
              working[writeRow][col] = value
              if (writeRow !== row) {
                working[row][col] = null
              }
              writeRow -= 1
            }
          }
          while (writeRow >= 0) {
            working[writeRow][col] = createGem()
            writeRow -= 1
          }
        }
      }

      setGrid(working.map((row) => row.map((cell) => cell ?? createGem())))

      if (totalMatches > 0) {
        const comboEnergy = totalMatches * 5 + Math.max(0, chain - 1) * 5
        setComboChain(chain)
        if (!completionRef.current) {
          setFeedback(
            chain > 1
              ? `Chain ×${chain}! Energy +${comboEnergy}.`
              : `Energy pulse +${comboEnergy}.`,
          )
        }

        setEnergy((prev) => {
          const next = Math.min(prev + comboEnergy, target)
          if (next >= target && !completionRef.current) {
            completionRef.current = true
            setStatus("complete")
            setFeedback("The core surges to life!")
            void onSuccess()
          }
          return next
        })
      } else if (!completionRef.current) {
        setComboChain(0)
        setFeedback("No resonance detected.")
      }
    },
    [createGem, findMatches, onSuccess, size, target],
  )

  const handleTileClick = (row: number, col: number) => {
    if (status !== "playing" || completionRef.current) return

    if (selected && selected.row === row && selected.col === col) {
      setSelected(null)
      return
    }

    if (!selected) {
      setSelected({ row, col })
      return
    }

    const isAdjacent = Math.abs(selected.row - row) + Math.abs(selected.col - col) === 1

    if (!isAdjacent) {
      setSelected({ row, col })
      return
    }

    const swapped = grid.map((gridRow) => [...gridRow])
    const temp = swapped[selected.row][selected.col]
    swapped[selected.row][selected.col] = swapped[row][col]
    swapped[row][col] = temp

    const matches = findMatches(swapped)
    if (matches.size === 0) {
      setSelected(null)
      setFeedback("The swap fizzles—no resonance.")
      return
    }

    setSelected(null)
    setGrid(swapped)
    processMatches(swapped)
  }

  useEffect(() => {
    if (status === "failed" && !completionRef.current) {
      setSelected(null)
    }
  }, [status])

  const resetGame = useCallback(() => {
    if (completionRef.current && isCompleted) return
    setGrid(createInitialGrid())
    setSelected(null)
    setEnergy(0)
    setTimeLeft(limit)
    setStatus("playing")
    setFeedback("Recalibrate the shards.")
    setComboChain(0)
    completionRef.current = false
  }, [createInitialGrid, limit, isCompleted])

  const energyPercent = Math.min(100, Math.round((energy / target) * 100))
  const timePercent = Math.min(100, Math.round((timeLeft / limit) * 100))

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-blue-200">
          <span>Core charge</span>
          <span>
            {energy}/{target}
          </span>
        </div>
        <Progress value={energyPercent} className="h-2" />

        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-blue-200">
          <span>Time remaining</span>
          <span>{timeLeft}s</span>
        </div>
        <Progress value={timePercent} className="h-2 bg-[#120d1f]" />
      </div>

      {status === "failed" && (
        <div className="rounded border border-red-700/60 bg-red-900/20 p-3 text-center text-xs uppercase tracking-[0.3em] text-red-200">
          The core flickers out.
        </div>
      )}

      {status === "complete" && (
        <div className="rounded border border-amber-500/60 bg-amber-900/20 p-3 text-center text-xs uppercase tracking-[0.3em] text-amber-200">
          Core fully charged!
        </div>
      )}

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        }}
      >
        {grid.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const paletteItem = paletteMap.get(cell) ?? palette[0] ?? MATCH_GAME_PALETTE[0]
            const isActive = selected?.row === rowIndex && selected?.col === colIndex
            const disabled = status !== "playing" || completionRef.current

            return (
              <button
                key={`${rowIndex}-${colIndex}`}
                type="button"
                onClick={() => handleTileClick(rowIndex, colIndex)}
                disabled={disabled}
                className={`relative flex h-12 items-center justify-center rounded-lg border transition-all duration-150 focus:outline-none ${
                  disabled ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5"
                }`}
                style={{
                  backgroundColor: paletteItem.base,
                  boxShadow: isActive
                    ? `0 0 18px ${paletteItem.glow}`
                    : `0 0 10px ${paletteItem.glow}`,
                  borderColor: isActive ? "#ffffff" : "rgba(15, 23, 42, 0.45)",
                }}
              >
                <span className="text-sm font-semibold uppercase tracking-[0.3em] text-black drop-shadow-[0_0_4px_rgba(0,0,0,0.4)]">
                  {paletteItem.label.slice(0, 1)}
                </span>
              </button>
            )
          }),
        )}
      </div>

      <div className="text-xs text-blue-200/80">
        {feedback && <p className="uppercase tracking-[0.3em]">{feedback}</p>}
        {!feedback && status === "playing" && (
          <p className="uppercase tracking-[0.3em]">Swap shards to build resonance.</p>
        )}
        {comboChain > 1 && status === "playing" && (
          <p className="uppercase tracking-[0.3em] text-green-300">Combo chain ×{comboChain}</p>
        )}
      </div>

      {status === "failed" && (
        <button
          type="button"
          onClick={resetGame}
          className="w-full rounded border border-blue-700/60 bg-blue-900/40 px-4 py-2 text-xs uppercase tracking-[0.4em] text-blue-200 hover:bg-blue-800/50"
        >
          Restart calibration
        </button>
      )}
    </div>
  )
}

function createRandomSequence(symbols: string[], length: number) {
  if (length <= 0) return []
  const pool = symbols.length > 0 ? symbols : ["⚡"]
  return Array.from({ length }, () => pool[Math.floor(Math.random() * pool.length)])
}

function StormMemoryMinigame({
  sequenceLength,
  symbols,
  hint,
  isCompleted,
  onSuccess,
}: {
  sequenceLength: number
  symbols: string[]
  hint?: string
  isCompleted: boolean
  onSuccess: () => Promise<void> | void
}) {
  const safeLength = Math.max(3, sequenceLength)
  const symbolPool = useMemo(() => (symbols.length ? symbols : ["⚡", "🌩️", "🌪️", "💥", "🌧️"]), [symbols])
  const [sequence, setSequence] = useState<string[]>(() => createRandomSequence(symbolPool, safeLength))
  const [playerIndex, setPlayerIndex] = useState(0)
  const [status, setStatus] = useState<"showing" | "awaiting" | "success" | "error">("showing")
  const [displayIndex, setDisplayIndex] = useState(-1)
  const [attempts, setAttempts] = useState(0)
  const [isCompleting, setIsCompleting] = useState(false)
  const [hasSeenIntro, setHasSeenIntro] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const errorTimeoutRef = useRef<number | null>(null)

  const clearTimers = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (errorTimeoutRef.current) {
      window.clearTimeout(errorTimeoutRef.current)
      errorTimeoutRef.current = null
    }
  }

  const revealSequence = useCallback(
    (newSequence?: string[]) => {
      if (isCompleted) return
      setAttempts((prev) => (newSequence ? 0 : prev))
      if (newSequence) {
        setSequence(newSequence)
      }
      setStatus("showing")
    },
    [isCompleted],
  )

  useEffect(() => {
    if (isCompleted) {
      clearTimers()
      setStatus("success")
      setDisplayIndex(-1)
    }
  }, [isCompleted])

  useEffect(() => {
    if (isCompleted || hasSeenIntro) return
    setHasSeenIntro(true)
    revealSequence(sequence)
  }, [hasSeenIntro, isCompleted, sequence, revealSequence])

  useEffect(() => {
    if (status !== "showing" || isCompleted) return

    setPlayerIndex(0)
    setDisplayIndex(-1)

    clearTimers()

    let current = 0
    intervalRef.current = window.setInterval(() => {
      setDisplayIndex(current)
      current += 1
      if (current >= sequence.length) {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }, 650)

    timeoutRef.current = window.setTimeout(() => {
      setDisplayIndex(-1)
      if (!isCompleted) {
        setStatus("awaiting")
      }
    }, sequence.length * 650 + 400)

    return () => {
      clearTimers()
    }
  }, [status, sequence, isCompleted])

  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [])

  const resetSequence = useCallback(() => {
    if (isCompleted) return
    revealSequence(createRandomSequence(symbolPool, safeLength))
  }, [isCompleted, revealSequence, symbolPool, safeLength])

  const handleSymbolClick = async (symbol: string) => {
    if (isCompleted || status !== "awaiting" || isCompleting) return

    const expected = sequence[playerIndex]
    if (symbol === expected) {
      const nextIndex = playerIndex + 1
      setPlayerIndex(nextIndex)

      if (nextIndex >= sequence.length) {
        setStatus("success")
        setIsCompleting(true)
        try {
          await onSuccess()
        } finally {
          setIsCompleting(false)
        }
      }
    } else {
      setStatus("error")
      setPlayerIndex(0)
      setAttempts((prev) => prev + 1)
      errorTimeoutRef.current = window.setTimeout(() => {
        if (!isCompleted) {
          revealSequence()
        }
      }, 1000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.4em] text-blue-200">Echo the storm</p>
        {!isCompleted && (
          <button
            type="button"
            onClick={resetSequence}
            className="text-[10px] uppercase tracking-[0.4em] text-blue-400 hover:text-blue-200 transition-colors"
          >
            new pattern
          </button>
        )}
      </div>

      {!isCompleted && (
        <button
          type="button"
          onClick={() => revealSequence()}
          className="w-full rounded border border-blue-700/60 bg-blue-900/40 px-3 py-2 text-[11px] uppercase tracking-[0.35em] text-blue-200 hover:bg-blue-800/50 transition-colors"
        >
          replay the vision
        </button>
      )}

      <div className="grid grid-cols-5 gap-2">
        {sequence.map((symbol, index) => (
          <div
            key={`${symbol}-${index}`}
            className={`flex h-16 items-center justify-center rounded border bg-black/60 text-2xl transition-all ${
              displayIndex === index || (status !== "showing" && index < playerIndex)
                ? "border-blue-500 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.6)]"
                : "border-blue-900 text-blue-900"
            }`}
          >
            {displayIndex === index || status !== "showing" ? symbol : "?"}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {symbolPool.map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => handleSymbolClick(symbol)}
            disabled={isCompleted || status === "showing" || isCompleting}
            className={`flex-1 min-w-[56px] rounded border px-3 py-2 text-lg transition-all ${
              status === "awaiting"
                ? "border-blue-600/60 bg-blue-900/40 text-blue-200 hover:bg-blue-800/60"
                : "border-blue-900 bg-black/60 text-blue-500"
            } disabled:opacity-50`}
          >
            {symbol}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-blue-200/80">
        <span>Streak {playerIndex}/{sequence.length}</span>
        <span>Attempts {attempts}</span>
      </div>

      {hint && <p className="text-xs text-blue-200/80 italic">{hint}</p>}

      {status === "success" && <p className="text-xs text-green-400 uppercase tracking-[0.4em]">The tempest obeys.</p>}
      {status === "error" && !isCompleted && (
        <p className="text-xs text-red-400 uppercase tracking-[0.3em]">The storm lashes back. Watch closely and try again.</p>
      )}
      {status === "showing" && !isCompleted && <p className="text-xs text-blue-400 uppercase tracking-[0.3em]">Memorize the bolts...</p>}
      {status === "awaiting" && !isCompleted && <p className="text-xs text-blue-200/70 uppercase tracking-[0.3em]">Channel the lightning in order.</p>}
    </div>
  )
}

function ShadowRunesMinigame({
  hint,
  isCompleted,
  onSuccess,
}: {
  hint?: string
  isCompleted: boolean
  onSuccess: () => Promise<void> | void
}) {
  const runeColumns = useMemo(
    () => [
      ["ᚠ", "ᚢ", "ᚣ", "ᚤ"],
      ["ᚨ", "ᚾ", "ᚱ", "ᚷ"],
      ["ᛞ", "ᛉ", "ᛝ", "ᛟ"],
    ],
    [],
  )
  const solution = useMemo(
    () => runeColumns.map((column) => column[Math.floor(Math.random() * column.length)]),
    [runeColumns],
  )
  const [selections, setSelections] = useState<(string | null)[]>(() => runeColumns.map(() => null))
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [isChecking, setIsChecking] = useState(false)
  const [chantVisible, setChantVisible] = useState(false)

  useEffect(() => {
    if (isCompleted) {
      setSelections(solution)
      setStatus("success")
    }
  }, [isCompleted, solution])

  const handleSelect = (columnIndex: number, rune: string) => {
    if (isCompleted) return
    setSelections((prev) => {
      const next = [...prev]
      next[columnIndex] = rune
      return next
    })
    setStatus("idle")
  }

  const handleCheck = async () => {
    if (isCompleted || isChecking) return
    if (selections.some((item) => item === null)) {
      setStatus("error")
      return
    }

    const matches = selections.every((rune, index) => rune === solution[index])
    if (matches) {
      setStatus("success")
      setIsChecking(true)
      try {
        await onSuccess()
      } finally {
        setIsChecking(false)
      }
    } else {
      setStatus("error")
    }
  }

  const handleReset = () => {
    if (isCompleted) return
    setSelections(runeColumns.map(() => null))
    setStatus("idle")
  }

  const chant = useMemo(() => solution.join(" • "), [solution])

  const revealChant = () => {
    if (isCompleted) return
    setChantVisible(true)
    window.setTimeout(() => setChantVisible(false), 1200)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.4em] text-purple-200">Align the runes</p>
        {!isCompleted && (
          <button
            type="button"
            onClick={handleReset}
            className="text-[10px] uppercase tracking-[0.4em] text-purple-400 hover:text-purple-200 transition-colors"
          >
            purge
          </button>
        )}
      </div>

      {!isCompleted && (
        <button
          type="button"
          onClick={revealChant}
          className="w-full rounded border border-purple-600/60 bg-purple-900/30 px-3 py-2 text-[11px] uppercase tracking-[0.35em] text-purple-200 hover:bg-purple-800/50 transition-colors"
        >
          listen to the whisper
        </button>
      )}

      {chantVisible && !isCompleted && (
        <div className="rounded border border-purple-600/60 bg-black/70 px-3 py-2 text-center text-sm text-purple-200">
          {chant}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {runeColumns.map((column, columnIndex) => (
          <div key={`column-${columnIndex}`} className="space-y-2">
            {column.map((rune) => {
              const isSelected = selections[columnIndex] === rune
              return (
                <button
                  key={rune}
                  type="button"
                  onClick={() => handleSelect(columnIndex, rune)}
                  disabled={isCompleted}
                  className={`w-full rounded border px-3 py-2 text-xl transition-all ${
                    isSelected
                      ? "border-purple-400 bg-purple-900/40 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.45)]"
                      : "border-purple-900 bg-black/60 text-purple-500 hover:border-purple-600"
                  }`}
                >
                  {rune}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleCheck}
        disabled={isCompleted || isChecking}
        className="w-full rounded border border-purple-500 bg-purple-900/40 px-4 py-2 text-xs uppercase tracking-[0.4em] text-purple-200 hover:bg-purple-800/60 disabled:opacity-60"
      >
        Commune with shadow
      </button>

      {hint && <p className="text-xs text-purple-200/80 italic">{hint}</p>}

      {status === "success" && <p className="text-xs text-green-400 uppercase tracking-[0.4em]">The rune chorus quiets.</p>}
      {status === "error" && !isCompleted && (
        <p className="text-xs text-red-400 uppercase tracking-[0.3em]">The void rejects this chorus. Listen again.</p>
      )}
    </div>
  )
}

function createInitialPlatePattern(length: number) {
  if (length <= 0) return []
  const pattern = Array.from({ length }, () => (Math.random() > 0.5 ? 1 : 0))
  if (pattern.every((value) => value === pattern[0])) {
    pattern[0] = pattern[0] ? 0 : 1
  }
  return pattern
}

function StonePlatesMinigame({
  targetPattern,
  hint,
  isCompleted,
  onSuccess,
}: {
  targetPattern: number[]
  hint?: string
  isCompleted: boolean
  onSuccess: () => Promise<void> | void
}) {
  const normalizedTarget = useMemo(() => (targetPattern.length ? targetPattern : [1, 0, 1, 0, 1]), [targetPattern])
  const [plates, setPlates] = useState<number[]>(() => createInitialPlatePattern(normalizedTarget.length))
  const [status, setStatus] = useState<"active" | "success">("active")
  const completionTriggeredRef = useRef(false)

  useEffect(() => {
    if (isCompleted) {
      setPlates(normalizedTarget)
      setStatus("success")
      completionTriggeredRef.current = true
    }
  }, [isCompleted, normalizedTarget])

  const togglePlate = (index: number) => {
    if (isCompleted) return

    setPlates((previous) => {
      const next = [...previous]
      next[index] = next[index] ? 0 : 1
      if (index > 0) next[index - 1] = next[index - 1] ? 0 : 1
      if (index < next.length - 1) next[index + 1] = next[index + 1] ? 0 : 1

      const matched = next.every((value, idx) => value === (normalizedTarget[idx] ?? 0))
      if (matched && !completionTriggeredRef.current) {
        completionTriggeredRef.current = true
        setStatus("success")
        void onSuccess()
      }

      return next
    })
  }

  const resetPlates = () => {
    if (isCompleted) return
    completionTriggeredRef.current = false
    setStatus("active")
    setPlates(createInitialPlatePattern(normalizedTarget.length))
  }

  const progress = plates.filter((value, index) => value === (normalizedTarget[index] ?? 0)).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.4em] text-amber-200">Resonate the plates</p>
        {!isCompleted && (
          <button
            type="button"
            onClick={resetPlates}
            className="text-[10px] uppercase tracking-[0.4em] text-amber-400 hover:text-amber-200 transition-colors"
          >
            reset
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.35em] text-amber-300">
        Target
        <div className="flex gap-1">
          {normalizedTarget.map((value, index) => (
            <span
              key={`target-${index}`}
              className={`inline-flex h-6 w-6 items-center justify-center rounded border px-1 ${
                value ? "border-amber-500 bg-amber-900/50 text-amber-200" : "border-amber-900 bg-black/60 text-amber-600"
              }`}
            >
              {value ? "■" : "□"}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {plates.map((value, index) => (
          <button
            key={index}
            type="button"
            onClick={() => togglePlate(index)}
            disabled={isCompleted}
            className={`flex h-16 w-12 items-center justify-center rounded border transition-all ${
              value
                ? "border-amber-400 bg-amber-900/40 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.45)]"
                : "border-amber-900 bg-black/60 text-amber-900 hover:border-amber-600"
            }`}
          >
            {value ? "■" : "□"}
          </button>
        ))}
      </div>

      <div className="text-xs uppercase tracking-[0.3em] text-amber-300">
        Resonance {progress}/{normalizedTarget.length}
      </div>

      {hint && <p className="text-xs text-amber-200/80 italic">{hint}</p>}

      {status === "success" && <p className="text-xs text-green-400 uppercase tracking-[0.4em]">The monolith hums in harmony.</p>}
    </div>
  )
}

function LightPrismMinigame({
  beamTargets,
  hint,
  isCompleted,
  onSuccess,
}: {
  beamTargets: { primary: number; secondary: number }
  hint?: string
  isCompleted: boolean
  onSuccess: () => Promise<void> | void
}) {
  const targets = useMemo(
    () => ({
      primary: Math.min(Math.max(beamTargets.primary, 0), 100),
      secondary: Math.min(Math.max(beamTargets.secondary, 0), 100),
    }),
    [beamTargets],
  )
  const [primary, setPrimary] = useState(() => Math.floor(Math.random() * 100))
  const [secondary, setSecondary] = useState(() => Math.floor(Math.random() * 100))
  const [status, setStatus] = useState<"dialing" | "success">("dialing")
  const completionTriggeredRef = useRef(false)
  const tolerance = 3

  useEffect(() => {
    if (isCompleted) {
      setPrimary(targets.primary)
      setSecondary(targets.secondary)
      setStatus("success")
      completionTriggeredRef.current = true
    }
  }, [isCompleted, targets])

  useEffect(() => {
    if (isCompleted || completionTriggeredRef.current) return
    const withinPrimary = Math.abs(primary - targets.primary) <= tolerance
    const withinSecondary = Math.abs(secondary - targets.secondary) <= tolerance

    if (withinPrimary && withinSecondary) {
      completionTriggeredRef.current = true
      setStatus("success")
      void onSuccess()
    }
  }, [primary, secondary, targets, tolerance, onSuccess, isCompleted])

  const reset = () => {
    if (isCompleted) return
    completionTriggeredRef.current = false
    setStatus("dialing")
    setPrimary(Math.floor(Math.random() * 100))
    setSecondary(Math.floor(Math.random() * 100))
  }

  const renderMeter = (value: number, target: number, label: string, setter: (val: number) => void) => (
    <div>
      <label className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-pink-200">
        {label} <span>{value}</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => setter(Number(event.target.value))}
        disabled={isCompleted}
        className="w-full accent-pink-500"
      />
      <p className="text-[10px] text-pink-300/80">Target: {target}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.4em] text-pink-200">Balance the prism</p>
        {!isCompleted && (
          <button
            type="button"
            onClick={reset}
            className="text-[10px] uppercase tracking-[0.4em] text-pink-400 hover:text-pink-200 transition-colors"
          >
            destabilize
          </button>
        )}
      </div>

      <div className="space-y-3">
        {renderMeter(primary, targets.primary, "Solar beam", setPrimary)}
        {renderMeter(secondary, targets.secondary, "Lunar beam", setSecondary)}
      </div>

      <div className="text-xs uppercase tracking-[0.3em] text-pink-200/80">
        Divergence ΔP {Math.abs(primary - targets.primary)} • ΔL {Math.abs(secondary - targets.secondary)}
      </div>

      {hint && <p className="text-xs text-pink-200/80 italic">{hint}</p>}

      {status === "success" && <p className="text-xs text-green-400 uppercase tracking-[0.4em]">The crown blazes true.</p>}
    </div>
  )
}

function InfinityLoopMinigame({
  glyphSequence,
  hint,
  isCompleted,
  onSuccess,
}: {
  glyphSequence: string[]
  hint?: string
  isCompleted: boolean
  onSuccess: () => Promise<void> | void
}) {
  const sequence = useMemo(() => (glyphSequence.length ? glyphSequence : ["Ψ", "Ω", "∞", "Φ"]), [glyphSequence])
  const glyphOptions = useMemo(() => Array.from(new Set([...sequence, "Σ", "Θ", "λ", "Δ"])), [sequence])
  const [input, setInput] = useState<string[]>([])
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle")
  const [attempts, setAttempts] = useState(0)
  const [isCompleting, setIsCompleting] = useState(false)
  const errorTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (isCompleted) {
      setInput(sequence)
      setStatus("success")
    }
  }, [isCompleted, sequence])

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current)
      }
    }
  }, [])

  const reset = () => {
    if (isCompleted) return
    if (errorTimeoutRef.current) {
      window.clearTimeout(errorTimeoutRef.current)
      errorTimeoutRef.current = null
    }
    setInput([])
    setStatus("idle")
    setAttempts(0)
  }

  const handleGlyph = async (glyph: string) => {
    if (isCompleted || isCompleting) return

    const expected = sequence[input.length]
    if (glyph === expected) {
      const next = [...input, glyph]
      setInput(next)
      if (next.length === sequence.length) {
        setStatus("success")
        setIsCompleting(true)
        try {
          await onSuccess()
        } finally {
          setIsCompleting(false)
        }
      }
    } else {
      setStatus("error")
      setAttempts((prev) => prev + 1)
      setInput(glyph === sequence[0] ? [glyph] : [])
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current)
      }
      errorTimeoutRef.current = window.setTimeout(() => {
        setStatus("idle")
      }, 900)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.4em] text-indigo-200">Trace the ouroboros</p>
        {!isCompleted && (
          <button
            type="button"
            onClick={reset}
            className="text-[10px] uppercase tracking-[0.4em] text-indigo-400 hover:text-indigo-200 transition-colors"
          >
            reset
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {glyphOptions.map((glyph) => (
          <button
            key={glyph}
            type="button"
            onClick={() => handleGlyph(glyph)}
            disabled={isCompleted}
            className={`flex-1 min-w-[52px] rounded border px-3 py-2 text-xl transition-all ${
              sequence.includes(glyph)
                ? "border-indigo-500 bg-indigo-900/40 text-indigo-200 hover:bg-indigo-800/60"
                : "border-indigo-900 bg-black/60 text-indigo-500 hover:border-indigo-600"
            } disabled:opacity-50`}
          >
            {glyph}
          </button>
        ))}
      </div>

      <div className="flex justify-center gap-2 text-2xl text-indigo-200">
        {sequence.map((glyph, index) => (
          <span key={`${glyph}-${index}`} className={input[index] === glyph ? "text-indigo-100" : "text-indigo-700"}>
            {glyph}
          </span>
        ))}
      </div>

      <div className="text-xs uppercase tracking-[0.3em] text-indigo-200/80">
        Progress {input.length}/{sequence.length} • Attempts {attempts}
      </div>

      {hint && <p className="text-xs text-indigo-200/80 italic">{hint}</p>}

      {status === "success" && <p className="text-xs text-green-400 uppercase tracking-[0.4em]">The loop closes.</p>}
      {status === "error" && !isCompleted && (
        <p className="text-xs text-red-400 uppercase tracking-[0.3em]">The paradox fractures. Begin anew.</p>
      )}
    </div>
  )
}

function Scene({ faces, selectedFace, setSelectedFace }: SceneProps) {
  return (
    <>
      <InterstellarBackground />
      <Environment preset="night" />
      <ambientLight intensity={0.3} color="#4c1d95" />
      <pointLight position={[10, 10, 10]} intensity={1.5} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={1} color="#7c3aed" />
      <VoidCube faces={faces} selectedFace={selectedFace} setSelectedFace={setSelectedFace} />
      <OrbitControls enablePan={false} minDistance={2} maxDistance={10} enableRotate />
    </>
  )
}

function InterstellarBackground() {
  const groupRef = useRef<Group | null>(null)

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.02
    }
  })

  return (
    <group ref={groupRef}>
      <Stars radius={120} depth={80} count={20000} factor={4} saturation={0} fade speed={1.2} />
      <Sparkles color="#a855f7" count={220} scale={[60, 40, 60]} size={2.5} speed={0.4} />
      <Sparkles color="#38bdf8" count={160} scale={[70, 50, 70]} size={1.8} speed={0.6} />
    </group>
  )
}

function VoidCube({ faces, selectedFace, setSelectedFace }: SceneProps) {
  const meshRef = useRef<Group | null>(null)

  const textureUrls = useMemo<string[]>(() => faces.map((face) => face.textureUrl), [faces])
  const textures = useLoader(TextureLoader, textureUrls) as Texture[]

  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = 8
    })
  }, [textures])

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.003
      meshRef.current.rotation.x += 0.001
    }
  })

  const facePositions: [number, number, number][] = [
    [0, 0, 1.02], // front
    [0, 0, -1.02], // back
    [1.02, 0, 0], // right
    [-1.02, 0, 0], // left
    [0, 1.02, 0], // top
    [0, -1.02, 0], // bottom
  ]

  const faceRotations: [number, number, number][] = [
    [0, 0, 0], // front
    [0, Math.PI, 0], // back
    [0, Math.PI / 2, 0], // right
    [0, -Math.PI / 2, 0], // left
    [-Math.PI / 2, 0, 0], // top
    [Math.PI / 2, 0, 0], // bottom
  ]

  return (
    <Float floatIntensity={2} speed={1.5}>
      <group ref={meshRef}>
        <mesh>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial
            color="#b8860b"
            metalness={0.95}
            roughness={0.18}
            emissive="#7f1d1d"
            emissiveIntensity={0.15}
          />
        </mesh>

        {faces.map((face, index) => (
          <group key={face.id} position={facePositions[index]} rotation={faceRotations[index]}>
            <mesh
              onClick={(e) => {
                e.stopPropagation()
                if (face.isAwake && face.isUnlocked) {
                  setSelectedFace(face.id)
                }
              }}
            >
              <planeGeometry args={[1.6, 1.6]} />
              <meshBasicMaterial map={textures[index]} toneMapped={false} />
            </mesh>

            <Text
              position={[0, 0, 0.02]}
              fontSize={0.35}
              color="#fbbf24"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.08}
              outlineColor="#111111"
            >
              {index + 1}
            </Text>

            {face.isCompleted && face.sigilEarned && (
              <Text position={[0, -0.5, 0.01]} fontSize={0.15} color="#ffd700" anchorX="center" anchorY="middle">
                {face.sigilEarned}
              </Text>
            )}
            {!face.isUnlocked && (
              <Text
                position={[0, -0.55, 0.01]}
                fontSize={0.14}
                color="#f87171"
                anchorX="center"
                anchorY="middle"
              >
                LOCKED
              </Text>
            )}
          </group>
        ))}
      </group>
    </Float>
  )
}
