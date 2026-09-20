/**
 * Every tunable number in the game. Kept in one place so balancing is a matter
 * of editing this file rather than hunting through the simulation.
 */

/** Fixed internal resolution. The canvas is CSS-scaled to fit the window, so
 *  all game maths can assume this coordinate space regardless of display size. */
export const VIEW = { width: 800, height: 600 } as const

export const HEN = {
  width: 50,
  height: 52,
  speed: 330,
  /** Distance from the bottom of the view to the hen's feet. */
  bottomMargin: 18,
  lives: 3,
  /** Seconds of blinking immunity after taking a hit. */
  hurtInvulnerability: 1.6,
} as const

export const EGG = {
  width: 12,
  height: 16,
  speed: 540,
  /** Minimum seconds between shots. */
  cooldown: 0.22,
  /** How many eggs may be in flight at once. Low on purpose: with a splattered
   *  saucer taking its time to limp away, scarce ammo is what makes
   *  double-tapping a real cost. */
  maxInFlight: 3,
} as const

export const LASER = {
  width: 6,
  height: 20,
  baseSpeed: 210,
  /** Added to baseSpeed for every round beyond the first. */
  speedPerRound: 16,
} as const

export const UFO = {
  width: 46,
  height: 30,
  columns: 9,
  /** Rows in round 1; grows with the round up to maxRows. */
  baseRows: 3,
  maxRows: 6,
  cellWidth: 62,
  cellHeight: 44,
  /** Pixels the whole formation drops when it touches a side wall. */
  descendStep: 18,
  /** Horizontal pixels per march step. */
  marchStep: 10,
  /** Seconds between march steps with a full formation... */
  slowestStepInterval: 0.6,
  /** ...and with a single saucer left. The formation accelerates between the
   *  two as its ranks thin, which is what makes the last saucer frightening. */
  fastestStepInterval: 0.08,
  /** Score per saucer, indexed from the front (bottom) row backwards. */
  rowScores: [10, 20, 30, 40, 50, 60],
  /** Formation top edge in round 1, pushed lower every few rounds. */
  startY: 70,
  startYPerRound: 6,
  maxStartY: 160,
} as const

/**
 * What an egg to the windscreen does. The pilot is blinded rather than killed:
 * the saucer drops out of the formation, hangs there reeling, and then limps
 * off to whichever side wall is nearer.
 */
export const SPLAT = {
  /** Seconds the blinded saucer hangs in place before it gives up and runs. */
  reelDuration: 0.55,
  /** Horizontal speed it peels off at... */
  fleeSpeed: 120,
  /** ...accelerating by this much per second while it runs, so the retreat
   *  starts as a stagger and ends as a bolt for the edge. */
  fleeAcceleration: 430,
  fleeMaxSpeed: 620,
  /** Downward drift while fleeing. Enough to read as losing height, small
   *  enough that the saucer still leaves by the side rather than the floor. */
  sinkSpeed: 34,
  /** Radians the hull banks into its escape, reached at fleeMaxSpeed. */
  bankAngle: 0.45,
} as const

export const OBSTACLE = {
  count: 4,
  width: 56,
  height: 44,
  /** Shots absorbed before the toy is destroyed. Finite on purpose: an
   *  indestructible shield turns every round after the third into camping. */
  hitPoints: 4,
  /** Vertical band the toys are scattered in, between the formation and the hen. */
  minY: 415,
  maxY: 460,
  /** Minimum horizontal gap between two toys, so they cannot form a wall. */
  minGap: 34,
  /** Toys are kept this far from the side walls. */
  sideMargin: 40,
} as const

export const ROUND = {
  /** Seconds between laser shots in round 1... */
  baseFireInterval: 1.7,
  /** ...reduced by this much per round, down to minFireInterval. */
  fireIntervalPerRound: 0.14,
  minFireInterval: 0.26,
  /** Lasers allowed on screen at once: this, plus one per two rounds. */
  baseMaxLasers: 2,
  /** Seconds the round banner is shown before the saucers start marching. */
  introDuration: 1.8,
} as const

export const SCORES = {
  storageKey: 'lolinvaders.highscores.v1',
  keep: 5,
} as const

export const PALETTE = {
  background: '#050915',
  backgroundGlow: '#141d3d',
  floorLine: '#3b4a78',
  hud: '#e8ecf7',
  hudDim: '#8d9ab8',
  accent: '#ffd76a',
} as const
