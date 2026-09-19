/** Shared entity and game-state shapes. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A baby's life cycle. `marching` babies throw diapers; `feeding` ones have
 * caught a bottle, have gone quiet, and are counting down to vanishing. There
 * is deliberately no `dead` state — a baby that has finished feeding is removed
 * from the array outright.
 */
export type BabyState =
  | { kind: 'marching' }
  | { kind: 'feeding'; remaining: number }

export interface Baby {
  /** Column and row within the formation, fixed for the baby's whole life. */
  column: number
  row: number
  /** Top-left of the sprite, updated by the formation as a block. */
  x: number
  y: number
  state: BabyState
  /** Per-baby phase so the whole nursery does not wobble in lockstep. */
  wobblePhase: number
}

export interface Bottle {
  x: number
  y: number
}

export interface Diaper {
  x: number
  y: number
  /** Radians per second; dirty diapers tumble as they fall. */
  spin: number
  rotation: number
}

export type ToyKind = 'cradle' | 'duck' | 'ball' | 'teddy'

export interface Obstacle {
  kind: ToyKind
  x: number
  y: number
  /** Counts down from OBSTACLE.hitPoints; the toy is removed at zero. */
  health: number
  /** Fixed random offsets so a toy's scuff marks stay put between frames. */
  scuffs: Array<{ x: number; y: number; r: number }>
}

export interface Mom {
  x: number
  lives: number
  /** Seconds of post-hit immunity remaining; she blinks while this is > 0. */
  invulnerable: number
}

/**
 * Top-level phase. `intro` shows the round banner, `playing` runs the
 * simulation, `cleared` pauses briefly between rounds, `over` waits for the
 * player to start again.
 */
export type Phase =
  | { kind: 'intro'; remaining: number }
  | { kind: 'playing' }
  | { kind: 'cleared'; remaining: number }
  | { kind: 'over'; scoreSubmitted: boolean }

export interface GameState {
  phase: Phase
  round: number
  score: number
  mom: Mom
  babies: Baby[]
  bottles: Bottle[]
  diapers: Diaper[]
  obstacles: Obstacle[]
  /** Formation march bookkeeping. */
  marchTimer: number
  marchDirection: 1 | -1
  /** Babies alive when the round began, used to scale the march speed. */
  roundBabyCount: number
  fireTimer: number
  shotCooldown: number
}

export interface HighScore {
  initials: string
  score: number
  round: number
}
