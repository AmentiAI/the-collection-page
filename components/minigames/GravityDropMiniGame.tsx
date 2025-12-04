'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import styles from './GravityDropMiniGame.module.css'

interface GravityDropMiniGameProps {
  onComplete: () => void
  isCompleted?: boolean
}

type CellType = 'empty' | 'obstacle' | 'goal' | 'filled'

type Board = CellType[][]

type ActiveShard = {
  id: number
  x: number
  y: number
}

const BOARD_ROWS = 8
const BOARD_COLS = 6
const TARGET_FILLS = 3
const DROP_INTERVAL = 260

const GOAL_POSITIONS: Array<[number, number]> = [
  [BOARD_ROWS - 1, 1],
  [BOARD_ROWS - 1, 3],
  [BOARD_ROWS - 1, 4],
]

const OBSTACLE_POSITIONS: Array<[number, number]> = [
  [2, 1],
  [2, 2],
  [3, 4],
  [4, 0],
  [4, 3],
  [5, 2],
]

let shardCounter = 0

const createInitialBoard = (): Board => {
  const board: Board = Array.from({ length: BOARD_ROWS }, () => Array<CellType>(BOARD_COLS).fill('empty'))
  OBSTACLE_POSITIONS.forEach(([r, c]) => {
    if (r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS) {
      board[r][c] = 'obstacle'
    }
  })
  GOAL_POSITIONS.forEach(([r, c]) => {
    if (r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS) {
      board[r][c] = 'goal'
    }
  })
  return board
}

const gravityVectors = {
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
} satisfies Record<'down' | 'left' | 'right', { dx: number; dy: number }>

const gravityLabels = {
  down: 'Down',
  left: 'Left',
  right: 'Right',
}

const GravityDropMiniGame = ({ onComplete, isCompleted = false }: GravityDropMiniGameProps) => {
  const [board, setBoard] = useState<Board>(() => createInitialBoard())
  const [activeShard, setActiveShard] = useState<ActiveShard | null>(null)
  const [filledGoals, setFilledGoals] = useState(0)
  const [gravity, setGravity] = useState<'down' | 'left' | 'right'>('down')
  const [feedback, setFeedback] = useState('Align shards with the sigil slots.')
  const [dropsUsed, setDropsUsed] = useState(0)
  const intervalRef = useRef<number | null>(null)
  const completionRef = useRef(false)
  const boardRef = useRef(board)

  useEffect(() => {
    boardRef.current = board
  }, [board])

  useEffect(() => {
    if (isCompleted && !completionRef.current) {
      completionRef.current = true
      onComplete()
    }
  }, [isCompleted, onComplete])

  const resetGame = () => {
    completionRef.current = false
    shardCounter = 0
    setBoard(createInitialBoard())
    setActiveShard(null)
    setFilledGoals(0)
    setGravity('down')
    setFeedback('Align shards with the sigil slots.')
    setDropsUsed(0)
  }

  const rotateGravity = () => {
    setGravity((prev) => {
      if (prev === 'down') return 'left'
      if (prev === 'left') return 'right'
      return 'down'
    })
  }

  const spawnShard = () => {
    if (activeShard || completionRef.current) {
      return
    }
    const start: ActiveShard = { id: shardCounter++, x: Math.floor(BOARD_COLS / 2), y: 0 }
    setActiveShard(start)
    setDropsUsed((prev) => prev + 1)
    setFeedback('Shard descending...')
  }

  const stepShard = useCallback(() => {
    setActiveShard((current) => {
      if (!current) {
        return current
      }
      const { dx, dy } = gravityVectors[gravity]
      const nextX = current.x + dx
      const nextY = current.y + dy
      const boardSnapshot = boardRef.current

      const outOfBounds = nextX < 0 || nextX >= BOARD_COLS || nextY >= BOARD_ROWS || nextY < 0
      const collision = !outOfBounds && boardSnapshot[nextY][nextX] !== 'empty'

      if (outOfBounds || collision) {
        lockShard(current)
        return null
      }

      return { ...current, x: nextX, y: nextY }
    }, [lockShard, gravity])
  }, [lockShard, gravity])

  const lockShard = useCallback(
    (shard: ActiveShard) => {
      setBoard((prev) => {
        const next = prev.map((row) => [...row])
        const cell = next[shard.y][shard.x]
        if (cell === 'goal') {
          next[shard.y][shard.x] = 'filled'
          setFilledGoals((prevGoals) => {
            const total = prevGoals + 1
            if (total >= TARGET_FILLS && !completionRef.current) {
              completionRef.current = true
              setFeedback('All sigil slots are aligned.')
              onComplete()
            } else {
              setFeedback('Sigil slot energized!')
            }
            return total
          })
        } else if (cell === 'empty') {
          next[shard.y][shard.x] = 'filled'
          setFeedback('Shard lodged into the wall.')
        } else {
          setFeedback('Shard shattered upon impact!')
        }
        return next
      })
    },
    [onComplete],
  )

  useEffect(() => {
    if (activeShard && !completionRef.current) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
      }
      intervalRef.current = window.setInterval(stepShard, DROP_INTERVAL)
      return () => {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [activeShard, stepShard])

  useEffect(() => {
    if (!activeShard) {
      setFeedback((prev) =>
        prev.startsWith('Sigil slot energized') || prev.startsWith('Shard lodged')
          ? prev
          : 'Choose a gravity orientation and drop a shard.',
      )
    }
  }, [activeShard])

  const boardCells = useMemo(() => {
    const cells: Array<Array<CellType | 'piece'>> = board.map((row) => [...row])
    if (activeShard) {
      cells[activeShard.y][activeShard.x] = 'piece'
    }
    return cells
  }, [board, activeShard])

  return (
    <div className={styles.container}>
      <div className={styles.stats}>
        <span>Aligned {filledGoals}/{TARGET_FILLS}</span>
        <span>Drops {dropsUsed}</span>
      </div>

      <div className={styles.boardWrapper}>
        <div className={styles.board}>
          <div
            className={styles.grid}
            style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, 36px)`, gridTemplateRows: `repeat(${BOARD_ROWS}, 36px)` }}
          >
            {boardCells.flatMap((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const key = `${rowIndex}-${colIndex}`
                let className = styles.cell
                if (cell === 'obstacle') className = `${styles.cell} ${styles.cellObstacle}`
                if (cell === 'goal') className = `${styles.cell} ${styles.cellGoal}`
                if (cell === 'filled') className = `${styles.cell} ${styles.cellSettled}`
                if (cell === 'piece') className = `${styles.cell} ${styles.cellPiece}`
                return <div key={key} className={className} />
              }),
            )}
          </div>
        </div>
      </div>

      <div className={styles.feedback}>{feedback}</div>

      <div className={styles.controls}>
        <button type="button" className={styles.button} onClick={rotateGravity}>
          Gravity: {gravityLabels[gravity]}
        </button>
        <button type="button" className={styles.button} onClick={spawnShard} disabled={!!activeShard || completionRef.current}>
          Drop Shard
        </button>
        <button type="button" className={styles.button} onClick={resetGame}>
          Reset
        </button>
      </div>
    </div>
  )
}

export default GravityDropMiniGame
