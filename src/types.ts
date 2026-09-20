/** Shared entity and game-state shapes. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A saucer's life cycle. `flying` saucers march with the formation and fire
 * lasers; `splattered` ones have taken an egg to the windscreen, can no longer
 * see out, and have left the formation to limp off the side of the screen.
 * There is deliberately no `dead` state — a saucer is removed from the array
 * outright once it has cleared the view.
 */
export type UfoState =
  | { kind: 'flying' }
  | {
      kind: 'splattered'
      /** -1 to run for the left wall, 1 for the right. Fixed when hit. */
      direction: -1 | 1
      /** Seconds of reeling in place left before the retreat begins. */
      reeling: number
      /** Current horizontal escape speed, ramping up while it runs. */
      speed: number
    }

export interface Ufo {
  /** Column and row within the formation, fixed for the saucer's whole life. */
  column: number
  row: number
  /** Top-left of the sprite, updated by the formation as a block. */
  x: number
  y: number
  state: UfoState
  /** Per-saucer phase so the whole fleet does not hover in lockstep. */
  wobblePhase: number
}

export interface Egg {
  x: number
  y: number
  /** Radians per second; a thrown egg tumbles as it flies. */
  spin: number
  rotation: number
}

export interface Laser {
  x: number
  y: number
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

export interface Hen {
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
  hen: Hen
  ufos: Ufo[]
  eggs: Egg[]
  lasers: Laser[]
  obstacles: Obstacle[]
  /** Formation march bookkeeping. */
  marchTimer: number
  marchDirection: 1 | -1
  /** Saucers alive when the round began, used to scale the march speed. */
  roundUfoCount: number
  fireTimer: number
  shotCooldown: number
}

export interface HighScore {
  initials: string
  score: number
  round: number
}
