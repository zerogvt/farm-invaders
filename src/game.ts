import {
  ABDUCTION,
  BLACK_HOLE,
  BOSS,
  BURP,
  COW,
  DESERT,
  EGG,
  FEATHERS,
  FOX,
  FREEZE,
  GRAMOPHONE,
  GRAVITY,
  HEART,
  HEN,
  LASER,
  OBSTACLE,
  PARLEY,
  PARLEY_SHIP,
  POWER,
  ROUND,
  SHIELD,
  SPLAT,
  TAUNT,
  UFO,
  VICTORY,
  VIEW,
  WINGMAN,
  WIPER,
} from './config'
import type { InputState } from './input'
import { placeObstacles } from './obstacles'
import type {
  Boss,
  Bubble,
  GameState,
  Laser as LaserShot,
  Power,
  Rect,
  Shot,
  Splat,
  Timed,
  Ufo,
  UfoState,
} from './types'

/** Y coordinate of the top of the hen's helmet; the line the saucers race for. */
export const HEN_TOP = VIEW.height - HEN.bottomMargin - HEN.height

/**
 * Every second round replaces the formation with a single mothership. The
 * alternation is what keeps the two round shapes legible: a grid to clear, then
 * one big thing to dodge, and back.
 */
export function isBossRound(round: number): boolean {
  return round % 2 === 0
}

/** Eggs needed to see the mothership off — the round number, as announced on
 *  the banner before the round starts. */
export function bossHitPoints(round: number): number {
  return round
}

/** How big each thing the hen throws is. Exported because the renderer needs
 *  the same answer and a second copy of the table would drift. */
export function shotSize(kind: Shot['kind']): { width: number; height: number } {
  switch (kind) {
    case 'super':
      return { width: POWER.superEggWidth, height: POWER.superEggHeight }
    case 'heart':
      return { width: HEART.width, height: HEART.height }
    case 'gramophone':
      return { width: GRAMOPHONE.width, height: GRAMOPHONE.height }
    case 'normal':
      return { width: EGG.width, height: EGG.height }
  }
}

function shotSpeed(kind: Shot['kind']): number {
  switch (kind) {
    case 'super':
      return POWER.superEggSpeed
    case 'heart':
      return HEART.speed
    case 'gramophone':
      return GRAMOPHONE.speed
    case 'normal':
      return EGG.speed
  }
}

/** Things the simulation wants to announce but does not want to own: sounds,
 *  score submission, screen shake. Everything is optional so update() stays
 *  testable without a UI attached. */
export interface GameEvents {
  /** An egg has just burst on a windscreen. The saucer is still on screen. */
  onUfoSplattered?: (ufo: Ufo) => void
  /** A saucer has lost its nerve and is going home. */
  onUfoDeserted?: (ufo: Ufo) => void
  /** A saucer is off the board for good, and scores. */
  onUfoDowned?: (ufo: Ufo, points: number) => void
  onBossHit?: (boss: Boss) => void
  onBossDowned?: (points: number) => void
  /** The mothership has declined a heart, and the hen has a super egg instead. */
  onBossTaunt?: () => void
  onPowerGained?: (power: Power) => void
  /** The hen has picked up a dropped shield. */
  onShieldGained?: () => void
  /** Her shield has taken a hit; `hits` is what it has left. */
  onShieldHit?: (hits: number) => void
  /** The final round is over: the beaten fleet is leaving. */
  onVictory?: () => void
  onExtraLife?: (lives: number) => void
  onHenHurt?: () => void
  onRoundCleared?: (round: number) => void
  /** The run is over, lost or — after the final round — won. */
  onGameOver?: (score: number, round: number, won: boolean) => void
  /** Something has gone up. `big` is a gramophone finale; everything else is a
   *  single saucer or toy popping. */
  onExplosion?: (size: 'small' | 'big') => void
  /** The hen (or the wingman) has thrown something. */
  onShot?: (kind: Shot['kind'], wingman: boolean) => void
  /** The super egg has burst over the fleet. */
  onSuperSplat?: () => void
  onHeartBurst?: () => void
  /** The cow has let go of its burp. */
  onBurp?: () => void
  onGravityWave?: () => void
  /** A saucer or the mothership has fired. Once per volley, not per laser. */
  onLaserFired?: () => void
  /** An egg has met a laser in mid-air and both are gone. */
  onLaserShotDown?: () => void
  /** An egg has knocked a toy loose, or knocked a loose one harder. */
  onToyKicked?: () => void
  /** Einstein has stopped the clock. */
  onFreeze?: () => void
  /** A saucer has dropped a radioactive fox. */
  onFoxThrown?: () => void
  /** The hen has fired the black hole, and it has opened. */
  onBlackHole?: () => void
  /** The mothership has wiped some of the egg off its canopy. */
  onBossWipe?: () => void
}

export function createGame(): GameState {
  const state: GameState = {
    phase: { kind: 'intro', remaining: ROUND.introDuration },
    round: 1,
    score: 0,
    hen: { x: VIEW.width / 2 - HEN.width / 2, lives: HEN.lives, invulnerable: 0 },
    ufos: [],
    boss: null,
    shots: [],
    waves: [],
    bubbles: [],
    burpLine: null,
    lasers: [],
    foxes: [],
    foxTimer: null,
    foxesThrown: 0,
    feathers: [],
    vortex: null,
    obstacles: [],
    power: { kind: 'none' },
    shield: null,
    shieldDrops: [],
    cheat: false,
    pickup: null,
    pickupTimer: null,
    pickupsLeft: 0,
    blasts: [],
    desertions: [],
    bossTaunt: null,
    freeze: null,
    freezeTimer: null,
    nextLifeAt: HEN.extraLifeEvery,
    marchTimer: 0,
    marchDirection: 1,
    roundUfoCount: 0,
    fireTimer: 0,
    shotCooldown: 0,
  }
  startRound(state, 1)
  return state
}

/**
 * Resets the board for a round: a formation or a mothership, a fresh scatter of
 * toys, and no leftover projectiles. Score, lives, the hen's position and any
 * upgrade she is holding all carry over — an upgrade won in the last seconds of
 * a round would otherwise be confiscated for winning.
 */
export function startRound(state: GameState, round: number): void {
  const boss = isBossRound(round)
  state.round = round
  state.ufos = boss ? [] : buildFormation(round)
  state.boss = boss ? buildBoss(round) : null
  state.roundUfoCount = state.ufos.length
  state.obstacles = placeObstacles()
  state.shots = []
  state.waves = []
  state.bubbles = []
  state.burpLine = null
  state.lasers = []
  state.foxes = []
  state.shieldDrops = []
  state.foxesThrown = 0
  // Foxes come from the formation, so a mothership round has none.
  state.foxTimer = boss ? null : rollFox(round)
  state.vortex = null
  state.blasts = []
  state.pickup = null
  const pickups = pickupsFor(round)
  state.pickupsLeft = Math.max(0, pickups - 1)
  state.pickupTimer = pickups > 0 ? between(POWER.minDelay, POWER.maxDelay) : null
  state.desertions = rollDesertions(state.ufos.length)
  state.bossTaunt = null
  state.freeze = null
  state.freezeTimer = rollFreeze()
  state.marchDirection = 1
  state.marchTimer = stepInterval(state)
  state.fireTimer = boss ? bossFireInterval(round) : fireInterval(round)
  state.shotCooldown = 0
  state.hen.invulnerable = HEN.hurtInvulnerability
  // A run opens with the argument rather than a banner; every round after that
  // has nothing left to say.
  state.phase =
    round === 1
      ? { kind: 'parley', line: 0, remaining: parleyDuration(0) }
      : { kind: 'intro', remaining: boss ? ROUND.bossIntroDuration : ROUND.introDuration }
}

/** How long each beat of the opening exchange lasts: the mothership arriving
 *  and demanding, the hen refusing, and the mothership leaving. */
export function parleyDuration(line: 0 | 1 | 2): number {
  switch (line) {
    case 0:
      return PARLEY_SHIP.arrive + PARLEY.demandDuration
    case 1:
      return PARLEY.refusalDuration
    case 2:
      return PARLEY_SHIP.leave
  }
}

export function restart(state: GameState): void {
  state.score = 0
  state.hen.lives = HEN.lives
  state.hen.x = VIEW.width / 2 - HEN.width / 2
  state.power = { kind: 'none' }
  state.shield = null
  state.nextLifeAt = HEN.extraLifeEvery
  startRound(state, 1)
}

/**
 * Advances the whole simulation by `dt` seconds. `dt` is clamped by the caller,
 * so a backgrounded tab cannot resume with a single enormous step that
 * teleports lasers straight through the hen.
 */
export function update(state: GameState, dt: number, input: InputState, events: GameEvents = {}): void {
  switch (state.phase.kind) {
    case 'parley': {
      // Both sides say their piece before anybody moves. The hen can walk about
      // while it happens; nothing else on the board can.
      const parley = state.phase
      parley.remaining -= dt
      moveHen(state, dt, input)
      tickTimers(state, dt)
      if (parley.remaining > 0) return
      state.phase =
        parley.line === 2
          ? { kind: 'playing' }
          : { kind: 'parley', line: parley.line === 0 ? 1 : 2, remaining: parleyDuration(parley.line === 0 ? 1 : 2) }
      return
    }

    case 'abduction':
      // The board is held exactly as it was; only the scene advances. The
      // game-over panel waits for it, which is why onGameOver fires here rather
      // than when the last hen fell. The feathers off that last hit still
      // drift down over it.
      state.phase.age += dt
      tickFeathers(state, dt)
      if (state.phase.age >= ABDUCTION.duration) {
        state.phase = { kind: 'over', scoreSubmitted: false }
        events.onGameOver?.(state.score, state.round, false)
      }
      return

    case 'intro':
      state.phase.remaining -= dt
      // The hen can already line up her shot during the banner; only the
      // saucers wait.
      moveHen(state, dt, input)
      tickTimers(state, dt)
      if (state.phase.remaining <= 0) state.phase = { kind: 'playing' }
      return

    case 'cleared':
      state.phase.remaining -= dt
      moveHen(state, dt, input)
      advanceShots(state, dt, events)
      tickBubbles(state, dt, events)
      advanceLasers(state, dt)
      advanceFoxes(state, dt)
      tickTimers(state, dt)
      if (state.phase.remaining > 0) return
      if (state.round >= VICTORY.finalRound) {
        state.phase = { kind: 'victory', age: 0 }
        events.onVictory?.()
      } else {
        startRound(state, state.round + 1)
      }
      return

    case 'victory':
      // The board is empty and stays that way; the ending is all the
      // renderer's, driven off the phase's age.
      state.phase.age += dt
      tickFeathers(state, dt)
      if (state.phase.age >= VICTORY.duration) {
        state.phase = { kind: 'over', scoreSubmitted: false }
        events.onGameOver?.(state.score, state.round, true)
      }
      return

    case 'over':
      return

    case 'playing':
      break
  }

  // The hen, and everything she has already thrown, are exempt from the freeze.
  // Everything else on the board simply does not get its tick.
  const frozen = state.freeze !== null
  moveHen(state, dt, input)
  tickTimers(state, dt)
  tryShoot(state, input, events)
  tickWingman(state, dt, events)
  advanceShots(state, dt, events)
  tickBubbles(state, dt, events)
  tickWaves(state, dt, events)
  tickBeam(state, dt, events)
  // The black hole is the hen's, so it keeps pulling with time stopped.
  tickVortex(state, dt, events)

  if (!frozen) {
    advanceLasers(state, dt)
    advanceFoxes(state, dt)
    tickFoxTimer(state, dt, events)
    tickShieldDrops(state, dt)
    marchFormation(state, dt)
    tickLeaving(state, dt, events)
    tickWobble(state, dt, events)
    tickObstacles(state, dt, events)
    tickDesertions(state, dt, events)
    tickBoss(state, dt, events)
    if (state.boss === null) fireLasers(state, dt, events)
    else fireVolley(state, dt, events)
    tickPickup(state, dt)
    tickEinstein(state, dt, events)
  }

  resolveCollisions(state, frozen, events)
  collectShields(state, events)

  if (state.ufos.length === 0 && state.boss === null) {
    events.onRoundCleared?.(state.round)
    state.phase = { kind: 'cleared', remaining: 1.4 }
    return
  }

  // Anything that reaches the hen's line ends the run outright, however many
  // lives are left — same rule as the original invasion. A saucer that is
  // leaving or tumbling is not an invader any more, whatever height it is at.
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'flying') continue
    if (ufo.y + UFO.height >= HEN_TOP) {
      endGame(state)
      return
    }
  }
  if (state.boss !== null && state.boss.state.kind === 'flying' && state.boss.y + BOSS.height >= HEN_TOP) {
    endGame(state)
  }
}

function tickTimers(state: GameState, dt: number): void {
  if (state.shotCooldown > 0) state.shotCooldown = Math.max(0, state.shotCooldown - dt)
  if (state.hen.invulnerable > 0) state.hen.invulnerable = Math.max(0, state.hen.invulnerable - dt)

  if (state.bossTaunt !== null) {
    state.bossTaunt -= dt
    if (state.bossTaunt <= 0) state.bossTaunt = null
  }

  if (state.burpLine !== null) {
    state.burpLine -= dt
    if (state.burpLine <= 0) state.burpLine = null
  }

  // Stopped time runs down on the hen's clock, which is the only one still
  // going.
  if (state.freeze !== null) {
    state.freeze.remaining -= dt
    if (state.freeze.remaining <= 0) state.freeze = null
  }

  const power = state.power
  if (power.kind !== 'none') {
    power.remaining -= dt
    if (power.remaining <= 0) state.power = { kind: 'none' }
  }
  // A black hole always in hand, freshly charged.
  if (state.cheat && state.power.kind !== 'blackHole') state.power = { kind: 'blackHole', ...clock(POWER.holdDuration) }
  if (state.cheat && state.power.kind === 'blackHole') state.power.remaining = state.power.duration

  const blasts = []
  for (const blast of state.blasts) {
    blast.age += dt
    if (blast.age < blast.duration) blasts.push(blast)
  }
  state.blasts = blasts
  tickFeathers(state, dt)
}

/** Feathers drifting down after a hit: knocked loose fast, then slowed to a
 *  sway by the air, and gone once they have faded. */
function tickFeathers(state: GameState, dt: number): void {
  if (state.feathers.length === 0) return
  const drag = Math.max(0, 1 - 2.4 * dt)
  const drifting = []
  for (const feather of state.feathers) {
    feather.age += dt
    if (feather.age >= FEATHERS.life) continue
    feather.vx *= drag
    feather.vy = Math.min(FEATHERS.maxFall, feather.vy * drag + FEATHERS.gravity * dt)
    feather.x += feather.vx * dt
    feather.y += feather.vy * dt
    feather.rotation += feather.spin * dt
    drifting.push(feather)
  }
  state.feathers = drifting
}

/** Where a feather is drawn, sway included. Kept out of the state so the sway
 *  never drags a feather off its path. */
export function featherSway(feather: GameState['feathers'][number]): number {
  return Math.sin(feather.age * 5 + feather.phase) * FEATHERS.sway
}

/** About one round in three gets a visit; the rest get none. */
function rollFreeze(): number | null {
  if (Math.random() >= FREEZE.chance) return null
  return FREEZE.minDelay + Math.random() * (FREEZE.maxDelay - FREEZE.minDelay)
}

/** Einstein turning up. He picks a side and stops the board; he is not shot at
 *  and cannot be missed, so there is nothing for the player to do but use it. */
function tickEinstein(state: GameState, dt: number, events: GameEvents): void {
  if (state.freezeTimer === null) return
  state.freezeTimer -= dt
  if (state.freezeTimer > 0) return

  state.freezeTimer = null
  const onLeft = Math.random() < 0.5
  state.freeze = {
    x: onLeft ? FREEZE.sideMargin : VIEW.width - FREEZE.sideMargin - FREEZE.width,
    remaining: FREEZE.duration,
  }
  events.onFreeze?.()
}

/** Adds points and hands out a free life for every threshold crossed. The loop
 *  matters: one gramophone can clear a whole formation and vault two of them. */
function awardScore(state: GameState, points: number, events: GameEvents): void {
  state.score += points
  while (state.score >= state.nextLifeAt) {
    state.hen.lives += 1
    state.nextLifeAt += HEN.extraLifeEvery
    events.onExtraLife?.(state.hen.lives)
  }
}

function moveHen(state: GameState, dt: number, input: InputState): void {
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (direction === 0) return
  const next = state.hen.x + direction * HEN.speed * dt
  state.hen.x = clamp(next, 0, VIEW.width - HEN.width)
}

// --- the hen's shots -------------------------------------------------------

function tryShoot(state: GameState, input: InputState, events: GameEvents): void {
  if (!input.fire) return
  if (state.shotCooldown > 0) return

  const power = state.power
  const muzzleX = state.hen.x + HEN.width / 2

  // Gravity is the one upgrade that does not put anything in the air: each
  // trigger pull sends a ring out from wherever the hen is standing.
  if (power.kind === 'gravity') {
    state.waves.push({ x: muzzleX, y: HEN_TOP, radius: 0, hitBoss: false })
    state.shotCooldown = GRAVITY.cooldown
    events.onGravityWave?.()
    return
  }

  // The beam burns by itself for as long as it lasts. It is not a gun, and the
  // fire key used to throw eggs straight up it as well.
  if (power.kind === 'beam') return

  // The black hole opens up in the sky rather than being thrown there — one at
  // a time.
  if (power.kind === 'blackHole') {
    if (state.vortex !== null) return
    openVortex(state)
    events.onBlackHole?.()
    state.power = { kind: 'none' }
    state.shotCooldown = EGG.cooldown
    return
  }

  // The burp is the cow's, not the hen's: the trigger is only what sets it off.
  if (power.kind === 'burp') {
    burp(state)
    events.onBurp?.()
    state.power = { kind: 'none' }
    state.shotCooldown = EGG.cooldown
    return
  }

  if (power.kind === 'superEgg' || power.kind === 'heart' || power.kind === 'gramophone') {
    const kind = power.kind === 'superEgg' ? 'super' : power.kind
    state.shots.push(heavyShot(kind, muzzleX))
    events.onShot?.(kind, false)
    state.power = { kind: 'none' }
    state.shotCooldown = EGG.cooldown
    return
  }

  if (power.kind === 'multishot') {
    // The fan is capped rather than uncapped: the cooldown alone would let a
    // twenty-egg volley stack up faster than the eggs can leave the view.
    if (state.shots.length >= power.eggs * 4) return
    for (let i = 0; i < power.eggs; i++) {
      const across = power.eggs === 1 ? 0 : (i / (power.eggs - 1)) * 2 - 1
      state.shots.push({
        ...egg(muzzleX),
        vx: Math.sin(across * POWER.multishotSpread) * EGG.speed,
      })
    }
    state.shotCooldown = EGG.cooldown
    events.onShot?.('normal', false)
    return
  }

  // The wingman's eggs are her own; they do not use up the hen's three throws.
  const perThrow = eggsPerThrow(state.round)
  const ownEggs = state.shots.reduce((count, shot) => count + (shot.wingman ? 0 : 1), 0)
  // A whole throw has to fit under the cap, or a part-spent one would overshoot.
  if (ownEggs + perThrow > EGG.maxInFlight * perThrow) return
  for (let i = 0; i < perThrow; i++) {
    state.shots.push(egg(muzzleX + (i - (perThrow - 1) / 2) * EGG.spacing))
  }
  state.shotCooldown = EGG.cooldown
  events.onShot?.('normal', false)
}

/** Eggs in one ordinary throw: one more for every ten rounds. Exported for the
 *  tests. */
export function eggsPerThrow(round: number): number {
  return Math.min(EGG.perThrowMax, Math.ceil(round / EGG.roundsPerExtraEgg))
}

/**
 * The wingman. She walks the ground wall to wall by herself and throws an egg
 * on her own clock. She lives inside the upgrade, so she is gone the moment its
 * clock runs out.
 */
function tickWingman(state: GameState, dt: number, events: GameEvents): void {
  const wing = state.power
  if (wing.kind !== 'wingman') return

  wing.x += wing.direction * WINGMAN.speed * dt
  if (wing.x <= 0) {
    wing.x = 0
    wing.direction = 1
  } else if (wing.x + HEN.width >= VIEW.width) {
    wing.x = VIEW.width - HEN.width
    wing.direction = -1
  }

  wing.cooldown -= dt
  if (wing.cooldown > 0) return
  wing.cooldown += WINGMAN.cooldown
  state.shots.push({ ...egg(wing.x + HEN.width / 2), wingman: true })
  events.onShot?.('normal', true)
}

/** She turns up on the far side of the board from the hen, walking inwards. */
function wingmanPower(state: GameState): Power {
  const henOnLeft = state.hen.x + HEN.width / 2 < VIEW.width / 2
  return {
    kind: 'wingman',
    x: henOnLeft ? VIEW.width * 0.75 - HEN.width / 2 : VIEW.width * 0.25 - HEN.width / 2,
    direction: henOnLeft ? -1 : 1,
    cooldown: 0,
    ...clock(WINGMAN.duration),
  }
}

function heavyShot(kind: Exclude<Shot['kind'], 'normal'>, muzzleX: number): Shot {
  const { width, height } = shotSize(kind)
  return {
    x: muzzleX - width / 2,
    y: HEN_TOP - height,
    spin: kind === 'gramophone' ? 0 : 1.4,
    rotation: 0,
    vx: 0,
    kind,
    fuse: GRAMOPHONE.fuse,
    wingman: false,
  }
}

function egg(muzzleX: number): Shot {
  return {
    x: muzzleX - EGG.width / 2,
    y: HEN_TOP - EGG.height,
    spin: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3),
    rotation: Math.random() * Math.PI * 2,
    vx: 0,
    kind: 'normal',
    fuse: 0,
    wingman: false,
  }
}

function advanceShots(state: GameState, dt: number, events: GameEvents): void {
  const flying = []
  for (const shot of state.shots) {
    const { width, height } = shotSize(shot.kind)
    shot.y -= shotSpeed(shot.kind) * dt
    shot.x += shot.vx * dt
    shot.rotation += shot.spin * dt

    if (shot.kind === 'super' && shot.y <= VIEW.height * POWER.superEggBurstY) {
      burst(state, shot.x + width / 2, shot.y + height / 2, events)
      continue
    }
    if (shot.kind === 'heart' && shot.y <= VIEW.height * HEART.burstY) {
      heartBurst(state, shot.x + width / 2, shot.y + height / 2, events)
      continue
    }
    if (shot.kind === 'gramophone') {
      shot.fuse -= dt
      if (shot.fuse <= 0) {
        finale(state, events)
        continue
      }
    }
    if (shot.y + height > 0 && shot.x + width > 0 && shot.x < VIEW.width) flying.push(shot)
  }
  state.shots = flying
}

function advanceLasers(state: GameState, dt: number): void {
  const flying = []
  for (const laser of state.lasers) {
    laser.x += laser.vx * dt
    laser.y += laser.vy * dt
    if (laser.y < VIEW.height && laser.x + laserWidth(laser) > 0 && laser.x < VIEW.width) flying.push(laser)
  }
  state.lasers = flying
}

// --- what the upgrades do --------------------------------------------------

/**
 * The super egg going off. It clears the sky outright: every saucer is
 * splattered at once and sent packing, the mothership loses whatever it had
 * left, and the lasers already in the air are wiped. The toys are left alone —
 * they are the player's cover, and blowing them up would make the best pickup
 * in the game a liability.
 */
function burst(state: GameState, x: number, y: number, events: GameEvents): void {
  state.blasts.push({ x, y, age: 0, radius: POWER.blastRadius, duration: POWER.blastDuration })
  events.onSuperSplat?.()
  for (const ufo of state.ufos) {
    if (ufo.state.kind === 'flying') ufo.state = leaveFrom(ufo.x, UFO.width, 'splattered')
  }
  if (state.boss !== null && state.boss.state.kind === 'flying') {
    state.boss.hitPoints = 0
    state.boss.state = leaveFrom(state.boss.x, BOSS.width, 'splattered')
  }
  state.lasers = []
}

/**
 * The exploding heart. It talks the whole formation out of the war at once —
 * they go home rather than being shot down, so they go home unscored. The
 * mothership is not open to persuasion and says so; the hen gets a super egg
 * for her trouble, which is the only argument it does respect.
 */
function heartBurst(state: GameState, x: number, y: number, events: GameEvents): void {
  state.blasts.push({ x, y, age: 0, radius: POWER.blastRadius * 0.8, duration: POWER.blastDuration })
  events.onHeartBurst?.()
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'flying') continue
    desert(state, ufo, events)
  }

  const boss = state.boss
  if (boss === null || boss.state.kind !== 'flying') return
  state.bossTaunt = TAUNT.duration
  state.power = { kind: 'superEgg', ...clock(POWER.holdDuration) }
  events.onBossTaunt?.()
}

/** The gramophone reaching the end of the record. Everything still up there
 *  goes up with it, the mothership included. */
function finale(state: GameState, events: GameEvents): void {
  events.onExplosion?.('big')
  for (const ufo of state.ufos) {
    pop(state, events, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
    awardScore(state, ufoPoints(ufo), events)
    events.onUfoDowned?.(ufo, ufoPoints(ufo))
  }
  state.ufos = []

  const boss = state.boss
  if (boss !== null) {
    state.blasts.push({
      x: boss.x + BOSS.width / 2,
      y: boss.y + BOSS.height / 2,
      age: 0,
      radius: POWER.blastRadius * 0.5,
      duration: POWER.blastDuration,
    })
    downBoss(state, events)
  }
  state.lasers = []
}

/**
 * The black hole opening. It turns up at a random spot in the sky and catches
 * everything at once: every saucer still in the fight and the mothership start
 * spiralling in from wherever they were. Deserters are left to go home — they
 * are out of the war already. The lasers in the air go in first.
 */
function openVortex(state: GameState): void {
  const x = BLACK_HOLE.minX + Math.random() * (BLACK_HOLE.maxX - BLACK_HOLE.minX)
  const y = BLACK_HOLE.minY + Math.random() * (BLACK_HOLE.maxY - BLACK_HOLE.minY)
  state.vortex = { x, y, age: 0 }
  state.lasers = []

  for (const ufo of state.ufos) {
    if (ufo.state.kind === 'leaving' && ufo.state.reason === 'deserted') continue
    ufo.state = caught(x, y, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
  }
  const boss = state.boss
  if (boss !== null) boss.state = caught(x, y, boss.x + BOSS.width / 2, boss.y + BOSS.height / 2)
}

function caught(cx: number, cy: number, x: number, y: number): UfoState {
  return { kind: 'swirling', angle: Math.atan2(y - cy, x - cx), radius: Math.hypot(x - cx, y - cy) }
}

/**
 * Everything caught by the black hole falling in. Each hull closes on the
 * centre at a pull that grows with its distance, so everything arrives within a
 * few seconds, and spins faster the closer it gets. What reaches the middle is
 * gone, and scores. The hole closes once it has nothing left to eat.
 */
function tickVortex(state: GameState, dt: number, events: GameEvents): void {
  const vortex = state.vortex
  if (vortex === null) return
  vortex.age += dt

  const survivors: Ufo[] = []
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'swirling') {
      survivors.push(ufo)
      continue
    }
    if (spiral(ufo.state, dt)) {
      const points = ufoPoints(ufo)
      awardScore(state, points, events)
      events.onUfoDowned?.(ufo, points)
      continue
    }
    ufo.x = vortex.x + Math.cos(ufo.state.angle) * ufo.state.radius - UFO.width / 2
    ufo.y = vortex.y + Math.sin(ufo.state.angle) * ufo.state.radius - UFO.height / 2
    survivors.push(ufo)
  }
  state.ufos = survivors

  const boss = state.boss
  if (boss !== null && boss.state.kind === 'swirling') {
    if (spiral(boss.state, dt)) {
      downBoss(state, events)
    } else {
      boss.x = vortex.x + Math.cos(boss.state.angle) * boss.state.radius - BOSS.width / 2
      boss.y = vortex.y + Math.sin(boss.state.angle) * boss.state.radius - BOSS.height / 2
    }
  }

  const eating =
    state.ufos.some((ufo) => ufo.state.kind === 'swirling') ||
    (state.boss !== null && state.boss.state.kind === 'swirling')
  if (!eating && vortex.age >= BLACK_HOLE.openDuration * 2) state.vortex = null
  else if (vortex.age >= BLACK_HOLE.maxDuration) closeVortex(state, events)
}

/** Closes the hole on whatever is still on its way in. Without this a hull
 *  caught late would be left spinning round a hole that is no longer there, and
 *  the round could never end. */
function closeVortex(state: GameState, events: GameEvents): void {
  state.vortex = null
  const survivors: Ufo[] = []
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'swirling') {
      survivors.push(ufo)
      continue
    }
    const points = ufoPoints(ufo)
    awardScore(state, points, events)
    events.onUfoDowned?.(ufo, points)
  }
  state.ufos = survivors
  if (state.boss !== null && state.boss.state.kind === 'swirling') downBoss(state, events)
}

/** One step of a fall into the black hole. True once it has reached the middle. */
function spiral(swirl: Extract<UfoState, { kind: 'swirling' }>, dt: number): boolean {
  swirl.radius -= (BLACK_HOLE.pull + swirl.radius * BLACK_HOLE.pullPerPixel) * dt
  swirl.angle += (BLACK_HOLE.baseSpin + BLACK_HOLE.spinNear / (swirl.radius + 30)) * dt
  return swirl.radius <= BLACK_HOLE.swallowRadius
}

function withinReach(cx: number, cy: number, reach: number, x: number, y: number): boolean {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= reach * reach
}

/**
 * The cow's burp. Every bubble leaves the cow's mouth at once, each aimed at a
 * random point across the top of the screen at its own speed, so the cloud
 * fans out and sweeps the whole sky rather than climbing as one blob.
 */
function burp(state: GameState): void {
  const mouthX = COW.x + COW.width * 0.88
  // The cow stands on the same ground as the hen and faces right, into the
  // field, muzzle low.
  const mouthY = HEN_TOP + HEN.height - COW.height * 0.42
  for (let i = 0; i < BURP.bubbles; i++) {
    const targetX = Math.random() * VIEW.width
    const targetY = -60 + Math.random() * 240
    const dx = targetX - mouthX
    const dy = targetY - mouthY
    const length = Math.hypot(dx, dy) || 1
    const speed = BURP.minSpeed + Math.random() * (BURP.maxSpeed - BURP.minSpeed)
    state.bubbles.push({
      x: mouthX,
      y: mouthY,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      radius: BURP.minRadius + Math.random() * (BURP.maxRadius - BURP.minRadius),
      phase: Math.random() * Math.PI * 2,
      age: 0,
    })
  }
  state.burpLine = BURP.lineDuration
}

/** Where a bubble actually is, wobble included. The renderer draws it at the
 *  same spot, so what it looks like it touches is what it touches. */
export function bubbleCentre(bubble: Bubble): { x: number; y: number } {
  return { x: bubble.x + Math.sin(bubble.age * 5 + bubble.phase) * BURP.wobble, y: bubble.y }
}

/**
 * Bubbles drifting across the board. One touching a saucer pops, and takes the
 * saucer with it — scored, whatever state it was in, except a deserter, which
 * is already out of the war. The mothership loses a hit point per bubble.
 */
function tickBubbles(state: GameState, dt: number, events: GameEvents): void {
  if (state.bubbles.length === 0) return
  const drifting: Bubble[] = []
  for (const bubble of state.bubbles) {
    bubble.age += dt
    bubble.x += bubble.vx * dt
    bubble.y += bubble.vy * dt
    const { x, y } = bubbleCentre(bubble)

    // Deserters are out of the war, and anything falling into a black hole is
    // already on its way out of it.
    const victim = state.ufos.find(
      (ufo) =>
        !(ufo.state.kind === 'leaving' && ufo.state.reason === 'deserted') &&
        ufo.state.kind !== 'swirling' &&
        circleTouchesRect(x, y, bubble.radius, ufoRect(ufo)),
    )
    if (victim !== undefined) {
      state.ufos = state.ufos.filter((ufo) => ufo !== victim)
      pop(state, events, victim.x + UFO.width / 2, victim.y + UFO.height / 2)
      const points = ufoPoints(victim)
      awardScore(state, points, events)
      events.onUfoDowned?.(victim, points)
      continue
    }

    const boss = state.boss
    if (boss !== null && boss.state.kind === 'flying') {
      const hull: Rect = { x: boss.x, y: boss.y, width: BOSS.width, height: BOSS.height }
      if (circleTouchesRect(x, y, bubble.radius, hull)) {
        damageBoss(state, 1, events)
        continue
      }
    }

    const r = bubble.radius + BURP.wobble
    if (x + r < 0 || x - r > VIEW.width || y + r < 0 || y - r > VIEW.height) continue
    drifting.push(bubble)
  }
  state.bubbles = drifting
}

/**
 * Gravity waves. Each ring expands from where it was fired, and the first time
 * it washes over a saucer that saucer loses attitude control for good. The
 * mothership has no attitude to lose, so a wave simply costs it a hit point
 * instead — once per wave, on the frame the front arrives.
 */
function tickWaves(state: GameState, dt: number, events: GameEvents): void {
  const alive = []
  for (const wave of state.waves) {
    wave.radius += GRAVITY.growth * dt

    for (const ufo of state.ufos) {
      if (ufo.state.kind !== 'flying') continue
      if (!withinReach(wave.x, wave.y, wave.radius, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)) continue
      ufo.state = {
        kind: 'wobbling',
        drift: ufo.x + UFO.width / 2 < VIEW.width / 2 ? -1 : 1,
        vx: 0,
        vy: 0,
        turn: 0,
      }
    }

    const boss = state.boss
    if (!wave.hitBoss && boss !== null && boss.state.kind === 'flying') {
      const rect: Rect = { x: boss.x, y: boss.y, width: BOSS.width, height: BOSS.height }
      if (circleTouchesRect(wave.x, wave.y, wave.radius, rect)) {
        wave.hitBoss = true
        damageBoss(state, GRAVITY.bossDamage, events)
      }
    }

    if (wave.radius < GRAVITY.maxRadius) alive.push(wave)
  }
  state.waves = alive
}

/**
 * Tumbling saucers. They stagger about on a random heading that is re-rolled a
 * few times a second, with a fixed sideways bias so the walk actually
 * terminates, and they detonate against anything they blunder into — the thing
 * they hit and themselves both.
 */
function tickWobble(state: GameState, dt: number, events: GameEvents): void {
  for (const ufo of state.ufos) {
    const wobble = ufo.state
    if (wobble.kind !== 'wobbling') continue
    wobble.turn -= dt
    if (wobble.turn <= 0) {
      wobble.vx = wobble.drift * (0.55 + Math.random() * 0.9) * GRAVITY.wobbleSpeed
      wobble.vy = (Math.random() * 2 - 1) * GRAVITY.wobbleSpeed
      wobble.turn = GRAVITY.turnInterval
    }
    ufo.x += wobble.vx * dt
    ufo.y += wobble.vy * dt
  }

  const doomed = new Set<Ufo>()
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'wobbling' || doomed.has(ufo)) continue
    for (const other of state.ufos) {
      if (other === ufo || doomed.has(other)) continue
      if (!overlaps(ufoRect(ufo), ufoRect(other))) continue
      doomed.add(ufo)
      doomed.add(other)
      break
    }
  }

  const survivors: Ufo[] = []
  for (const ufo of state.ufos) {
    const offBoard =
      ufo.state.kind === 'wobbling' &&
      (ufo.x + UFO.width < 0 || ufo.x > VIEW.width || ufo.y + UFO.height < 0 || ufo.y > VIEW.height)
    if (!doomed.has(ufo) && !offBoard) {
      survivors.push(ufo)
      continue
    }
    if (doomed.has(ufo)) pop(state, events, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
    const points = ufoPoints(ufo)
    awardScore(state, points, events)
    events.onUfoDowned?.(ufo, points)
  }
  state.ufos = survivors
}

function pop(state: GameState, events: GameEvents, x: number, y: number): void {
  state.blasts.push({ x, y, age: 0, radius: POWER.popRadius, duration: POWER.popDuration })
  events.onExplosion?.('small')
}

// --- desertions ------------------------------------------------------------

/** One countdown per saucer that will not go through with it, spread across the
 *  round rather than fired all at once. */
function rollDesertions(formationSize: number): number[] {
  const count = Math.round(formationSize * DESERT.fraction)
  const timers: number[] = []
  for (let i = 0; i < count; i++) {
    timers.push(DESERT.minDelay + Math.random() * (DESERT.maxDelay - DESERT.minDelay))
  }
  return timers
}

function tickDesertions(state: GameState, dt: number, events: GameEvents): void {
  if (state.desertions.length === 0) return
  const pending: number[] = []
  for (const timer of state.desertions) {
    const left = timer - dt
    if (left > 0) {
      pending.push(left)
      continue
    }
    const willing = state.ufos.filter((ufo) => ufo.state.kind === 'flying')
    const chosen = willing[Math.floor(Math.random() * willing.length)]
    // Nobody left to lose their nerve: the desertion is simply dropped.
    if (chosen === undefined) continue
    desert(state, chosen, events)
  }
  state.desertions = pending
}

/** A saucer giving up the war. Every other one leaves a shield behind for the
 *  hen, dropped from where it was. */
function desert(state: GameState, ufo: Ufo, events: GameEvents): void {
  ufo.state = leaveFrom(ufo.x, UFO.width, 'deserted')
  events.onUfoDeserted?.(ufo)
  if (Math.random() >= SHIELD.dropChance) return
  state.shieldDrops.push({
    x: ufo.x + UFO.width / 2 - SHIELD.width / 2,
    y: ufo.y + UFO.height,
    landed: false,
    remaining: SHIELD.groundTime,
  })
}

/** Dropped shields fall to the ground and lie there a few seconds. */
function tickShieldDrops(state: GameState, dt: number): void {
  if (state.shieldDrops.length === 0) return
  const ground = HEN_TOP + HEN.height
  const lying = []
  for (const drop of state.shieldDrops) {
    if (!drop.landed) {
      drop.y += SHIELD.fallSpeed * dt
      if (drop.y + SHIELD.height >= ground) {
        drop.y = ground - SHIELD.height
        drop.landed = true
      }
    } else {
      drop.remaining -= dt
      if (drop.remaining <= 0) continue
    }
    lying.push(drop)
  }
  state.shieldDrops = lying
}

/** The hen picks up any shield she touches, falling or lying. A fresh one tops
 *  hers back up to full. */
function collectShields(state: GameState, events: GameEvents): void {
  if (state.shieldDrops.length === 0) return
  const henRect: Rect = { x: state.hen.x, y: HEN_TOP, width: HEN.width, height: HEN.height }
  const left = []
  for (const drop of state.shieldDrops) {
    if (overlaps(henRect, { x: drop.x, y: drop.y, width: SHIELD.width, height: SHIELD.height })) {
      state.shield = { hits: SHIELD.hits }
      events.onShieldGained?.()
      continue
    }
    left.push(drop)
  }
  state.shieldDrops = left
}

/** The shield taking `hits` hits, and going when it has none left. */
function hitShield(state: GameState, hits: number, events: GameEvents): void {
  if (state.shield === null) return
  state.shield.hits = Math.max(0, state.shield.hits - hits)
  events.onShieldHit?.(state.shield.hits)
  if (state.shield.hits === 0) state.shield = null
}

/** Switches the black hole kept in hand on or off. */
export function toggleCheat(state: GameState): void {
  state.cheat = !state.cheat
  if (!state.cheat && state.power.kind === 'blackHole') state.power = { kind: 'none' }
}

// --- the formation ---------------------------------------------------------

/**
 * The formation moves in discrete steps rather than continuously, which is what
 * gives Space Invaders its march. Each step tries to move sideways; if that
 * would push the block past a wall it drops and reverses instead.
 *
 * Only `flying` saucers are part of any of this. Anything leaving or tumbling is
 * steering itself, so letting one widen the block's bounds on its way out would
 * bounce the formation off a wall that is not there.
 */
function marchFormation(state: GameState, dt: number): void {
  state.marchTimer -= dt
  if (state.marchTimer > 0) return
  state.marchTimer += stepInterval(state)

  const marching = state.ufos.filter((ufo) => ufo.state.kind === 'flying')
  if (marching.length === 0) return

  let leftmost = Infinity
  let rightmost = -Infinity
  for (const ufo of marching) {
    leftmost = Math.min(leftmost, ufo.x)
    rightmost = Math.max(rightmost, ufo.x + UFO.width)
  }

  const dx = UFO.marchStep * state.marchDirection
  const wouldLeaveView = leftmost + dx < 0 || rightmost + dx > VIEW.width
  if (wouldLeaveView) {
    state.marchDirection = state.marchDirection === 1 ? -1 : 1
    for (const ufo of marching) ufo.y += UFO.descendStep
    // Dropping can be what carries the front rank onto the hen, so re-check
    // here rather than waiting for the next frame.
    for (const ufo of marching) {
      if (ufo.y + UFO.height >= HEN_TOP) {
        endGame(state)
        return
      }
    }
    return
  }

  for (const ufo of marching) ufo.x += dx
}

/**
 * Saucers on their way off the board. They hang in place for a moment — reeling
 * if they were egged, making their point if they are deserting — then
 * accelerate towards the nearer wall. An egged one sinks as it goes and scores
 * when it is gone; a deserter leaves level and scores nothing, because talking
 * somebody out of a fight is not the same as winning it.
 */
function tickLeaving(state: GameState, dt: number, events: GameEvents): void {
  const survivors: Ufo[] = []
  for (const ufo of state.ufos) {
    const exit = ufo.state
    if (exit.kind !== 'leaving') {
      survivors.push(ufo)
      continue
    }

    if (exit.reeling > 0) {
      exit.reeling -= dt
      survivors.push(ufo)
      continue
    }

    exit.speed = Math.min(SPLAT.fleeMaxSpeed, exit.speed + SPLAT.fleeAcceleration * dt)
    ufo.x += exit.direction * exit.speed * dt
    if (exit.reason === 'splattered') ufo.y += SPLAT.sinkSpeed * dt

    if (ufo.x + UFO.width >= 0 && ufo.x <= VIEW.width) {
      survivors.push(ufo)
      continue
    }
    if (exit.reason !== 'splattered') continue

    const points = ufoPoints(ufo)
    awardScore(state, points, events)
    events.onUfoDowned?.(ufo, points)
  }
  state.ufos = survivors
}

/** Only the front saucer of a column can fire, so lasers always come from the
 *  rank the player can actually see and shoot back at. Rank-and-file saucers
 *  fire straight down; angling a shot is the mothership's trick alone. */
function fireLasers(state: GameState, dt: number, events: GameEvents): void {
  const limit = ROUND.baseMaxLasers + Math.floor((state.round - 1) / 2)
  state.fireTimer -= dt
  if (state.fireTimer > 0) return
  state.fireTimer += fireInterval(state.round)
  if (state.lasers.length >= limit) return

  const shooters = frontLineUfos(state)
  if (shooters.length === 0) return
  const shooter = shooters[Math.floor(Math.random() * shooters.length)]
  if (shooter === undefined) return

  state.lasers.push(shoot(shooter.x + UFO.width / 2, shooter.y + UFO.height, 0, state.round, rollLaserPower(state.round)))
  events.onLaserFired?.()
}

/** How wide a fleet laser comes out. Later rounds put out some double and
 *  triple ones, each taking that many eggs to shoot down. */
function rollLaserPower(round: number): 1 | 2 | 3 {
  const triple = Math.min(LASER.tripleMax, Math.max(0, (round - LASER.tripleFrom + 1) * LASER.triplePerRound))
  const double = Math.min(LASER.doubleMax, Math.max(0, (round - LASER.doubleFrom + 1) * LASER.doublePerRound))
  const roll = Math.random()
  if (roll < triple) return 3
  if (roll < triple + double) return 2
  return 1
}

/** A laser's width: an ordinary one's, times its power. Exported for the
 *  renderer, which must draw it the width it hits. */
export function laserWidth(laser: LaserShot): number {
  return LASER.width * (laser.power ?? 1)
}

function laserRect(laser: LaserShot): Rect {
  return { x: laser.x, y: laser.y, width: laserWidth(laser), height: LASER.height }
}

/** Now and then a front-rank saucer drops a radioactive fox instead of firing,
 *  more often as the rounds go on, and never more than a few in one round. */
function tickFoxTimer(state: GameState, dt: number, events: GameEvents): void {
  if (state.foxTimer === null) return
  state.foxTimer -= dt
  if (state.foxTimer > 0) return

  const throwers = frontLineUfos(state)
  const thrower = throwers[Math.floor(Math.random() * throwers.length)]
  if (thrower !== undefined) {
    state.foxes.push({
      x: thrower.x + UFO.width / 2 - FOX.width / 2,
      y: thrower.y + UFO.height,
      vx: 0,
      rotation: 0,
      landed: false,
      wait: 0,
      chaser: foxWait(state.round) > FOX.chaseAfterWait,
      chase: 0,
    })
    state.foxesThrown += 1
    events.onFoxThrown?.()
  }
  state.foxTimer = state.foxesThrown >= FOX.maxPerRound ? null : rollFox(state.round)
}

/** Where a round sits on a ramp that starts at round 1 and is complete by
 *  round `rounds`: 0 at the start, 1 from then on. */
function ramp(round: number, rounds: number): number {
  return Math.min(1, Math.max(0, (round - 1) / Math.max(1, rounds - 1)))
}

function rollFox(round: number): number {
  const base = FOX.firstInterval + (FOX.lastInterval - FOX.firstInterval) * ramp(round, FOX.rampRounds)
  return base * (1 + (Math.random() * 2 - 1) * FOX.jitter)
}

/** Seconds a fox sits on the ground after landing: short early on, longer as
 *  the rounds go up. Exported for the tests. */
export function foxWait(round: number): number {
  return FOX.minWait + (FOX.maxWait - FOX.minWait) * ramp(round, FOX.waitRampRounds)
}

/**
 * Foxes tumble down to the ground and land on their feet. Each then sits where
 * it landed for a while — still deadly to touch — and runs off the side away
 * from the hen. A long sitter chases her instead when it gets up, but slower
 * than she can run and only for a few seconds before it too runs off: one that
 * kept coming would be a certain loss, since she cannot get past it. Nothing
 * stops them on the way.
 */
function advanceFoxes(state: GameState, dt: number): void {
  if (state.foxes.length === 0) return
  const ground = HEN_TOP + HEN.height
  const running = []
  for (const fox of state.foxes) {
    if (!fox.landed) {
      fox.y += FOX.fallSpeed * dt
      fox.rotation += FOX.spin * dt
      if (fox.y + FOX.height >= ground) {
        fox.y = ground - FOX.height
        fox.rotation = 0
        fox.landed = true
        fox.wait = foxWait(state.round)
      }
    } else if (fox.chase > 0) {
      const toHen = state.hen.x + HEN.width / 2 - (fox.x + FOX.width / 2)
      fox.vx = Math.sign(toHen) * FOX.chaseSpeed
      // Never past her: it closes on where she is, not beyond.
      if (Math.abs(toHen) < Math.abs(fox.vx * dt)) fox.vx = toHen / dt
      fox.chase -= dt
      if (fox.chase <= 0) {
        fox.chase = 0
        fox.vx = awayFromHen(state, fox) * FOX.runSpeed
      }
    } else if (fox.vx === 0) {
      fox.wait -= dt
      if (fox.wait <= 0) {
        if (fox.chaser) fox.chase = FOX.chaseDuration
        else fox.vx = awayFromHen(state, fox) * FOX.runSpeed
      }
    }
    fox.x += fox.vx * dt
    if (fox.x + FOX.width > 0 && fox.x < VIEW.width) running.push(fox)
  }
  state.foxes = running
}

function awayFromHen(state: GameState, fox: GameState['foxes'][number]): -1 | 1 {
  return fox.x + FOX.width / 2 < state.hen.x + HEN.width / 2 ? -1 : 1
}

/** The lowest still-flying saucer in each occupied column. Anything leaving or
 *  tumbling is excluded: a pilot who cannot see out cannot aim. */
function frontLineUfos(state: GameState): Ufo[] {
  const lowestByColumn = new Map<number, Ufo>()
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'flying') continue
    const current = lowestByColumn.get(ufo.column)
    if (current === undefined || ufo.y > current.y) lowestByColumn.set(ufo.column, ufo)
  }
  return [...lowestByColumn.values()]
}

function shoot(x: number, y: number, angle: number, round: number, power: 1 | 2 | 3 = 1): LaserShot {
  const speed = LASER.baseSpeed + (round - 1) * LASER.speedPerRound
  return {
    x: x - (LASER.width * power) / 2,
    y,
    vx: Math.sin(angle) * speed,
    vy: Math.cos(angle) * speed,
    ...(power === 1 ? {} : { power }),
  }
}

// --- the mothership --------------------------------------------------------

function buildBoss(round: number): Boss {
  const hitPoints = bossHitPoints(round)
  const splats: Splat[] = []
  for (let i = 0; i < hitPoints; i++) {
    // Scattered across the canopy, which is the upper middle of the hull.
    splats.push({
      x: BOSS.width * (0.22 + Math.random() * 0.56),
      y: BOSS.height * (0.14 + Math.random() * 0.34),
      scale: 0.75 + Math.random() * 0.5,
      rotation: Math.random() * Math.PI * 2,
    })
  }
  return {
    x: VIEW.width / 2 - BOSS.width / 2,
    y: BOSS.startY,
    hitPoints,
    maxHitPoints: hitPoints,
    direction: Math.random() < 0.5 ? -1 : 1,
    state: { kind: 'flying' },
    splats,
    wipeTimer: rollWipe(),
    wiping: 0,
  }
}

function rollWipe(): number {
  return WIPER.minInterval + Math.random() * (WIPER.maxInterval - WIPER.minInterval)
}

/**
 * The mothership's wiper. Every so often it clears about a fifth of the eggs on
 * its canopy, picked at random, and each one it clears is a hit point back. It
 * needs a few eggs up there before a fifth comes to one, so a mothership that
 * has barely been touched never bothers.
 */
function tickWiper(boss: Boss, dt: number, events: GameEvents): void {
  if (boss.wiping > 0) boss.wiping = Math.max(0, boss.wiping - dt)
  boss.wipeTimer -= dt
  if (boss.wipeTimer > 0) return
  boss.wipeTimer = rollWipe()

  const showing = Math.min(boss.splats.length, Math.floor(boss.maxHitPoints - boss.hitPoints))
  const wiped = Math.round(showing * WIPER.fraction)
  if (wiped === 0) return

  // The showing marks are the front of the list. Moving the wiped ones to just
  // behind it hides them, and they are the next to come back.
  for (let i = 0; i < wiped; i++) {
    const last = showing - 1 - i
    const pick = Math.floor(Math.random() * (last + 1))
    const a = boss.splats[pick]
    const b = boss.splats[last]
    if (a === undefined || b === undefined) continue
    boss.splats[pick] = b
    boss.splats[last] = a
  }
  boss.hitPoints = Math.min(boss.maxHitPoints, boss.hitPoints + wiped)
  boss.wiping = WIPER.duration
  events.onBossWipe?.()
}

function tickBoss(state: GameState, dt: number, events: GameEvents): void {
  const boss = state.boss
  if (boss === null) return

  const exit = boss.state
  if (exit.kind === 'leaving') {
    if (exit.reeling > 0) {
      exit.reeling -= dt
      return
    }
    exit.speed = Math.min(SPLAT.fleeMaxSpeed, exit.speed + SPLAT.fleeAcceleration * dt)
    boss.x += exit.direction * exit.speed * dt
    boss.y += SPLAT.sinkSpeed * dt
    if (boss.x + BOSS.width < 0 || boss.x > VIEW.width) downBoss(state, events)
    return
  }
  if (exit.kind === 'wobbling' || exit.kind === 'swirling') return

  tickWiper(boss, dt, events)
  boss.x += boss.direction * BOSS.speed * dt
  if (boss.x <= 0) {
    boss.x = 0
    boss.direction = 1
  } else if (boss.x + BOSS.width >= VIEW.width) {
    boss.x = VIEW.width - BOSS.width
    boss.direction = -1
  }
  boss.y += BOSS.sinkSpeed * dt
}

/** One volley of as many lasers as the round number, fanned across the
 *  mothership's underside and jittered so no two volleys are the same. This is
 *  the only thing on the board that shoots anywhere but straight down. */
function fireVolley(state: GameState, dt: number, events: GameEvents): void {
  const boss = state.boss
  if (boss === null || boss.state.kind !== 'flying') return

  state.fireTimer -= dt
  if (state.fireTimer > 0) return
  state.fireTimer += bossFireInterval(state.round)

  // Two directions fewer than the round number and then halved, which is what
  // keeps a mothership from putting out a wall rather than a volley.
  const shots = Math.max(1, Math.floor((state.round - BOSS.volleyReduction) / BOSS.volleyDivisor))
  for (let i = 0; i < shots; i++) {
    const across = shots === 1 ? 0.5 : i / (shots - 1)
    const angle = (across - 0.5) * BOSS.volleySpread + (Math.random() - 0.5) * BOSS.volleyJitter
    const x = boss.x + BOSS.width * (0.2 + 0.6 * across)
    state.lasers.push(shoot(x, boss.y + BOSS.height * 0.82, angle, state.round, rollLaserPower(state.round)))
  }
  events.onLaserFired?.()
}

function bossFireInterval(round: number): number {
  const interval = BOSS.baseFireInterval - (round - 2) * BOSS.fireIntervalPerRound
  return Math.max(BOSS.minFireInterval, interval)
}

function damageBoss(state: GameState, amount: number, events: GameEvents): void {
  const boss = state.boss
  if (boss === null || boss.state.kind !== 'flying') return
  boss.hitPoints -= amount
  events.onBossHit?.(boss)
  if (boss.hitPoints > 0) return
  boss.hitPoints = 0
  boss.state = leaveFrom(boss.x, BOSS.width, 'splattered')
}

/** The mothership is off the board — flown off, swallowed or blown up. */
function downBoss(state: GameState, events: GameEvents): void {
  if (state.boss === null) return
  const points = BOSS.scorePerRound * state.round
  state.boss = null
  awardScore(state, points, events)
  events.onBossDowned?.(points)
}

// --- the Rambo egg and its upgrades ----------------------------------------

/** How many Rambo eggs a round brings: none or one up to round 19, one or two
 *  in the twenties, two or three in the thirties, and so on, with the higher
 *  count the likelier. Exported for the tests. */
export function pickupsFor(round: number): number {
  const band = Math.max(0, Math.floor(round / POWER.roundsPerBand) - 1)
  return band + (Math.random() < POWER.upperChance ? 1 : 0)
}

function between(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** A Rambo egg has gone, shot or not: the next one, if the round owes one, is
 *  on its way. They come one at a time. */
function pickupGone(state: GameState): void {
  state.pickup = null
  if (state.pickupsLeft <= 0) return
  state.pickupsLeft -= 1
  state.pickupTimer = between(POWER.nextMinDelay, POWER.nextMaxDelay)
}

function tickPickup(state: GameState, dt: number): void {
  if (state.pickup !== null) {
    state.pickup.remaining -= dt
    if (state.pickup.remaining <= 0) pickupGone(state)
    return
  }

  if (state.pickupTimer === null) return
  state.pickupTimer -= dt
  if (state.pickupTimer > 0) return

  state.pickupTimer = null
  const onLeft = Math.random() < 0.5
  state.pickup = {
    x: onLeft ? POWER.sideMargin : VIEW.width - POWER.sideMargin - POWER.width,
    y: POWER.top,
    remaining: POWER.linger,
  }
}

/** The nine upgrades are equally likely. Which one you get is the joke; being
 *  able to plan around it would spoil it. */
function rollPower(state: GameState): Power {
  switch (Math.floor(Math.random() * 9)) {
    case 0: {
      const spread = POWER.multishotMax - POWER.multishotMin
      return {
        kind: 'multishot',
        eggs: POWER.multishotMin + Math.floor(Math.random() * (spread + 1)),
        ...clock(POWER.multishotDuration),
      }
    }
    case 1:
      return { kind: 'superEgg', ...clock(POWER.holdDuration) }
    case 2:
      return { kind: 'beam', ...clock(POWER.beamDuration) }
    case 3:
      return wingmanPower(state)
    case 4:
      return { kind: 'heart', ...clock(POWER.holdDuration) }
    case 5:
      return { kind: 'gravity', ...clock(GRAVITY.duration) }
    case 6:
      return { kind: 'blackHole', ...clock(POWER.holdDuration) }
    case 7:
      return { kind: 'burp', ...clock(POWER.holdDuration) }
    default:
      return { kind: 'gramophone', ...clock(POWER.holdDuration) }
  }
}

function clock(duration: number): Timed {
  return { remaining: duration, duration }
}

/**
 * The beam burns continuously for its whole duration rather than waiting on the
 * fire key — it is a beam, not a gun. It passes straight through the toys: they
 * are scenery, and having the player's best cover evaporate under their own
 * upgrade reads as a bug however it is explained.
 */
function tickBeam(state: GameState, dt: number, events: GameEvents): void {
  if (state.power.kind !== 'beam') return

  const column: Rect = {
    x: state.hen.x + HEN.width / 2 - POWER.beamWidth / 2,
    y: 0,
    width: POWER.beamWidth,
    height: HEN_TOP,
  }

  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'flying') continue
    if (!overlaps(column, ufoRect(ufo))) continue
    ufo.state = leaveFrom(ufo.x, UFO.width, 'splattered')
    events.onUfoSplattered?.(ufo)
  }

  const boss = state.boss
  if (boss !== null && boss.state.kind === 'flying') {
    const rect: Rect = { x: boss.x, y: boss.y, width: BOSS.width, height: BOSS.height }
    // One second of contact per egg the mothership would otherwise have cost.
    if (overlaps(column, rect)) damageBoss(state, dt, events)
  }

  state.lasers = state.lasers.filter(
    (laser) => !overlaps(column, laserRect(laser)),
  )
}

// --- collisions ------------------------------------------------------------

function resolveCollisions(state: GameState, frozen: boolean, events: GameEvents): void {
  const survivingShots = []
  for (const shot of state.shots) {
    // Only an ordinary egg can be stopped. Everything the upgrades fire is on
    // its way somewhere and passes through whatever is in the way.
    if (shot.kind !== 'normal') {
      survivingShots.push(shot)
      continue
    }
    const eggRect: Rect = { x: shot.x, y: shot.y, width: EGG.width, height: EGG.height }
    if (meetsLaser(state, eggRect)) {
      events.onLaserShotDown?.()
      continue
    }
    if (!shot.wingman && hitsPickup(state, eggRect, events)) continue
    if (hitsObstacle(state, eggRect, { vx: shot.vx })) {
      events.onToyKicked?.()
      continue
    }
    if (hitsBoss(state, eggRect, events)) continue
    if (splattersUfo(state, eggRect, frozen, events)) continue
    survivingShots.push(shot)
  }
  state.shots = survivingShots

  // A laser with time stopped is a stationary object that cannot act. Walking
  // into one costing a life would make the freeze a hazard rather than a gift.
  if (frozen) return

  const henRect: Rect = { x: state.hen.x, y: HEN_TOP, width: HEN.width, height: HEN.height }
  const wing = state.power.kind === 'wingman' ? state.power : null
  const wingRect: Rect | null = wing === null ? null : { x: wing.x, y: HEN_TOP, width: HEN.width, height: HEN.height }
  const survivingLasers = []
  for (const laser of state.lasers) {
    const rect = laserRect(laser)
    if (hitsObstacle(state, rect, null)) continue
    // The wingman cannot die while the upgrade lasts; what reaches her is
    // simply absorbed.
    if (wingRect !== null && overlaps(rect, wingRect)) continue
    if (overlaps(rect, henRect)) {
      // The shield eats the shot, and a hit for every width of it; without it,
      // only the post-hit invulnerability saves her.
      if (state.shield !== null) {
        hitShield(state, laser.power ?? 1, events)
        continue
      }
      if (state.hen.invulnerable <= 0) {
        hurtHen(state, events)
        return
      }
    }
    survivingLasers.push(laser)
  }
  state.lasers = survivingLasers

  // A fox goes through toys and past the wingman, and eggs go through it. The
  // shield is the one thing that keeps it off her: it costs a hit, and gives
  // her a moment to get past before the fox can cost another.
  if (state.hen.invulnerable > 0) return
  for (const fox of state.foxes) {
    if (!overlaps(henRect, { x: fox.x, y: fox.y, width: FOX.width, height: FOX.height })) continue
    if (state.shield !== null) {
      hitShield(state, 1, events)
      state.hen.invulnerable = SHIELD.foxGrace
      return
    }
    hurtHen(state, events)
    return
  }
}

/** An egg that meets a laser in mid-air: the egg is spent, and an ordinary
 *  laser is gone with it. A wide one only loses a size, narrowing about its
 *  middle, so a double takes two eggs and a triple three. Checked whether or
 *  not time is stopped — a frozen laser can still be shot down, it just cannot
 *  hurt anybody. */
function meetsLaser(state: GameState, egg: Rect): boolean {
  const index = state.lasers.findIndex((laser) => overlaps(egg, laserRect(laser)))
  const laser = state.lasers[index]
  if (laser === undefined) return false
  const power = laser.power ?? 1
  if (power === 1) {
    state.lasers.splice(index, 1)
    return true
  }
  laser.x += LASER.width / 2
  if (power === 3) laser.power = 2
  else delete laser.power
  return true
}

/**
 * Returns true when the projectile was absorbed. Toys soak eggs and lasers
 * alike and are worn down by neither: nothing that is shot at a toy damages it.
 * What an egg does instead is move it — it arrives from below and punts the toy
 * up into the fleet. Laser fire deliberately does not, because a toy pushed
 * down is cover turning into a hazard the hen cannot dodge.
 *
 * Cover is therefore removed by launching it rather than by eroding it, and a
 * toy the hen has not launched also blocks her own eggs, so parking behind one
 * is not free.
 */
function hitsObstacle(state: GameState, projectile: Rect, kick: { vx: number } | null): boolean {
  for (const obstacle of state.obstacles) {
    const rect: Rect = { x: obstacle.x, y: obstacle.y, width: OBSTACLE.width, height: OBSTACLE.height }
    if (!overlaps(projectile, rect)) continue

    if (kick !== null) {
      if (obstacle.spin === 0) obstacle.spin = (Math.random() < 0.5 ? -1 : 1) * OBSTACLE.spin
      obstacle.vy = Math.max(-OBSTACLE.maxSpeed, obstacle.vy - OBSTACLE.kick)
      obstacle.vx = clamp(obstacle.vx + kick.vx * OBSTACLE.kickDrag, -OBSTACLE.maxSpeed, OBSTACLE.maxSpeed)
    }
    return true
  }
  return false
}

/**
 * Toys that have been knocked loose. They keep whatever speed they were kicked
 * with until they leave the view, and anything they plough into goes up.
 *
 * Each wreck costs the toy a hit point — the only thing that ever does. Without
 * it a single egg into a toy would sweep a column clean, and the toy would
 * still be going.
 */
function tickObstacles(state: GameState, dt: number, events: GameEvents): void {
  const standing = []
  for (const obstacle of state.obstacles) {
    if (obstacle.vx === 0 && obstacle.vy === 0) {
      standing.push(obstacle)
      continue
    }

    obstacle.x += obstacle.vx * dt
    obstacle.y += obstacle.vy * dt
    obstacle.rotation += obstacle.spin * dt

    const rect: Rect = { x: obstacle.x, y: obstacle.y, width: OBSTACLE.width, height: OBSTACLE.height }
    const survivors: Ufo[] = []
    for (const ufo of state.ufos) {
      if (obstacle.health > 0 && overlaps(rect, ufoRect(ufo))) {
        pop(state, events, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
        const points = ufoPoints(ufo)
        awardScore(state, points, events)
        events.onUfoDowned?.(ufo, points)
        obstacle.health -= 1
        continue
      }
      survivors.push(ufo)
    }
    state.ufos = survivors

    // The mothership is too big to be knocked out by a teddy bear, so a toy
    // costs it a hit point and breaks up against the hull, as a gravity wave
    // does.
    const boss = state.boss
    if (boss !== null && boss.state.kind === 'flying') {
      const hull: Rect = { x: boss.x, y: boss.y, width: BOSS.width, height: BOSS.height }
      if (overlaps(rect, hull)) {
        damageBoss(state, 1, events)
        obstacle.health = 0
      }
    }

    const offBoard =
      obstacle.y + OBSTACLE.height < 0 ||
      obstacle.y > VIEW.height ||
      obstacle.x + OBSTACLE.width < 0 ||
      obstacle.x > VIEW.width
    if (obstacle.health <= 0 || offBoard) {
      if (!offBoard) pop(state, events, obstacle.x + OBSTACLE.width / 2, obstacle.y + OBSTACLE.height / 2)
      continue
    }
    standing.push(obstacle)
  }
  state.obstacles = standing
}

function hitsPickup(state: GameState, egg: Rect, events: GameEvents): boolean {
  const pickup = state.pickup
  if (pickup === null) return false
  const rect: Rect = { x: pickup.x, y: pickup.y, width: POWER.width, height: POWER.height }
  if (!overlaps(egg, rect)) return false
  pickupGone(state)
  state.power = rollPower(state)
  events.onPowerGained?.(state.power)
  return true
}

function hitsBoss(state: GameState, egg: Rect, events: GameEvents): boolean {
  const boss = state.boss
  if (boss === null) return false
  const rect: Rect = { x: boss.x, y: boss.y, width: BOSS.width, height: BOSS.height }
  if (!overlaps(egg, rect)) return false
  // A mothership already limping away soaks eggs to no effect, exactly as a
  // splattered saucer does.
  if (boss.state.kind === 'flying') damageBoss(state, 1, events)
  return true
}

/**
 * Returns true when the egg burst on a hull. An egg that reaches a saucer which
 * is already leaving is wasted: the windscreen is as dirty as it is going to
 * get, and the player has spent one of three in flight on a saucer that was
 * already going. That is the whole cost the retreat imposes, so it is
 * deliberate.
 *
 * With time stopped there is no retreat to wait for: a saucer that takes an egg
 * simply goes up, and scores at once.
 */
function splattersUfo(state: GameState, egg: Rect, frozen: boolean, events: GameEvents): boolean {
  const survivors: Ufo[] = []
  let hit = false

  for (const ufo of state.ufos) {
    // A saucer falling into the black hole is past being egged.
    if (hit || ufo.state.kind === 'swirling' || !overlaps(egg, ufoRect(ufo))) {
      survivors.push(ufo)
      continue
    }
    hit = true

    if (frozen) {
      pop(state, events, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
      const points = ufoPoints(ufo)
      awardScore(state, points, events)
      events.onUfoDowned?.(ufo, points)
      continue
    }

    if (ufo.state.kind === 'flying') {
      ufo.state = leaveFrom(ufo.x, UFO.width, 'splattered')
      events.onUfoSplattered?.(ufo)
    }
    survivors.push(ufo)
  }

  if (hit) state.ufos = survivors
  return hit
}

/** A hull's way off the board: run for whichever wall it is already nearer,
 *  because that is the shortest way out of the fight. */
function leaveFrom(x: number, width: number, reason: 'splattered' | 'deserted'): Extract<UfoState, { kind: 'leaving' }> {
  return {
    kind: 'leaving',
    reason,
    direction: x + width / 2 < VIEW.width / 2 ? -1 : 1,
    reeling: reason === 'splattered' ? SPLAT.reelDuration : DESERT.bubbleDuration,
    speed: SPLAT.fleeSpeed,
  }
}

function hurtHen(state: GameState, events: GameEvents): void {
  state.hen.lives -= 1
  state.hen.invulnerable = HEN.hurtInvulnerability
  // Clear the air so she does not respawn into a laser or a fox she cannot
  // dodge.
  state.lasers = []
  state.foxes = []
  loseFeathers(state)
  events.onHenHurt?.()
  if (state.hen.lives <= 0) endGame(state)
}

/** A handful of feathers knocked off in every direction, mostly upwards. */
function loseFeathers(state: GameState): void {
  const x = state.hen.x + HEN.width / 2
  const y = HEN_TOP + HEN.height * 0.45
  for (let i = 0; i < FEATHERS.count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3
    const speed = FEATHERS.burst * (0.5 + Math.random() * 0.7)
    state.feathers.push({
      x: x + (Math.random() - 0.5) * HEN.width * 0.5,
      y: y + (Math.random() - 0.5) * HEN.height * 0.3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 5,
      age: 0,
      phase: Math.random() * Math.PI * 2,
    })
  }
}

/** The last hen has fallen. The run is not over until the mothership has been
 *  down for the cow, so this starts the scene rather than ending the game — the
 *  game-over event fires when the scene finishes. */
function endGame(state: GameState): void {
  if (state.phase.kind === 'over' || state.phase.kind === 'abduction') return
  state.phase = { kind: 'abduction', age: 0 }
}

function buildFormation(round: number): Ufo[] {
  const rows = Math.min(UFO.maxRows, UFO.baseRows + Math.floor((round - 1) / 2))
  const formationWidth = UFO.columns * UFO.cellWidth
  const left = (VIEW.width - formationWidth) / 2 + (UFO.cellWidth - UFO.width) / 2
  const top = Math.min(UFO.maxStartY, UFO.startY + (round - 1) * UFO.startYPerRound)

  // Row 0 is the front rank (nearest the hen) so it can index rowScores directly.
  const ufos: Ufo[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < UFO.columns; column++) {
      ufos.push({
        column,
        row,
        x: left + column * UFO.cellWidth,
        y: top + (rows - 1 - row) * UFO.cellHeight,
        state: { kind: 'flying' },
        wobblePhase: Math.random() * Math.PI * 2,
      })
    }
  }
  return ufos
}

function ufoPoints(ufo: Ufo): number {
  return UFO.rowScores[ufo.row] ?? UFO.rowScores[UFO.rowScores.length - 1] ?? 10
}

function ufoRect(ufo: Ufo): Rect {
  return { x: ufo.x, y: ufo.y, width: UFO.width, height: UFO.height }
}

/** Seconds between march steps. The formation accelerates as its ranks thin and
 *  starts each round a little faster than the last. Saucers that are leaving or
 *  tumbling have already left the formation, so they no longer slow it down. */
function stepInterval(state: GameState): number {
  const remaining = state.ufos.reduce((count, ufo) => count + (ufo.state.kind === 'flying' ? 1 : 0), 0)
  const total = Math.max(1, state.roundUfoCount)
  const thinning = remaining <= 1 ? 0 : (remaining - 1) / Math.max(1, total - 1)
  const base = UFO.fastestStepInterval + (UFO.slowestStepInterval - UFO.fastestStepInterval) * thinning
  const roundScale = Math.max(0.6, 1 - (state.round - 1) * 0.04)
  return base * roundScale
}

function fireInterval(round: number): number {
  const interval = ROUND.baseFireInterval - (round - 1) * ROUND.fireIntervalPerRound
  return Math.max(ROUND.minFireInterval, interval)
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** True when a circle touches a rectangle, by way of the nearest point on the
 *  rectangle to the circle's centre. */
function circleTouchesRect(cx: number, cy: number, radius: number, rect: Rect): boolean {
  const nearestX = clamp(cx, rect.x, rect.x + rect.width)
  const nearestY = clamp(cy, rect.y, rect.y + rect.height)
  const dx = cx - nearestX
  const dy = cy - nearestY
  return dx * dx + dy * dy <= radius * radius
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
