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
  /** Sideways drift. Zero for an ordinary shot, non-zero for the outer eggs of
   *  a multishot fan. */
  vx: number
  /** A `super` egg ignores everything in its path and bursts at mid-screen. */
  kind: 'normal' | 'super'
}

export interface Laser {
  x: number
  y: number
  /** Velocity, so a shot can be aimed off the vertical. */
  vx: number
  vy: number
}

/** One egg mark on a hull, placed when the round starts so a mothership's
 *  damage does not rearrange itself between frames. */
export interface Splat {
  x: number
  y: number
  scale: number
  rotation: number
}

/**
 * The mothership that stands in for the whole formation on boss rounds. It
 * shares the saucers' life cycle — once its hit points are gone it is
 * `splattered` and limps off the same way — but it patrols under its own power
 * and takes many hits rather than one.
 */
export interface Boss {
  x: number
  y: number
  /** Egg hits still needed. Starts at the round number, and the beam takes it
   *  down at one per second so "as many seconds as eggs" falls out of it. */
  hitPoints: number
  /** What it started with, for damage display and scoring. */
  maxHitPoints: number
  /** Patrol direction. */
  direction: -1 | 1
  state: UfoState
  splats: Splat[]
}

/**
 * What the hen's eggs have been upgraded to. Everything but the super egg runs
 * on a timer; the super egg is a single shot and is spent when it is fired.
 */
export type Power =
  | { kind: 'none' }
  | { kind: 'multishot'; eggs: number; remaining: number }
  | { kind: 'superEgg' }
  | { kind: 'beam'; remaining: number }
  | { kind: 'shield'; remaining: number }

/** The Rambo egg, waiting in a top corner to be shot. */
export interface Pickup {
  x: number
  y: number
  /** Seconds left before it gives up and goes. */
  remaining: number
}

/** A super egg's shockwave. Purely decorative: the kill happens the instant it
 *  bursts, and this is what the player sees of it. */
export interface Blast {
  x: number
  y: number
  age: number
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
  /** Set on boss rounds, when `ufos` is empty instead. */
  boss: Boss | null
  eggs: Egg[]
  lasers: Laser[]
  obstacles: Obstacle[]
  power: Power
  pickup: Pickup | null
  /** Seconds until the Rambo egg turns up, or null if this round has none. */
  pickupTimer: number | null
  blasts: Blast[]
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
