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
  /** Half what it was. Slower fire also lingers longer, so the on-screen cap
   *  bites more often and the fleet effectively shoots less as well. */
  baseSpeed: 105,
  /** Added to baseSpeed for every round beyond the first. */
  speedPerRound: 8,
} as const

export const UFO = {
  width: 46,
  height: 30,
  columns: 6,
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
  baseFireInterval: 4.8,
  /** ...shortened by this much per round, down to minFireInterval. All three
   *  were doubled twice to stop the mothership ramping into unplayable, then
   *  taken back down by a quarter, which is a third more volleys. */
  fireIntervalPerRound: 0.18,
  minFireInterval: 1.95,
  /** Total spread of a volley, in radians. Wide enough that standing still is
   *  never the answer, narrow enough to leave gaps to run through. */
  volleySpread: 1.5,
  /** Random wobble added to each shot in a volley. */
  volleyJitter: 0.18,
  /** Directions in a volley: the round number, less this, then divided by
   *  volleyDivisor. Never below one — a mothership that cannot shoot at all is
   *  not a boss round. */
  volleyReduction: 2,
  volleyDivisor: 2,
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
  text: "no xmas truce. I'm central command!",
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

  /** How long a one-shot upgrade can be carried before it goes off the boil.
   *  Generous on purpose: it exists so every upgrade has a clock to show, not
   *  to punish anyone for lining up a shot. */
  holdDuration: 12,

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

/**
 * The black hole. A single shot: the hen fires it and it opens somewhere in the
 * sky, not where she is standing. Every saucer on the board, and the
 * mothership, is caught at once and spirals in, the nearer ones first.
 */
export const BLACK_HOLE = {
  radius: 34,
  /** Where it may open: a band of sky clear of the HUD and of the toys. */
  minX: 140,
  maxX: 660,
  minY: 150,
  maxY: 260,
  /** How fast a caught hull falls inwards: a fixed pull plus a share of its
   *  distance, per second. From across the screen that is about three
   *  seconds; from close by, about one and a half. */
  pull: 30,
  pullPerPixel: 0.9,
  /** Spin, in radians per second: a base rate plus more the closer it gets, so
   *  the last turns are the fastest. */
  baseSpin: 1.6,
  spinNear: 240,
  /** Swallowed once it is this close to the centre. */
  swallowRadius: 10,
  /** Seconds it takes to open, and the longest it stays open. */
  openDuration: 0.35,
  maxDuration: 4,
} as const

/**
 * The radioactive fox. Now and then a saucer at the front of the formation
 * drops one instead of firing. Eggs go straight through it and nothing the hen
 * has can stop it: it falls to the ground and runs off the nearer side, and if
 * it touches her on the way she loses a life.
 */
export const FOX = {
  width: 48,
  height: 36,
  /** Seconds between foxes on a fleet round, rolled afresh after each one. */
  minInterval: 8,
  maxInterval: 16,
  fallSpeed: 150,
  runSpeed: 260,
  /** Radians per second it tumbles at on the way down. */
  spin: 3,
} as const

/** The feathers that come off the hen when she loses a life. */
export const FEATHERS = {
  count: 10,
  /** Seconds each one lasts, fading over the last part. */
  life: 1.8,
  /** How hard they are knocked loose, and how fast they may then fall. */
  burst: 150,
  gravity: 120,
  maxFall: 55,
  /** Side-to-side sway as they drift down, in pixels either way. */
  sway: 7,
} as const

/**
 * The mothership's windscreen wiper. Every so often it clears about a fifth of
 * the eggs off its canopy, and each egg it clears is a hit point back.
 */
export const WIPER = {
  minInterval: 5,
  maxInterval: 10,
  fraction: 0.2,
  /** Seconds the blade takes to cross the canopy. */
  duration: 0.7,
} as const

/**
 * The cow. It does nothing, collides with nothing and cannot be hurt — it is
 * simply what the whole argument is about, standing on the ground behind the
 * hen so that the opening demand and the closing abduction both have something
 * to point at.
 */
export const COW = {
  width: 70,
  height: 46,
  /** Fixed spot on the ground, well clear of where the hen starts. */
  x: 92,
  bottomMargin: 18,
  /** What it says on the way up into the mothership. */
  line: 'Moooooooooo',
  /** What it says every time a round is cleared. */
  roundLine: 'Moo',
} as const

/**
 * The cow's burp. Firing it has the cow let go a cloud of bubbles that fans out
 * from its mouth across the whole screen; every bubble that touches a saucer
 * pops it outright.
 */
export const BURP = {
  /** Bubbles in one burp. Enough that their paths cover the screen. */
  bubbles: 70,
  minRadius: 12,
  maxRadius: 24,
  minSpeed: 170,
  maxSpeed: 330,
  /** Sideways wobble as they rise, in pixels either way. */
  wobble: 10,
  /** The speech bubble that goes with it. */
  line: 'BURP!',
  lineDuration: 1.1,
} as const

/**
 * The wingman: a second hen in a different colour who patrols the ground on
 * her own and throws eggs non-stop for as long as the upgrade lasts. Lasers
 * that reach her are absorbed; she cannot be hurt.
 */
export const WINGMAN = {
  duration: 10,
  /** Patrol speed, wall to wall. Slower than the hen so the two drift apart. */
  speed: 190,
  /** Seconds between her volleys. She does not wait for the fire key. */
  cooldown: 0.3,
} as const

/** The exchange that opens a run, before the first shot is fired. */
export const PARLEY = {
  demand: 'Give us the cow now!',
  demandDuration: 2.4,
  refusal: 'Never!',
  refusalDuration: 1.6,
} as const

/** What happens after the last hen falls: a mothership comes down for the cow. */
export const ABDUCTION = {
  /** Seconds the whole scene runs before the game-over panel appears. */
  duration: 4.2,
  /** Where the ship stops to work. */
  hoverY: 84,
  /** Beats within the scene, in seconds from the start. */
  beamOn: 1.0,
  liftFrom: 1.4,
  liftTo: 3.0,
  leaveFrom: 3.2,
} as const

/**
 * Einstein. He turns up on about one round in three, says his piece, and stops
 * time for everything except the hen and what she has thrown.
 */
export const FREEZE = {
  /** Rounds that get one, on average. */
  chance: 1 / 3,
  minDelay: 2,
  maxDelay: 10,
  /** Seconds the board stays stopped. */
  duration: 5,
  greeting: 'Time freeze mate',
  width: 56,
  height: 62,
  /** He stands at one side, clear of both the fleet and the top corners the
   *  Rambo egg uses. */
  sideMargin: 22,
  y: 244,
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
  /** Saucers a loose toy can wreck before it breaks up. Shots no longer wear a
   *  toy down at all — cover is removed by launching it, not by eroding it. */
  hitPoints: 4,
  /** Vertical band the toys are scattered in, between the formation and the hen. */
  minY: 415,
  maxY: 460,
  /** Minimum horizontal gap between two toys, so they cannot form a wall. */
  minGap: 34,
  /** Toys are kept this far from the side walls. */
  sideMargin: 40,

  /** Upward speed a single egg knocks into a toy. Each further egg adds
   *  another, so a toy can be walked up the screen — at the cost of a hit
   *  point every time, which is what stops one egg clearing a formation. */
  kick: 175,
  /** Share of a fanned egg's sideways drift that carries into the toy. */
  kickDrag: 0.35,
  maxSpeed: 500,
  /** Radians per second a loose toy tumbles at. */
  spin: 2.4,
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
  storageKey: 'farminvaders.highscores.v1',
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
