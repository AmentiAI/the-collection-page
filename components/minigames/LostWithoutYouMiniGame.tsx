'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import styles from './LostWithoutYouMiniGame.module.css'

interface LostWithoutYouMiniGameProps {
  onComplete: () => void
  isCompleted?: boolean
}

type CellType = '.' | '#' | 'F' | 'M' | 'Z'

type Level = {
  id: number
  grid: string[]
  fireflyBoost: number
}

const LEVELS: Level[] = [
  {
    id: 1,
    grid: [
      '#######',
      '#M..F#',
      '#.##.#',
      '#...Z#',
      '#######',
    ],
    fireflyBoost: 6,
  },
  {
    id: 2,
    grid: [
      '########',
      '#M.....#',
      '###.##.#',
      '#F..#..#',
      '#.##.#Z#',
      '#......#',
      '########',
    ],
    fireflyBoost: 5,
  },
  {
    id: 3,
    grid: [
      '#########',
      '#M..#..F#',
      '#.#.#.#.#',
      '#.#...#.#',
      '#.###.#.#',
      '#...F...#',
      '#.#.###.#',
      '#Z..#..##',
      '#########',
    ],
    fireflyBoost: 4,
  },
]

interface FriendState {
  x: number
  y: number
  light: number
}

type Friend = 'mary' | 'zoey'

type BoardCell = {
  type: 'empty' | 'wall' | 'firefly'
  collected?: boolean
}

const parseLevel = (level: Level) => {
  const board: BoardCell[][] = []
  let mary: FriendState | null = null
  let zoey: FriendState | null = null

  level.grid.forEach((row, y) => {
    const boardRow: BoardCell[] = []
    row.split('').forEach((char, x) => {
      switch (char as CellType) {
        case '#':
          boardRow.push({ type: 'wall' })
          break
        case 'F':
          boardRow.push({ type: 'firefly', collected: false })
          break
        case 'M':
          mary = { x, y, light: 10 }
          boardRow.push({ type: 'empty' })
          break
        case 'Z':
          zoey = { x, y, light: 10 }
          boardRow.push({ type: 'empty' })
          break
        default:
          boardRow.push({ type: 'empty' })
      }
    })
    board.push(boardRow)
  })

  if (!mary || !zoey) {
    throw new Error('Level missing player start positions')
  }

  return { board, mary, zoey }
}

const LostWithoutYouMiniGame = ({ onComplete, isCompleted = false }: LostWithoutYouMiniGameProps) => {
  const [levelIndex, setLevelIndex] = useState(0)
  const [board, setBoard] = useState<BoardCell[][]>(() => parseLevel(LEVELS[0]).board)
  const [mary, setMary] = useState<FriendState>(() => parseLevel(LEVELS[0]).mary)
  const [zoey, setZoey] = useState<FriendState>(() => parseLevel(LEVELS[0]).zoey)
  const [activeFriend, setActiveFriend] = useState<Friend>('mary')
  const [message, setMessage] = useState('Guide Mary and Zoey through the darkness.')
  const [moves, setMoves] = useState(0)
  const [isFrozen, setIsFrozen] = useState(false)
  const completionRef = useRef(false)

  const currentLevel = LEVELS[levelIndex]

  const resetLevel = useCallback(
    (idx: number) => {
      const parsed = parseLevel(LEVELS[idx])
      setBoard(parsed.board)
      setMary(parsed.mary)
      setZoey(parsed.zoey)
      setActiveFriend('mary')
      setMessage('Guide Mary and Zoey through the darkness.')
      setMoves(0)
      setIsFrozen(false)
    },
    [],
  )

  useEffect(() => {
    resetLevel(levelIndex)
  }, [levelIndex, resetLevel])

  useEffect(() => {
    if (isCompleted && !completionRef.current) {
      completionRef.current = true
      onComplete()
    }
  }, [isCompleted, onComplete])

  const toggleFriend = useCallback(() => {
    setActiveFriend((prev) => (prev === 'mary' ? 'zoey' : 'mary'))
  }, [])

  const handleFirefly = useCallback(
    (x: number, y: number) => {
      setBoard((prev) => {
        const next = prev.map((row) => row.map((cell) => ({ ...cell })))
        if (next[y][x].type === 'firefly' && !next[y][x].collected) {
          next[y][x].collected = true
          const boost = currentLevel.fireflyBoost
          setMary((m) => (activeFriend === 'mary' ? { ...m, light: m.light + boost } : m))
          setZoey((z) => (activeFriend === 'zoey' ? { ...z, light: z.light + boost } : z))
          setMessage('Firefly collected! Light restored.')
        }
        return next
      })
    },
    [activeFriend, currentLevel.fireflyBoost],
  )

  const moveFriend = useCallback(
    (dx: number, dy: number) => {
      if (isFrozen || completionRef.current) return

      setMoves((prev) => prev + 1)

      setMary((prevMary) => {
        if (activeFriend !== 'mary') return prevMary
        const targetX = prevMary.x + dx
        const targetY = prevMary.y + dy
        if (!isWalkable(board, targetX, targetY)) {
          setMessage('Mary bumps into darkness.')
          return prevMary
        }
        const updated = { ...prevMary, x: targetX, y: targetY, light: prevMary.light - 1 }
        handleFirefly(targetX, targetY)
        if (updated.light <= 0) {
          setMessage('Mary fades into darkness...')
          setIsFrozen(true)
          setTimeout(() => resetLevel(levelIndex), 1200)
        }
        return updated
      })

      setZoey((prevZoey) => {
        if (activeFriend !== 'zoey') return prevZoey
        const targetX = prevZoey.x + dx
        const targetY = prevZoey.y + dy
        if (!isWalkable(board, targetX, targetY)) {
          setMessage('Zoey hesitates in the shadows.')
          return prevZoey
        }
        const updated = { ...prevZoey, x: targetX, y: targetY, light: prevZoey.light - 1 }
        handleFirefly(targetX, targetY)
        if (updated.light <= 0) {
          setMessage('Zoey is swallowed by night...')
          setIsFrozen(true)
          setTimeout(() => resetLevel(levelIndex), 1200)
        }
        return updated
      })

      toggleFriend()
    },
    [activeFriend, board, handleFirefly, isFrozen, levelIndex, resetLevel, toggleFriend],
  )

  useEffect(() => {
    if (isFrozen || completionRef.current) return

    const handleKey = (event: KeyboardEvent) => {
      let dx = 0
      let dy = 0
      switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          dx = -1
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          dx = 1
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          dy = -1
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          dy = 1
          break
        default:
          return
      }

      event.preventDefault()
      moveFriend(dx, dy)
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFrozen, moveFriend])

  useEffect(() => {
    if (mary.x === zoey.x && mary.y === zoey.y && !completionRef.current) {
      if (levelIndex < LEVELS.length - 1) {
        setMessage('They reunite briefly! The next darkness awaits...')
        setIsFrozen(true)
        setTimeout(() => {
          setIsFrozen(false)
          setLevelIndex((prev) => prev + 1)
        }, 1200)
      } else {
        completionRef.current = true
        setMessage('Mary and Zoey found each other!')
        onComplete()
      }
    }
  }, [levelIndex, mary, onComplete, zoey])

  const gridCells = useMemo(() => {
    return board.map((row, y) =>
      row.map((cell, x) => {
        if (mary.x === x && mary.y === y) return 'mary'
        if (zoey.x === x && zoey.y === y) return 'zoey'
        if (cell.type === 'wall') return 'wall'
        if (cell.type === 'firefly' && !cell.collected) return 'firefly'
        return 'empty'
      }),
    )
  }, [board, mary, zoey])

  const lightStatus = `${activeFriend === 'mary' ? 'Mary' : 'Zoey'} • Light ${
    activeFriend === 'mary' ? mary.light : zoey.light
  }`

  return (
    <div className={styles.container}>
      <div className={styles.stats}>
        <span>Level {currentLevel.id}/{LEVELS.length}</span>
        <span>{lightStatus}</span>
      </div>

      <div className={styles.boardWrapper}>
        <div className={styles.board}>
          <div
            className={styles.grid}
            style={{
              gridTemplateColumns: `repeat(${board[0].length}, 38px)`,
              gridTemplateRows: `repeat(${board.length}, 38px)`
            }}
          >
            {gridCells.flatMap((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const key = `${rowIndex}-${colIndex}`
                let className = styles.cell
                if (cell === 'wall') className = `${styles.cell} ${styles.cellWall}`
                if (cell === 'firefly') className = `${styles.cell} ${styles.cellFirefly}`
                if (cell === 'mary') className = `${styles.cell} ${styles.playerMary}`
                if (cell === 'zoey') className = `${styles.cell} ${styles.playerZoey}`
                return <div key={key} className={className} />
              }),
            )}
          </div>
        </div>
      </div>

      <div className={styles.instructions}>{message}</div>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.button} onClick={() => resetLevel(levelIndex)}>
          Reset Level
        </button>
        <button type="button" className={styles.button} onClick={() => setLevelIndex(0)}>
          Restart Adventure
        </button>
      </div>
    </div>
  )
}

const isWalkable = (board: BoardCell[][], x: number, y: number) => {
  if (y < 0 || y >= board.length || x < 0 || x >= board[0].length) return false
  const cell = board[y][x]
  return cell.type !== 'wall'
}

export default LostWithoutYouMiniGame
