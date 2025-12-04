'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import styles from './TetrisMiniGame.module.css'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  Board,
  GameState,
  PieceType,
  createInitialState,
  getGravityInterval,
  getPieceColor,
  getPieceLayout,
  hardDrop,
  movePiece,
  rotatePiece,
  tick,
} from './tetrisLogic'

const withActivePieceOverlay = (state: GameState): Board => {
  const overlay = state.board.map((row) => [...row])
  const piece = state.activePiece
  if (!piece) {
    return overlay
  }

  const layout = getPieceLayout(piece.type, piece.rotation)
  layout.forEach(([dx, dy]) => {
    const x = piece.x + dx
    const y = piece.y + dy
    if (x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT) {
      overlay[y][x] = piece.type
    }
  })

  return overlay
}

const getNextPreviewMatrix = (nextType: GameState['nextPiece']) => {
  const preview = Array.from({ length: 4 }, () => Array<string | null>(4).fill(null))
  const layout = getPieceLayout(nextType, 0)
  layout.forEach(([dx, dy]) => {
    const x = dx + 1
    const y = dy + 1
    if (x >= 0 && x < 4 && y >= 0 && y < 4) {
      preview[y][x] = nextType
    }
  })
  return preview
}

const formatNumber = (value: number) => value.toLocaleString()

type ControlAction = 'left' | 'right' | 'down' | 'rotate' | 'drop'

interface TetrisMiniGameProps {
  targetLines?: number
  onComplete?: () => void
}

const TetrisMiniGame = ({ targetLines = 10, onComplete }: TetrisMiniGameProps) => {
  const [state, setState] = useState<GameState>(() => createInitialState())
  const containerRef = useRef<HTMLDivElement | null>(null)
  const completionRef = useRef(false)

  const boardWithActive = useMemo(() => withActivePieceOverlay(state), [state])
  const nextPreview = useMemo(() => getNextPreviewMatrix(state.nextPiece), [state.nextPiece])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (completionRef.current) {
      return
    }
    if (state.lines >= targetLines) {
      completionRef.current = true
      onComplete?.()
    }
  }, [state.lines, targetLines, onComplete])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setState((prev) => tick(prev))
    }, getGravityInterval(state.level))

    return () => window.clearInterval(interval)
  }, [state.level, state.isGameOver])

  const applyAction = (action: ControlAction) => {
    setState((prev) => {
      if (prev.isGameOver) {
        return prev
      }
      switch (action) {
        case 'left':
          return movePiece(prev, -1)
        case 'right':
          return movePiece(prev, 1)
        case 'down':
          return tick(prev)
        case 'rotate':
          return rotatePiece(prev)
        case 'drop':
          return hardDrop(prev)
        default:
          return prev
      }
    })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        applyAction('left')
        break
      case 'ArrowRight':
        event.preventDefault()
        applyAction('right')
        break
      case 'ArrowDown':
        event.preventDefault()
        applyAction('down')
        break
      case 'ArrowUp':
      case 'w':
      case 'W':
        event.preventDefault()
        applyAction('rotate')
        break
      case ' ': // modern
      case 'Spacebar': // legacy
        event.preventDefault()
        applyAction('drop')
        break
      default:
        break
    }
  }

  const handleRestart = () => {
    completionRef.current = false
    setState(createInitialState())
    window.requestAnimationFrame(() => {
      containerRef.current?.focus()
    })
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.container} max-w-3xl`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.boardWrapper}>
        <div className={styles.board}>
          {boardWithActive.flatMap((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const key = rowIndex * BOARD_WIDTH + colIndex
              const background = cell ? getPieceColor(cell as PieceType) : 'rgba(15, 23, 42, 0.9)'
              const boxShadow = cell ? `0 6px 12px ${getPieceColor(cell as PieceType)}40` : 'inset 0 1px 0 rgba(148, 163, 184, 0.08)'
              return (
                <div
                  key={key}
                  className={styles.cell}
                  style={{ backgroundColor: background, boxShadow }}
                />
              )
            }),
          )}
        </div>
        {state.isGameOver && (
          <div className={styles.overlay}>
            <span>Game Over</span>
            <span>Press restart</span>
          </div>
        )}
      </div>

      <aside className={styles.sidebar}>
        <div className={styles.panel}>
          <div className={styles.panelHeading}>Score</div>
          <div className={styles.statValue}>{formatNumber(state.score)}</div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeading}>Lines</div>
          <div className={styles.statValue}>{formatNumber(state.lines)}</div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeading}>Level</div>
          <div className={styles.statValue}>{formatNumber(state.level)}</div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeading}>Next</div>
          <div className={styles.nextPreview}>
            {nextPreview.flatMap((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className={styles.previewCell}
                  style={{ backgroundColor: cell ? getPieceColor(cell as PieceType) : 'rgba(15, 23, 42, 0.85)' }}
                />
              )),
            )}
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeading}>Controls</div>
          <div className={styles.controls}>
            <button type="button" className={styles.controlButton} onClick={() => applyAction('left')}>
              ←
            </button>
            <button type="button" className={styles.controlButton} onClick={() => applyAction('right')}>
              →
            </button>
            <button type="button" className={styles.controlButton} onClick={() => applyAction('rotate')}>
              ⟳
            </button>
            <button type="button" className={styles.controlButton} onClick={() => applyAction('drop')}>
              ⤓
            </button>
          </div>
        </div>
        <button type="button" className={styles.restartButton} onClick={handleRestart}>
          Restart
        </button>
        <div className={styles.feedback}>
          {state.isGameOver
            ? 'Blocks sealed the core.'
            : completionRef.current
            ? 'Target achieved! Keep playing or restart.'
            : 'Use arrow keys & space to play.'}
        </div>
      </aside>
    </div>
  )
}

export default TetrisMiniGame
