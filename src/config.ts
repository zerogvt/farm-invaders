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
  /** Points between free lives. Awarded in a loop, so a single screen-clearing
   *  upgrade that vaults several thresholds at once pays out for all of them. */
  extraLifeEvery: 2000,
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
  baseRows: 2,
  maxRows: 5,
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

/**
 * The mothership that replaces the formation on every second round. It takes
 * one egg per round number to see off and answers with a volley of that many
 * lasers, so a boss round is a short, loud test of dodging rather than of
 * clearing a grid.
 */
export const BOSS = {
  width: 172,
  height: 96,
  /** Horizontal patrol speed. It turns at the walls rather than descending. */
  speed: 98,
  /** Slow sink, so a boss round cannot be stalled indefinitely. */
  sinkSpeed: 3.4,
  startY: 58,
  /** Seconds between volleys in round 2... */
  baseFireInterval: 1.6,
  /** ...shortened by this much per round, down to minFireInterval. */
  fireIntervalPerRound: 0.06,
  minFireInterval: 0.65,
  /** Total spread of a volley, in radians. Wide enough that standing still is
   *  never the answer, narrow enough to leave gaps to run through. */
  volleySpread: 1.5,
  /** Random wobble added to each shot in a volley. */
  volleyJitter: 0.18,
  /** Points for seeing one off, multiplied by the round. */
  scorePerRound: 100,
} as const

/**
 * Desertions. A tenth of every formation loses its nerve somewhere in the round,
 * says its piece and flies home. Staggered rather than simultaneous: a whole
 * rank vanishing at once reads as a bug, one saucer at a time reads as a mood
 * spreading through the fleet.
 */
export const DESERT = {
  /** Fraction of the formation that will not go through with it. */
  fraction: 0.1,
  minDelay: 1.5,
  maxDelay: 9,
  bubble: 'make \u2764\ufe0f not war',
  /** Seconds a deserter hangs there making its point before it leaves. */
  bubbleDuration: 1.6,
} as const

/** What the mothership has to say when a heart is set off under it. */
export const TAUNT = {
  text: "no xmas truce. This aint 1914. I'm da central command!",
  duration: 3.4,
} as const

/**
 * The Rambo egg: a bandana-wearing pickup that turns up in a top corner on
 * random rounds and upgrades the hen's eggs if she can hit it before it leaves.
 */
export const POWER = {
  /** Chance a round shows one at all. Never set below one round in three. */
  chance: 0.4,
  /** Seconds into the round it turns up. */
  minDelay: 1.5,
  maxDelay: 5,
  /** Seconds it stays before giving up and leaving. */
  linger: 10,
  width: 44,
  height: 54,
  /** Distance from the side wall and the top of the view. */
  sideMargin: 26,
  top: 34,

  /** Eggs per volley once multishot lands, picked at random in this range. */
  multishotMin: 5,
  multishotMax: 20,
  multishotDuration: 6,
  /** Half-angle of the volley fan, in radians. */
  multishotSpread: 0.85,

  /** The super egg bursts at this fraction of the view height... */
  superEggBurstY: 0.45,
  superEggWidth: 46,
  superEggHeight: 58,
  superEggSpeed: 380,
  /** ...and the shockwave ring is drawn for this long afterwards. */
  blastDuration: 0.7,
  blastRadius: 520,

  beamDuration: 6,
  beamWidth: 18,

  shieldDuration: 10,

  /** Radius of the little burst left where a single saucer goes up. */
  popRadius: 90,
  popDuration: 0.45,
} as const

/** The exploding heart. It talks the fleet out of the war; the mothership is
 *  not open to persuasion. */
export const HEART = {
  width: 42,
  height: 38,
  speed: 360,
  /** Fraction of the view height it bursts at, as the super egg does. */
  burstY: 0.45,
} as const

/**
 * Gravity waves. Each shot sends one ring out from the hen; anything it washes
 * over loses attitude control, wobbles off at random and detonates against
 * whatever it blunders into — including, eventually, itself.
 */
export const GRAVITY = {
  duration: 5,
  /** Seconds between waves, longer than the egg cooldown so the rings stay
   *  separable rather than merging into one wall. */
  cooldown: 0.55,
  /** Pixels per second the ring expands by, and where it gives up. */
  growth: 150,
  maxRadius: 640,
  /** How fast a tumbling saucer drifts, and how often it picks a new heading. */
  wobbleSpeed: 135,
  turnInterval: 0.35,
  /** Hit points a single wave takes off the mothership, which has no attitude
   *  to lose. Without this the upgrade would do nothing at all on a boss round. */
  bossDamage: 1,
} as const

/** The black hole: three times an ordinary egg's radius, swallowing everything
 *  inside twice that. */
export const BLACK_HOLE = {
  radius: (12 / 2) * 3,
  /** Multiple of the radius it reaches out to. */
  reach: 2,
  speed: 150,
} as const

/** The gramophone. It drifts up playing something the fleet cannot survive. */
export const GRAMOPHONE = {
  width: 48,
  height: 48,
  speed: 60,
  /** Seconds of music before the whole fleet goes up. */
  fuse: 3,
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
  /** Longer on a boss round, because the banner has something to say. */
  bossIntroDuration: 2.6,
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
