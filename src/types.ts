/** Shared entity and game-state shapes. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A saucer's life cycle.
 *
 * `flying` saucers march with the formation and fire lasers. `leaving` ones are
 * on their way off the side of the screen, either because an egg took out their
 * windscreen or because they have decided the war is not for them — the two
 * share every movement rule and differ only in what is drawn. `wobbling` ones
 * have been caught by a gravity wave, have lost attitude control, and detonate
 * against whatever they drift into.
 *
 * There is deliberately no `dead` state: a saucer is removed from the array
 * outright once it has cleared the view or gone up.
 */
export type UfoState =
  | { kind: 'flying' }
  | {
      kind: 'leaving'
      /** Why it is going, which decides the sprite and the speech bubble. */
      reason: 'splattered' | 'deserted'
      /** -1 to run for the left wall, 1 for the right. Fixed when it turns. */
      direction: -1 | 1
      /** Seconds left of hanging in place — reeling, or making its point. */
      reeling: number
      /** Current horizontal escape speed, ramping up while it runs. */
      speed: number
    }
  | {
      kind: 'wobbling'
      /** Fixed side to drift off towards, so a random walk still terminates. */
      drift: -1 | 1
      vx: number
      vy: number
      /** Seconds until it picks a new random heading. */
      turn: number
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

/**
 * Something the hen has thrown. Most of them are eggs; the upgrades put a heart,
 * a black hole and a gramophone in the same array, because they all travel up
 * the screen under the same rules and differ only in what they do when they get
 * somewhere.
 */
export interface Shot {
  x: number
  y: number
  /** Radians per second; a thrown egg tumbles as it flies. */
  spin: number
  rotation: number
  /** Sideways drift. Zero for an ordinary shot, non-zero for the outer eggs of
   *  a multishot fan. */
  vx: number
  /** `normal` and `super` are eggs; the rest are upgrades. Everything except
   *  `normal` passes through whatever is in its way. */
  kind: 'normal' | 'super' | 'heart' | 'blackHole' | 'gramophone'
  /** Seconds of music left before a gramophone finishes the fleet. Unused by
   *  every other kind. */
  fuse: number
}

/** One gravity wave, expanding from wherever the hen was when it was fired. */
export interface Wave {
  x: number
  y: number
  radius: number
  /** A wave gets one go at the mothership, on the frame its front reaches it. */
  hitBoss: boolean
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

/** Every upgrade runs on a clock, so every upgrade has a countdown to show.
 *  `duration` is what it started with, which is what the HUD bar measures
 *  against. */
export interface Timed {
  remaining: number
  duration: number
}

/**
 * What the hen's eggs have been upgraded to. The timed ones run until their
 * clock is out; the single-shot ones are spent the moment they are fired, and
 * their clock is only how long they can be carried unfired.
 */
export type Power =
  | { kind: 'none' }
  | ({ kind: 'multishot'; eggs: number } & Timed)
  | ({ kind: 'superEgg' } & Timed)
  | ({ kind: 'beam' } & Timed)
  | ({ kind: 'shield' } & Timed)
  | ({ kind: 'heart' } & Timed)
  | ({ kind: 'gravity' } & Timed)
  | ({ kind: 'blackHole' } & Timed)
  | ({ kind: 'gramophone' } & Timed)

/** Einstein, mid-sentence, with the board stopped behind him. */
export interface Freeze {
  x: number
  /** Seconds of stopped time left. */
  remaining: number
}

/** The Rambo egg, waiting in a top corner to be shot. */
export interface Pickup {
  x: number
  y: number
  /** Seconds left before it gives up and goes. */
  remaining: number
}

/** An explosion. Purely decorative: the kill happens the instant it goes off,
 *  and this is what the player sees of it. `radius` is what it grows to, which
 *  is how one saucer popping is told apart from a super egg. */
export interface Blast {
  x: number
  y: number
  age: number
  radius: number
  duration: number
}

export type ToyKind = 'cradle' | 'duck' | 'ball' | 'teddy'

export interface Obstacle {
  kind: ToyKind
  x: number
  y: number
  /** Counts down from OBSTACLE.hitPoints; the toy is removed at zero. Every
   *  saucer a loose toy wrecks costs it one as well. */
  health: number
  /** Velocity. Zero until an egg knocks the toy off its spot. */
  vx: number
  vy: number
  /** Tumble, once it is loose. */
  spin: number
  rotation: number
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
 * Top-level phase. `parley` is the opening exchange, which only round 1 gets;
 * `intro` shows the round banner; `playing` runs the simulation; `cleared`
 * pauses briefly between rounds; `abduction` is the closing scene after the
 * last hen falls; and `over` waits for the player to start again.
 */
export type Phase =
  | { kind: 'parley'; line: 0 | 1; remaining: number }
  | { kind: 'intro'; remaining: number }
  | { kind: 'playing' }
  | { kind: 'cleared'; remaining: number }
  | { kind: 'abduction'; age: number }
  | { kind: 'over'; scoreSubmitted: boolean }

export interface GameState {
  phase: Phase
  round: number
  score: number
  hen: Hen
  ufos: Ufo[]
  /** Set on boss rounds, when `ufos` is empty instead. */
  boss: Boss | null
  shots: Shot[]
  waves: Wave[]
  lasers: Laser[]
  obstacles: Obstacle[]
  power: Power
  pickup: Pickup | null
  /** Seconds until the Rambo egg turns up, or null if this round has none. */
  pickupTimer: number | null
  blasts: Blast[]
  /** Countdowns to the next saucer losing its nerve; one entry per desertion
   *  the round still owes. */
  desertions: number[]
  /** Seconds left of the mothership's reply to a heart, or null. */
  bossTaunt: number | null
  /** Set while time is stopped. The hen and everything she has thrown carry on;
   *  nothing else does. */
  freeze: Freeze | null
  /** Seconds until Einstein turns up, or null if this round has no visit. */
  freezeTimer: number | null
  /** Score at which the next free life is awarded. */
  nextLifeAt: number
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
