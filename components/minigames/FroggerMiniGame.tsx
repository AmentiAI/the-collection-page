'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import styles from './FroggerMiniGame.module.css'

interface FroggerMiniGameProps {
  onComplete: () => void
  isCompleted?: boolean
}

type LaneCar = {
  id: number
  lane: number
  x: number
  speed: number
  length: number
}

const GRID_COLS = 9
const GRID_ROWS = 8
const START_POSITION = { x: Math.floor(GRID_COLS / 2), y: GRID_ROWS - 1 }
const LANE_INDICES = [1, 2, 3, 4, 5, 6]
const BASE_SPEED = 0.015

let carIdCounter = 0

const createLaneCar = (lane: number): LaneCar => {
  const direction = lane % 2 === 0 ? 1 : -1
  const length = Math.random() < 0.3 ? 2 : 1
  return {
    id: carIdCounter++,
    lane,
    x: direction === 1 ? -length : GRID_COLS + length,
    speed: BASE_SPEED + Math.random() * 0.02 + lane * 0.004,
    length,
  }
}

const FroggerMiniGame = ({ onComplete, isCompleted = false }: FroggerMiniGameProps) => {
  const [player, setPlayer] = useState(START_POSITION)
  const [lanes, setLanes] = useState<LaneCar[]>(() =>
    LANE_INDICES.flatMap((lane) => [createLaneCar(lane), createLaneCar(lane)]),
  )
  const [isPaused, setIsPaused] = useState(false)
  const [wins, setWins] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const completionRef = useRef(false)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    if (isCompleted && !completionRef.current) {
      completionRef.current = true
      onComplete()
    }
  }, [isCompleted, onComplete])

  const resetPlayer = (incrementAttempts = true) => {
    setPlayer(START_POSITION)
    if (incrementAttempts) {
      setAttempts((prev) => prev + 1)
    }
    if (completionRef.current) {
      setWins(0)
      setLanes(LANE_INDICES.flatMap((lane) => [createLaneCar(lane), createLaneCar(lane)]))
      completionRef.current = false
    }
  }

  useEffect(() => {
    if (isPaused || completionRef.current) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (completionRef.current || isPaused) return
      let nextX = player.x
      let nextY = player.y

      switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          nextX = Math.max(0, player.x - 1)
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          nextX = Math.min(GRID_COLS - 1, player.x + 1)
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          nextY = Math.max(0, player.y - 1)
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          nextY = Math.min(GRID_ROWS - 1, player.y + 1)
          break
        default:
          return
      }

      event.preventDefault()
      setPlayer({ x: nextX, y: nextY })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [player, isPaused])

  useEffect(() => {
    if (isPaused || completionRef.current) {
      return
    }

    const step = () => {
      setLanes((prev) => {
        const updatedCars: LaneCar[] = []
        prev.forEach((car) => {
          const direction = car.speed >= 0 ? 1 : -1
          const nextX = car.x + car.speed * direction
          if (direction === 1 && nextX - car.length > GRID_COLS + 1) {
            updatedCars.push(createLaneCar(car.lane))
          } else if (direction === -1 && nextX + car.length < -1) {
            updatedCars.push(createLaneCar(car.lane))
          } else {
            updatedCars.push({ ...car, x: nextX })
          }
        })

        if (Math.random() < 0.01) {
          const lane = LANE_INDICES[Math.floor(Math.random() * LANE_INDICES.length)]
          updatedCars.push(createLaneCar(lane))
        }

        return updatedCars
      })

      animationRef.current = window.requestAnimationFrame(step)
    }

    animationRef.current = window.requestAnimationFrame(step)
    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPaused])

  useEffect(() => {
    if (player.y === 0 && !completionRef.current) {
      const newWins = wins + 1
      setWins(newWins)
      resetPlayer(false)
      if (newWins >= 3) {
        completionRef.current = true
        onComplete()
      }
      return
    }

    if (LANE_INDICES.includes(player.y)) {
      const collision = lanes.some((car) => {
        if (car.lane !== player.y) return false
        const carLeft = Math.floor(car.x)
        const carRight = carLeft + car.length - 1
        return player.x >= carLeft && player.x <= carRight
      })

      if (collision) {
        resetPlayer()
      }
    }
  }, [player, lanes, wins, onComplete])

  const cells = useMemo(() => {
    const grid: Array<Array<'empty' | 'finish' | 'player' | 'car'>> = Array.from({ length: GRID_ROWS }, () =>
      Array<'empty' | 'finish' | 'player' | 'car'>(GRID_COLS).fill('empty'),
    )

    for (let x = 0; x < GRID_COLS; x++) {
      grid[0][x] = 'finish'
    }

    lanes.forEach((car) => {
      const base = Math.floor(car.x)
      for (let i = 0; i < car.length; i++) {
        const px = base + i
        if (px >= 0 && px < GRID_COLS && car.lane >= 0 && car.lane < GRID_ROWS) {
          grid[car.lane][px] = 'car'
        }
      }
    })

    grid[player.y][player.x] = 'player'

    return grid
  }, [lanes, player])

  return (
    <div className={styles.container}>
      <div className={styles.stats}>
        <span>Wins {wins}/3</span>
        <span>Attempts {attempts}</span>
      </div>
      <div className={styles.board}>
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, 36px)`,
            gridTemplateRows: `repeat(${GRID_ROWS}, 36px)`,
          }}
        >
          {cells.flatMap((row, y) =>
            row.map((cell, x) => {
              const key = `${x}-${y}`
              let className = styles.cell
              if (cell === 'finish') className = `${styles.cell} ${styles.finish}`
              if (cell === 'player') className = `${styles.cell} ${styles.player}`
              if (cell === 'car') className = `${styles.cell} ${styles.car}`
              return <div key={key} className={className} />
            }),
          )}
        </div>
      </div>
      <div className={styles.instructions}>
        {completionRef.current ? 'Path cleared. Chamber unlocked.' : 'Reach the top without colliding.'}
      </div>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.button} onClick={() => setIsPaused((prev) => !prev)}>
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className={styles.button} onClick={() => resetPlayer(false)}>
          Reset Frog
        </button>
      </div>
    </div>
  )
}

export default FroggerMiniGame
