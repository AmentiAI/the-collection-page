export const BOARD_WIDTH = 10
export const BOARD_HEIGHT = 20

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Cell = PieceType | null
export type Board = Cell[][]

export interface ActivePiece {
  type: PieceType
  rotation: number
  x: number
  y: number
}

export interface GameState {
  board: Board
  activePiece: ActivePiece | null
  nextPiece: PieceType
  score: number
  lines: number
  level: number
  isGameOver: boolean
}

const LINE_CLEAR_SCORES = {
  0: 0,
  1: 100,
  2: 300,
  3: 500,
  4: 800,
} as const

const PIECE_COLORS: Record<PieceType, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#a855f7',
  S: '#34d399',
  Z: '#fb7185',
  J: '#6366f1',
  L: '#f97316',
}

type RotationLayout = Array<[number, number]>

const TETROMINO_LAYOUTS: Record<PieceType, RotationLayout[]> = {
  I: [
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  ],
  O: [
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
  ],
  T: [
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  S: [
    [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  ],
  Z: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    [
      [2, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
  ],
  J: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [2, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 0],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  ],
  L: [
    [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  ],
}

const DEFAULT_WALL_KICKS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [-1, -1],
]

const I_WALL_KICKS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [2, 0],
  [-2, 0],
]

export const getPieceColor = (type: PieceType): string => PIECE_COLORS[type]

export const getPieceLayout = (type: PieceType, rotation: number): RotationLayout => {
  const layouts = TETROMINO_LAYOUTS[type]
  return layouts[rotation % layouts.length]
}

export const getGravityInterval = (level: number): number => Math.max(100, 600 - (level - 1) * 50)

export const getRandomPieceType = (): PieceType => {
  const pieces: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
  return pieces[Math.floor(Math.random() * pieces.length)]
}

export const createEmptyBoard = (): Board =>
  Array.from({ length: BOARD_HEIGHT }, () => Array<Cell>(BOARD_WIDTH).fill(null))

const cloneBoard = (board: Board): Board => board.map((row) => [...row])

const getWallKickOffsets = (piece: PieceType) => (piece === 'I' ? I_WALL_KICKS : DEFAULT_WALL_KICKS)

export const canPlacePiece = (board: Board, piece: ActivePiece): boolean => {
  const layout = getPieceLayout(piece.type, piece.rotation)
  for (const [dx, dy] of layout) {
    const x = piece.x + dx
    const y = piece.y + dy
    if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) {
      return false
    }
    if (y >= 0 && board[y][x]) {
      return false
    }
  }
  return true
}

const mergePieceIntoBoard = (board: Board, piece: ActivePiece): Board => {
  const nextBoard = cloneBoard(board)
  const layout = getPieceLayout(piece.type, piece.rotation)
  for (const [dx, dy] of layout) {
    const x = piece.x + dx
    const y = piece.y + dy
    if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
      nextBoard[y][x] = piece.type
    }
  }
  return nextBoard
}

export const clearLines = (board: Board): { board: Board; linesCleared: number } => {
  const rows: Board = []
  let cleared = 0
  for (const row of board) {
    if (row.every((cell) => cell)) {
      cleared += 1
    } else {
      rows.push([...row])
    }
  }
  while (rows.length < BOARD_HEIGHT) {
    rows.unshift(Array<Cell>(BOARD_WIDTH).fill(null))
  }
  return { board: rows, linesCleared: cleared }
}

const lineClearPoints = (linesCleared: number, level: number): number => {
  const base = LINE_CLEAR_SCORES[linesCleared as keyof typeof LINE_CLEAR_SCORES] ?? 0
  return base * level
}

const spawnPiece = (state: GameState, forcedType?: PieceType): GameState => {
  if (state.isGameOver) {
    return state
  }
  const type = forcedType ?? state.nextPiece ?? getRandomPieceType()
  const piece: ActivePiece = {
    type,
    rotation: 0,
    x: Math.floor(BOARD_WIDTH / 2) - 2,
    y: -2,
  }
  if (!canPlacePiece(state.board, piece)) {
    return { ...state, activePiece: null, isGameOver: true }
  }
  return {
    ...state,
    activePiece: piece,
    nextPiece: getRandomPieceType(),
  }
}

export const createInitialState = (): GameState => {
  const base: GameState = {
    board: createEmptyBoard(),
    activePiece: null,
    nextPiece: getRandomPieceType(),
    score: 0,
    lines: 0,
    level: 1,
    isGameOver: false,
  }
  return spawnPiece(base)
}

export const movePiece = (state: GameState, dx: number): GameState => {
  if (state.isGameOver || !state.activePiece) {
    return state
  }
  const moved: ActivePiece = { ...state.activePiece, x: state.activePiece.x + dx }
  return canPlacePiece(state.board, moved) ? { ...state, activePiece: moved } : state
}

export const rotatePiece = (state: GameState): GameState => {
  if (state.isGameOver || !state.activePiece) {
    return state
  }
  const piece = state.activePiece
  const rotations = TETROMINO_LAYOUTS[piece.type]
  const nextRotation = (piece.rotation + 1) % rotations.length
  for (const [dx, dy] of getWallKickOffsets(piece.type)) {
    const rotated: ActivePiece = {
      ...piece,
      rotation: nextRotation,
      x: piece.x + dx,
      y: piece.y + dy,
    }
    if (canPlacePiece(state.board, rotated)) {
      return { ...state, activePiece: rotated }
    }
  }
  return state
}

export const tick = (state: GameState): GameState => {
  if (state.isGameOver) {
    return state
  }
  if (!state.activePiece) {
    return spawnPiece(state)
  }

  const piece = state.activePiece
  const moved: ActivePiece = { ...piece, y: piece.y + 1 }
  if (canPlacePiece(state.board, moved)) {
    return { ...state, activePiece: moved }
  }

  const merged = mergePieceIntoBoard(state.board, piece)
  const { board, linesCleared } = clearLines(merged)
  const totalLines = state.lines + linesCleared
  const level = Math.floor(totalLines / 10) + 1
  const score = state.score + lineClearPoints(linesCleared, state.level)

  const baseState: GameState = {
    ...state,
    board,
    activePiece: null,
    lines: totalLines,
    level,
    score,
  }
  return spawnPiece(baseState)
}

export const hardDrop = (state: GameState): GameState => {
  if (state.isGameOver || !state.activePiece) {
    return state
  }

  let piece = state.activePiece
  let dropDistance = 0
  while (canPlacePiece(state.board, { ...piece, y: piece.y + 1 })) {
    piece = { ...piece, y: piece.y + 1 }
    dropDistance += 1
  }

  const merged = mergePieceIntoBoard(state.board, piece)
  const { board, linesCleared } = clearLines(merged)
  const totalLines = state.lines + linesCleared
  const level = Math.floor(totalLines / 10) + 1
  const score = state.score + lineClearPoints(linesCleared, state.level) + dropDistance * 2 * state.level

  const baseState: GameState = {
    ...state,
    board,
    activePiece: null,
    lines: totalLines,
    level,
    score,
  }
  return spawnPiece(baseState)
}

export const spawnRandomPiece = (state: GameState): GameState => spawnPiece(state)
