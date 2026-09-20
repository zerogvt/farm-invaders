import {
  ABDUCTION,
  BLACK_HOLE,
  BOSS,
  DESERT,
  EGG,
  FREEZE,
  GRAMOPHONE,
  GRAVITY,
  HEART,
  HEN,
  LASER,
  OBSTACLE,
  PARLEY,
  POWER,
  ROUND,
  SPLAT,
  TAUNT,
  UFO,
  VIEW,
} from './config'
import type { InputState } from './input'
import { placeObstacles } from './obstacles'
import type { Boss, GameState, Laser as LaserShot, Power, Rect, Shot, Splat, Timed, Ufo, UfoState } from './types'

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
    case 'blackHole':
      return { width: BLACK_HOLE.radius * 2, height: BLACK_HOLE.radius * 2 }
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
    case 'blackHole':
      return BLACK_HOLE.speed
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
  onExtraLife?: (lives: number) => void
  onHenHurt?: () => void
  onRoundCleared?: (round: number) => void
  onGameOver?: (score: number, round: number) => void
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
    lasers: [],
    obstacles: [],
    power: { kind: 'none' },
    pickup: null,
    pickupTimer: null,
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
  state.lasers = []
  state.blasts = []
  state.pickup = null
  state.pickupTimer = rollPickup()
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
      ? { kind: 'parley', line: 0, remaining: PARLEY.demandDuration }
      : { kind: 'intro', remaining: boss ? ROUND.bossIntroDuration : ROUND.introDuration }
}

export function restart(state: GameState): void {
  state.score = 0
  state.hen.lives = HEN.lives
  state.hen.x = VIEW.width / 2 - HEN.width / 2
  state.power = { kind: 'none' }
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
        parley.line === 0
          ? { kind: 'parley', line: 1, remaining: PARLEY.refusalDuration }
          : { kind: 'playing' }
      return
    }

    case 'abduction':
      // The board is held exactly as it was; only the scene advances. The
      // game-over panel waits for it, which is why onGameOver fires here rather
      // than when the last hen fell.
      state.phase.age += dt
      if (state.phase.age >= ABDUCTION.duration) {
        state.phase = { kind: 'over', scoreSubmitted: false }
        events.onGameOver?.(state.score, state.round)
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
      advanceLasers(state, dt)
      tickTimers(state, dt)
      if (state.phase.remaining <= 0) startRound(state, state.round + 1)
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
  tryShoot(state, input)
  advanceShots(state, dt, events)
  tickWaves(state, dt, events)
  tickBeam(state, dt, events)

  if (!frozen) {
    advanceLasers(state, dt)
    marchFormation(state, dt)
    tickLeaving(state, dt, events)
    tickWobble(state, dt, events)
    tickObstacles(state, dt, events)
    tickDesertions(state, dt, events)
    tickBoss(state, dt, events)
    if (state.boss === null) fireLasers(state, dt)
    else fireVolley(state, dt)
    tickPickup(state, dt)
    tickEinstein(state, dt)
  }

  resolveCollisions(state, frozen, events)

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

  const blasts = []
  for (const blast of state.blasts) {
    blast.age += dt
    if (blast.age < blast.duration) blasts.push(blast)
  }
  state.blasts = blasts
}

/** About one round in three gets a visit; the rest get none. */
function rollFreeze(): number | null {
  if (Math.random() >= FREEZE.chance) return null
  return FREEZE.minDelay + Math.random() * (FREEZE.maxDelay - FREEZE.minDelay)
}

/** Einstein turning up. He picks a side and stops the board; he is not shot at
 *  and cannot be missed, so there is nothing for the player to do but use it. */
function tickEinstein(state: GameState, dt: number): void {
  if (state.freezeTimer === null) return
  state.freezeTimer -= dt
  if (state.freezeTimer > 0) return

  state.freezeTimer = null
  const onLeft = Math.random() < 0.5
  state.freeze = {
    x: onLeft ? FREEZE.sideMargin : VIEW.width - FREEZE.sideMargin - FREEZE.width,
    remaining: FREEZE.duration,
  }
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

function tryShoot(state: GameState, input: InputState): void {
  if (!input.fire) return
  if (state.shotCooldown > 0) return

  const power = state.power
  const muzzleX = state.hen.x + HEN.width / 2

  // Gravity is the one upgrade that does not put anything in the air: each
  // trigger pull sends a ring out from wherever the hen is standing.
  if (power.kind === 'gravity') {
    state.waves.push({ x: muzzleX, y: HEN_TOP, radius: 0, hitBoss: false })
    state.shotCooldown = GRAVITY.cooldown
    return
  }

  // The black hole keeps firing for as long as it is held; the rest of the
  // heavy ordnance is one shot and gone.
  if (power.kind === 'blackHole') {
    state.shots.push(heavyShot('blackHole', muzzleX))
    state.shotCooldown = BLACK_HOLE.cooldown
    return
  }

  if (power.kind === 'superEgg' || power.kind === 'heart' || power.kind === 'gramophone') {
    state.shots.push(heavyShot(power.kind === 'superEgg' ? 'super' : power.kind, muzzleX))
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
    return
  }

  if (state.shots.length >= EGG.maxInFlight) return
  state.shots.push(egg(muzzleX))
  state.shotCooldown = EGG.cooldown
}

function heavyShot(kind: Exclude<Shot['kind'], 'normal'>, muzzleX: number): Shot {
  const { width, height } = shotSize(kind)
  return {
    x: muzzleX - width / 2,
    y: HEN_TOP - height,
    spin: kind === 'blackHole' ? 4.5 : kind === 'gramophone' ? 0 : 1.4,
    rotation: 0,
    vx: 0,
    kind,
    fuse: GRAMOPHONE.fuse,
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
      burst(state, shot.x + width / 2, shot.y + height / 2)
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
    if (shot.kind === 'blackHole') swallow(state, shot, events)

    if (shot.y + height > 0 && shot.x + width > 0 && shot.x < VIEW.width) flying.push(shot)
  }
  state.shots = flying
}

function advanceLasers(state: GameState, dt: number): void {
  const flying = []
  for (const laser of state.lasers) {
    laser.x += laser.vx * dt
    laser.y += laser.vy * dt
    if (laser.y < VIEW.height && laser.x + LASER.width > 0 && laser.x < VIEW.width) flying.push(laser)
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
function burst(state: GameState, x: number, y: number): void {
  state.blasts.push({ x, y, age: 0, radius: POWER.blastRadius, duration: POWER.blastDuration })
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
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'flying') continue
    ufo.state = leaveFrom(ufo.x, UFO.width, 'deserted')
    events.onUfoDeserted?.(ufo)
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
  for (const ufo of state.ufos) {
    pop(state, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
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

/** A black hole passing over the board. Everything inside twice its radius is
 *  simply gone — no wreck, no retreat, nothing left to draw. */
function swallow(state: GameState, hole: Shot, events: GameEvents): void {
  const centreX = hole.x + BLACK_HOLE.radius
  const centreY = hole.y + BLACK_HOLE.radius
  const reach = BLACK_HOLE.radius * BLACK_HOLE.reach

  const survivors: Ufo[] = []
  for (const ufo of state.ufos) {
    if (!withinReach(centreX, centreY, reach, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)) {
      survivors.push(ufo)
      continue
    }
    const points = ufoPoints(ufo)
    awardScore(state, points, events)
    events.onUfoDowned?.(ufo, points)
  }
  state.ufos = survivors

  state.lasers = state.lasers.filter(
    (laser) => !withinReach(centreX, centreY, reach, laser.x + LASER.width / 2, laser.y + LASER.height / 2),
  )

  const boss = state.boss
  if (boss === null) return
  const rect: Rect = { x: boss.x, y: boss.y, width: BOSS.width, height: BOSS.height }
  if (circleTouchesRect(centreX, centreY, reach, rect)) downBoss(state, events)
}

function withinReach(cx: number, cy: number, reach: number, x: number, y: number): boolean {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= reach * reach
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
    if (doomed.has(ufo)) pop(state, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
    const points = ufoPoints(ufo)
    awardScore(state, points, events)
    events.onUfoDowned?.(ufo, points)
  }
  state.ufos = survivors
}

function pop(state: GameState, x: number, y: number): void {
  state.blasts.push({ x, y, age: 0, radius: POWER.popRadius, duration: POWER.popDuration })
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
    chosen.state = leaveFrom(chosen.x, UFO.width, 'deserted')
    events.onUfoDeserted?.(chosen)
  }
  state.desertions = pending
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
function fireLasers(state: GameState, dt: number): void {
  const limit = ROUND.baseMaxLasers + Math.floor((state.round - 1) / 2)
  state.fireTimer -= dt
  if (state.fireTimer > 0) return
  state.fireTimer += fireInterval(state.round)
  if (state.lasers.length >= limit) return

  const shooters = frontLineUfos(state)
  if (shooters.length === 0) return
  const shooter = shooters[Math.floor(Math.random() * shooters.length)]
  if (shooter === undefined) return

  state.lasers.push(shoot(shooter.x + UFO.width / 2, shooter.y + UFO.height, 0, state.round))
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

function shoot(x: number, y: number, angle: number, round: number): LaserShot {
  const speed = LASER.baseSpeed + (round - 1) * LASER.speedPerRound
  return {
    x: x - LASER.width / 2,
    y,
    vx: Math.sin(angle) * speed,
    vy: Math.cos(angle) * speed,
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
  }
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
  if (exit.kind === 'wobbling') return

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
function fireVolley(state: GameState, dt: number): void {
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
    state.lasers.push(shoot(x, boss.y + BOSS.height * 0.82, angle, state.round))
  }
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

/** Decides at the start of a round whether a Rambo egg turns up in it, and if
 *  so how long into the round. */
function rollPickup(): number | null {
  if (Math.random() >= POWER.chance) return null
  return POWER.minDelay + Math.random() * (POWER.maxDelay - POWER.minDelay)
}

function tickPickup(state: GameState, dt: number): void {
  if (state.pickup !== null) {
    state.pickup.remaining -= dt
    if (state.pickup.remaining <= 0) state.pickup = null
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

/** The eight upgrades are equally likely. Which one you get is the joke; being
 *  able to plan around it would spoil it. */
function rollPower(): Power {
  switch (Math.floor(Math.random() * 8)) {
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
      return { kind: 'shield', ...clock(POWER.shieldDuration) }
    case 4:
      return { kind: 'heart', ...clock(POWER.holdDuration) }
    case 5:
      return { kind: 'gravity', ...clock(GRAVITY.duration) }
    case 6:
      return { kind: 'blackHole', ...clock(BLACK_HOLE.duration) }
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
    (laser) => !overlaps(column, { x: laser.x, y: laser.y, width: LASER.width, height: LASER.height }),
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
    if (hitsPickup(state, eggRect, events)) continue
    if (hitsObstacle(state, eggRect, { vx: shot.vx })) continue
    if (hitsBoss(state, eggRect, events)) continue
    if (splattersUfo(state, eggRect, frozen, events)) continue
    survivingShots.push(shot)
  }
  state.shots = survivingShots

  // A laser with time stopped is a stationary object that cannot act. Walking
  // into one costing a life would make the freeze a hazard rather than a gift.
  if (frozen) return

  const shielded = state.power.kind === 'shield'
  const henRect: Rect = { x: state.hen.x, y: HEN_TOP, width: HEN.width, height: HEN.height }
  const survivingLasers = []
  for (const laser of state.lasers) {
    const laserRect: Rect = { x: laser.x, y: laser.y, width: LASER.width, height: LASER.height }
    if (hitsObstacle(state, laserRect, null)) continue
    if (overlaps(laserRect, henRect)) {
      // The shield eats the shot outright; without it, only the post-hit
      // invulnerability saves her.
      if (shielded) continue
      if (state.hen.invulnerable <= 0) {
        hurtHen(state, events)
        return
      }
    }
    survivingLasers.push(laser)
  }
  state.lasers = survivingLasers
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
        pop(state, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
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
      if (!offBoard) pop(state, obstacle.x + OBSTACLE.width / 2, obstacle.y + OBSTACLE.height / 2)
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
  state.pickup = null
  state.power = rollPower()
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
    if (hit || !overlaps(egg, ufoRect(ufo))) {
      survivors.push(ufo)
      continue
    }
    hit = true

    if (frozen) {
      pop(state, ufo.x + UFO.width / 2, ufo.y + UFO.height / 2)
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
  // Clear the air so she does not respawn into a laser she cannot dodge.
  state.lasers = []
  events.onHenHurt?.()
  if (state.hen.lives <= 0) endGame(state)
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
