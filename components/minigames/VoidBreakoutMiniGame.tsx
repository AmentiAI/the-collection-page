'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import styles from './VoidBreakoutMiniGame.module.css'

interface VoidBreakoutMiniGameProps {
  onComplete: () => void
  isCompleted?: boolean
}

type Block = {
  x: number
  y: number
  health: number
  color: string
}

type Ball = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

const CANVAS_WIDTH = 480
const CANVAS_HEIGHT = 360
const PADDLE_WIDTH = 80
const PADDLE_HEIGHT = 12
const PADDLE_Y = CANVAS_HEIGHT - 30
const BALL_RADIUS = 6
const BLOCK_WIDTH = 48
const BLOCK_HEIGHT = 20
const BLOCK_ROWS = 5
const BLOCK_COLS = 9
const BLOCK_PADDING = 4
const BLOCK_START_Y = 40

const BLOCK_COLORS = ['#ef4444', '#f97316', '#fbbf24', '#84cc16', '#22d3ee']

const createBlocks = (): Block[] => {
  const blocks: Block[] = []
  const totalWidth = BLOCK_COLS * (BLOCK_WIDTH + BLOCK_PADDING) - BLOCK_PADDING
  const startX = (CANVAS_WIDTH - totalWidth) / 2

  for (let row = 0; row < BLOCK_ROWS; row++) {
    for (let col = 0; col < BLOCK_COLS; col++) {
      blocks.push({
        x: startX + col * (BLOCK_WIDTH + BLOCK_PADDING),
        y: BLOCK_START_Y + row * (BLOCK_HEIGHT + BLOCK_PADDING),
        health: 1,
        color: BLOCK_COLORS[row % BLOCK_COLORS.length],
      })
    }
  }
  return blocks
}

const VoidBreakoutMiniGame = ({ onComplete, isCompleted = false }: VoidBreakoutMiniGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const [paddleX, setPaddleX] = useState(CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2)
  const [ball, setBall] = useState<Ball>(() => ({
    x: CANVAS_WIDTH / 2,
    y: PADDLE_Y - BALL_RADIUS - 5,
    vx: 3,
    vy: -3,
    radius: BALL_RADIUS,
  }))
  const [blocks, setBlocks] = useState<Block[]>(() => createBlocks())
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [isGameOver, setIsGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [keys, setKeys] = useState<Set<string>>(new Set())
  const completionRef = useRef(false)

  useEffect(() => {
    if (isCompleted && !completionRef.current) {
      completionRef.current = true
      onComplete()
    }
  }, [isCompleted, onComplete])

  const resetBall = useCallback(() => {
    setBall({
      x: paddleX + PADDLE_WIDTH / 2,
      y: PADDLE_Y - BALL_RADIUS - 5,
      vx: 3 * (Math.random() > 0.5 ? 1 : -1),
      vy: -3,
      radius: BALL_RADIUS,
    })
  }, [paddleX])

  const resetGame = useCallback(() => {
    setBlocks(createBlocks())
    setScore(0)
    setLives(3)
    setIsGameOver(false)
    setIsPaused(false)
    setPaddleX(CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2)
    resetBall()
    completionRef.current = false
  }, [resetBall])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setKeys((prev) => new Set(prev).add('left'))
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setKeys((prev) => new Set(prev).add('right'))
      }
      if (e.key === ' ') {
        e.preventDefault()
        if (isGameOver) {
          resetGame()
        } else {
          setIsPaused((prev) => !prev)
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setKeys((prev) => {
          const next = new Set(prev)
          next.delete('left')
          return next
        })
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setKeys((prev) => {
          const next = new Set(prev)
          next.delete('right')
          return next
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isGameOver, resetGame])

  useEffect(() => {
    if (isPaused || isGameOver || completionRef.current) return

    const movePaddle = () => {
      setPaddleX((prev) => {
        let newX = prev
        if (keys.has('left')) {
          newX = Math.max(0, prev - 7)
        }
        if (keys.has('right')) {
          newX = Math.min(CANVAS_WIDTH - PADDLE_WIDTH, prev + 7)
        }
        return newX
      })
    }

    const paddleInterval = setInterval(movePaddle, 16)
    return () => clearInterval(paddleInterval)
  }, [keys, isPaused, isGameOver])

  useEffect(() => {
    if (isPaused || isGameOver || completionRef.current) return

    const gameLoop = () => {
      setBall((prevBall) => {
        let newBall = { ...prevBall }

        newBall.x += newBall.vx
        newBall.y += newBall.vy

        if (newBall.x - newBall.radius <= 0 || newBall.x + newBall.radius >= CANVAS_WIDTH) {
          newBall.vx = -newBall.vx
          newBall.x = Math.max(newBall.radius, Math.min(CANVAS_WIDTH - newBall.radius, newBall.x))
        }

        if (newBall.y - newBall.radius <= 0) {
          newBall.vy = -newBall.vy
          newBall.y = newBall.radius
        }

        if (newBall.y + newBall.radius >= PADDLE_Y && newBall.y + newBall.radius <= PADDLE_Y + PADDLE_HEIGHT) {
          if (newBall.x >= paddleX && newBall.x <= paddleX + PADDLE_WIDTH) {
            const hitPos = (newBall.x - (paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2)
            newBall.vx = hitPos * 4
            newBall.vy = -Math.abs(newBall.vy)
            newBall.y = PADDLE_Y - newBall.radius
          }
        }

        if (newBall.y > CANVAS_HEIGHT) {
          setLives((prev) => {
            if (prev <= 1) {
              setIsGameOver(true)
              return 0
            }
            return prev - 1
          })
          return {
            x: paddleX + PADDLE_WIDTH / 2,
            y: PADDLE_Y - BALL_RADIUS - 5,
            vx: 3 * (Math.random() > 0.5 ? 1 : -1),
            vy: -3,
            radius: BALL_RADIUS,
          }
        }

        setBlocks((prevBlocks) => {
          const remaining = prevBlocks.filter((block) => {
            if (
              newBall.x + newBall.radius >= block.x &&
              newBall.x - newBall.radius <= block.x + BLOCK_WIDTH &&
              newBall.y + newBall.radius >= block.y &&
              newBall.y - newBall.radius <= block.y + BLOCK_HEIGHT
            ) {
              hitBlock = true
              setScore((prev) => prev + 10)
              
              const ballCenterX = newBall.x
              const ballCenterY = newBall.y
              const blockCenterX = block.x + BLOCK_WIDTH / 2
              const blockCenterY = block.y + BLOCK_HEIGHT / 2
              
              const dx = ballCenterX - blockCenterX
              const dy = ballCenterY - blockCenterY
              
              if (Math.abs(dx) > Math.abs(dy)) {
                newBall.vx = -newBall.vx
              } else {
                newBall.vy = -newBall.vy
              }
              
              return false
            }
            return true
          })

          if (remaining.length === 0 && !completionRef.current) {
            completionRef.current = true
            setIsGameOver(true)
            onComplete()
          }

          return remaining
        })

        return newBall
      })

      animationRef.current = requestAnimationFrame(gameLoop)
    }

    animationRef.current = requestAnimationFrame(gameLoop)
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPaused, isGameOver, paddleX, onComplete])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      blocks.forEach((block) => {
        ctx.fillStyle = block.color
        ctx.fillRect(block.x, block.y, BLOCK_WIDTH, BLOCK_HEIGHT)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.strokeRect(block.x, block.y, BLOCK_WIDTH, BLOCK_HEIGHT)
      })

      ctx.fillStyle = '#a855f7'
      ctx.fillRect(paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT)
      ctx.strokeStyle = '#c084fc'
      ctx.strokeRect(paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT)

      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fcd34d'
      ctx.lineWidth = 2
      ctx.stroke()

      if (isPaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 24px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
      }

      if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
        ctx.fillStyle = completionRef.current ? '#4ade80' : '#ef4444'
        ctx.font = 'bold 24px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(completionRef.current ? 'CHAMBER CLEARED!' : 'GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20)
        ctx.fillStyle = '#ffffff'
        ctx.font = '16px sans-serif'
        ctx.fillText('Press SPACE to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20)
      }
    }

    const drawInterval = setInterval(draw, 16)
    return () => clearInterval(drawInterval)
  }, [blocks, paddleX, ball, isPaused, isGameOver])

  return (
    <div className={styles.container}>
      <div className={styles.stats}>
        <span>Score: {score}</span>
        <span>Lives: {lives}</span>
        <span>Blocks: {blocks.length}</span>
      </div>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className={styles.canvas} />
      <div className={styles.instructions}>
        {isGameOver
          ? completionRef.current
            ? 'All blocks destroyed! Chamber unlocked.'
            : 'Ball lost. Press SPACE to restart.'
          : isPaused
          ? 'Game paused. Press SPACE to resume.'
          : 'Arrow keys or A/D to move paddle. SPACE to pause.'}
      </div>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.button} onClick={() => setIsPaused((prev) => !prev)}>
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className={styles.button} onClick={resetGame}>
          Reset
        </button>
      </div>
    </div>
  )
}

export default VoidBreakoutMiniGame

