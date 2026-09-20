import { BOSS, EGG, HEN, LASER, OBSTACLE, POWER, ROUND, SPLAT, UFO, VIEW } from './config'
import type { InputState } from './input'
import { placeObstacles } from './obstacles'
import type { Boss, GameState, Laser as LaserShot, Power, Rect, Splat, Ufo } from './types'

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

/** Things the simulation wants to announce but does not want to own: sounds,
 *  score submission, screen shake. Everything is optional so update() stays
 *  testable without a UI attached. */
export interface GameEvents {
  /** An egg has just burst on a windscreen. The saucer is still on screen. */
  onUfoSplattered?: (ufo: Ufo) => void
  /** A splattered saucer has finally cleared the view, and scores. */
  onUfoDowned?: (ufo: Ufo, points: number) => void
  onBossHit?: (boss: Boss) => void
  onBossDowned?: (points: number) => void
  onPowerGained?: (power: Power) => void
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
    eggs: [],
    lasers: [],
    obstacles: [],
    power: { kind: 'none' },
    pickup: null,
    pickupTimer: null,
    blasts: [],
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
  state.eggs = []
  state.lasers = []
  state.blasts = []
  state.pickup = null
  state.pickupTimer = rollPickup()
  state.marchDirection = 1
  state.marchTimer = stepInterval(state)
  state.fireTimer = boss ? bossFireInterval(round) : fireInterval(round)
  state.shotCooldown = 0
  state.hen.invulnerable = HEN.hurtInvulnerability
  state.phase = { kind: 'intro', remaining: boss ? ROUND.bossIntroDuration : ROUND.introDuration }
}

export function restart(state: GameState): void {
  state.score = 0
  state.hen.lives = HEN.lives
  state.hen.x = VIEW.width / 2 - HEN.width / 2
  state.power = { kind: 'none' }
  startRound(state, 1)
}

/**
 * Advances the whole simulation by `dt` seconds. `dt` is clamped by the caller,
 * so a backgrounded tab cannot resume with a single enormous step that
 * teleports lasers straight through the hen.
 */
export function update(state: GameState, dt: number, input: InputState, events: GameEvents = {}): void {
  switch (state.phase.kind) {
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
      advanceProjectiles(state, dt)
      tickTimers(state, dt)
      if (state.phase.remaining <= 0) startRound(state, state.round + 1)
      return

    case 'over':
      return

    case 'playing':
      break
  }

  moveHen(state, dt, input)
  tickTimers(state, dt)
  tryShoot(state, input)
  advanceProjectiles(state, dt)
  marchFormation(state, dt, events)
  tickRetreat(state, dt, events)
  tickBoss(state, dt, events)
  if (state.boss === null) fireLasers(state, dt)
  else fireVolley(state, dt)
  tickPickup(state, dt)
  tickBeam(state, dt, events)
  resolveCollisions(state, events)

  if (state.ufos.length === 0 && state.boss === null) {
    events.onRoundCleared?.(state.round)
    state.phase = { kind: 'cleared', remaining: 1.4 }
    return
  }

  // Anything that reaches the hen's line ends the run outright, however many
  // lives are left — same rule as the original invasion. A splattered saucer is
  // running away and sinking as it goes, so it is not an invader any more.
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'flying') continue
    if (ufo.y + UFO.height >= HEN_TOP) {
      endGame(state, events)
      return
    }
  }
  if (state.boss !== null && state.boss.state.kind === 'flying' && state.boss.y + BOSS.height >= HEN_TOP) {
    endGame(state, events)
  }
}

function tickTimers(state: GameState, dt: number): void {
  if (state.shotCooldown > 0) state.shotCooldown = Math.max(0, state.shotCooldown - dt)
  if (state.hen.invulnerable > 0) state.hen.invulnerable = Math.max(0, state.hen.invulnerable - dt)

  // The super egg is the one upgrade with no clock: it is spent by firing it.
  const power = state.power
  if (power.kind !== 'none' && power.kind !== 'superEgg') {
    power.remaining -= dt
    if (power.remaining <= 0) state.power = { kind: 'none' }
  }

  const blasts = []
  for (const blast of state.blasts) {
    blast.age += dt
    if (blast.age < POWER.blastDuration) blasts.push(blast)
  }
  state.blasts = blasts
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

  if (power.kind === 'superEgg') {
    state.eggs.push({
      x: muzzleX - POWER.superEggWidth / 2,
      y: HEN_TOP - POWER.superEggHeight,
      spin: 1.4,
      rotation: 0,
      vx: 0,
      kind: 'super',
    })
    // Spent on firing, so there is exactly one of these per pickup.
    state.power = { kind: 'none' }
    state.shotCooldown = EGG.cooldown
    return
  }

  if (power.kind === 'multishot') {
    // The fan is capped rather than uncapped: the cooldown alone would let a
    // twenty-egg volley stack up faster than the eggs can leave the view.
    if (state.eggs.length >= power.eggs * 4) return
    for (let i = 0; i < power.eggs; i++) {
      const across = power.eggs === 1 ? 0 : (i / (power.eggs - 1)) * 2 - 1
      state.eggs.push({
        x: muzzleX - EGG.width / 2,
        y: HEN_TOP - EGG.height,
        spin: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3),
        rotation: Math.random() * Math.PI * 2,
        vx: Math.sin(across * POWER.multishotSpread) * EGG.speed,
        kind: 'normal',
      })
    }
    state.shotCooldown = EGG.cooldown
    return
  }

  if (state.eggs.length >= EGG.maxInFlight) return
  state.eggs.push({
    x: muzzleX - EGG.width / 2,
    y: HEN_TOP - EGG.height,
    spin: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3),
    rotation: Math.random() * Math.PI * 2,
    vx: 0,
    kind: 'normal',
  })
  state.shotCooldown = EGG.cooldown
}

function advanceProjectiles(state: GameState, dt: number): void {
  const flyingEggs = []
  for (const egg of state.eggs) {
    const speed = egg.kind === 'super' ? POWER.superEggSpeed : EGG.speed
    egg.y -= speed * dt
    egg.x += egg.vx * dt
    egg.rotation += egg.spin * dt

    if (egg.kind === 'super' && egg.y <= VIEW.height * POWER.superEggBurstY) {
      burst(state, egg.x + POWER.superEggWidth / 2, egg.y + POWER.superEggHeight / 2)
      continue
    }
    const height = egg.kind === 'super' ? POWER.superEggHeight : EGG.height
    const width = egg.kind === 'super' ? POWER.superEggWidth : EGG.width
    if (egg.y + height > 0 && egg.x + width > 0 && egg.x < VIEW.width) flyingEggs.push(egg)
  }
  state.eggs = flyingEggs

  const flyingLasers = []
  for (const laser of state.lasers) {
    laser.x += laser.vx * dt
    laser.y += laser.vy * dt
    if (laser.y < VIEW.height && laser.x + LASER.width > 0 && laser.x < VIEW.width) flyingLasers.push(laser)
  }
  state.lasers = flyingLasers
}

/**
 * The super egg going off. It clears the sky outright: every saucer is
 * splattered at once and sent packing, the mothership loses whatever it had
 * left, and the lasers already in the air are wiped. The toys are left alone —
 * they are the player's cover, and blowing them up would make the best pickup
 * in the game a liability.
 */
function burst(state: GameState, x: number, y: number): void {
  state.blasts.push({ x, y, age: 0 })
  for (const ufo of state.ufos) {
    if (ufo.state.kind === 'flying') ufo.state = retreatFrom(ufo.x, UFO.width)
  }
  if (state.boss !== null && state.boss.state.kind === 'flying') {
    state.boss.hitPoints = 0
    state.boss.state = retreatFrom(state.boss.x, BOSS.width)
  }
  state.lasers = []
}

// --- the formation ---------------------------------------------------------

/**
 * The formation moves in discrete steps rather than continuously, which is what
 * gives Space Invaders its march. Each step tries to move sideways; if that
 * would push the block past a wall it drops and reverses instead.
 *
 * Splattered saucers are invisible to all of this. They have left the formation
 * and are steering themselves, so letting one widen the block's bounds on its
 * way out would bounce the formation off a wall that is not there.
 */
function marchFormation(state: GameState, dt: number, events: GameEvents): void {
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
        endGame(state, events)
        return
      }
    }
    return
  }

  for (const ufo of marching) ufo.x += dx
}

/**
 * Splattered saucers reel in place for a moment, then accelerate towards the
 * nearer wall and sink as they go. They score once they are fully out of the
 * view, scoring by the row they started in — the back rows are worth more, as
 * in the original.
 */
function tickRetreat(state: GameState, dt: number, events: GameEvents): void {
  const survivors: Ufo[] = []
  for (const ufo of state.ufos) {
    const retreat = ufo.state
    if (retreat.kind !== 'splattered') {
      survivors.push(ufo)
      continue
    }

    if (retreat.reeling > 0) {
      retreat.reeling -= dt
      survivors.push(ufo)
      continue
    }

    retreat.speed = Math.min(SPLAT.fleeMaxSpeed, retreat.speed + SPLAT.fleeAcceleration * dt)
    ufo.x += retreat.direction * retreat.speed * dt
    ufo.y += SPLAT.sinkSpeed * dt

    const gone = ufo.x + UFO.width < 0 || ufo.x > VIEW.width
    if (!gone) {
      survivors.push(ufo)
      continue
    }

    const points = UFO.rowScores[ufo.row] ?? UFO.rowScores[UFO.rowScores.length - 1] ?? 10
    state.score += points
    events.onUfoDowned?.(ufo, points)
  }
  state.ufos = survivors
}

/** Only the front saucer of a column can fire, so lasers always come from the
 *  rank the player can actually see and shoot back at. */
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

  state.lasers.push(shoot(shooter.x + UFO.width / 2, shooter.y + UFO.height, strayAngle(), state.round))
}

/** The lowest still-flying saucer in each occupied column. Splattered ones are
 *  excluded: a pilot who cannot see out of the windscreen cannot aim. */
function frontLineUfos(state: GameState): Ufo[] {
  const lowestByColumn = new Map<number, Ufo>()
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'flying') continue
    const current = lowestByColumn.get(ufo.column)
    if (current === undefined || ufo.y > current.y) lowestByColumn.set(ufo.column, ufo)
  }
  return [...lowestByColumn.values()]
}

/** Most shots fall straight; the rest are thrown off the vertical so that
 *  standing in a column's blind spot is never a durable plan. */
function strayAngle(): number {
  if (Math.random() >= LASER.strayChance) return 0
  return (Math.random() * 2 - 1) * LASER.strayAngle
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

  const retreat = boss.state
  if (retreat.kind === 'splattered') {
    if (retreat.reeling > 0) {
      retreat.reeling -= dt
      return
    }
    retreat.speed = Math.min(SPLAT.fleeMaxSpeed, retreat.speed + SPLAT.fleeAcceleration * dt)
    boss.x += retreat.direction * retreat.speed * dt
    boss.y += SPLAT.sinkSpeed * dt
    if (boss.x + BOSS.width < 0 || boss.x > VIEW.width) {
      const points = BOSS.scorePerRound * state.round
      state.score += points
      state.boss = null
      events.onBossDowned?.(points)
    }
    return
  }

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
 *  mothership's underside and jittered so no two volleys are the same. */
function fireVolley(state: GameState, dt: number): void {
  const boss = state.boss
  if (boss === null || boss.state.kind !== 'flying') return

  state.fireTimer -= dt
  if (state.fireTimer > 0) return
  state.fireTimer += bossFireInterval(state.round)

  const shots = state.round
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
  boss.state = retreatFrom(boss.x, BOSS.width)
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

/** The four upgrades are equally likely. Which one you get is the joke; being
 *  able to plan around it would spoil it. */
function rollPower(): Power {
  switch (Math.floor(Math.random() * 4)) {
    case 0: {
      const spread = POWER.multishotMax - POWER.multishotMin
      return {
        kind: 'multishot',
        eggs: POWER.multishotMin + Math.floor(Math.random() * (spread + 1)),
        remaining: POWER.multishotDuration,
      }
    }
    case 1:
      return { kind: 'superEgg' }
    case 2:
      return { kind: 'beam', remaining: POWER.beamDuration }
    default:
      return { kind: 'shield', remaining: POWER.shieldDuration }
  }
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
    if (!overlaps(column, { x: ufo.x, y: ufo.y, width: UFO.width, height: UFO.height })) continue
    ufo.state = retreatFrom(ufo.x, UFO.width)
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

function resolveCollisions(state: GameState, events: GameEvents): void {
  const survivingEggs = []
  for (const egg of state.eggs) {
    // A super egg is not stopped by anything; it is on its way to mid-screen.
    if (egg.kind === 'super') {
      survivingEggs.push(egg)
      continue
    }
    const eggRect: Rect = { x: egg.x, y: egg.y, width: EGG.width, height: EGG.height }
    if (hitsPickup(state, eggRect, events)) continue
    if (damagesObstacle(state, eggRect)) continue
    if (hitsBoss(state, eggRect, events)) continue
    if (splattersUfo(state, eggRect, events)) continue
    survivingEggs.push(egg)
  }
  state.eggs = survivingEggs

  const shielded = state.power.kind === 'shield'
  const henRect: Rect = { x: state.hen.x, y: HEN_TOP, width: HEN.width, height: HEN.height }
  const survivingLasers = []
  for (const laser of state.lasers) {
    const laserRect: Rect = { x: laser.x, y: laser.y, width: LASER.width, height: LASER.height }
    if (damagesObstacle(state, laserRect)) continue
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

/** Returns true when the projectile was absorbed. Toys soak eggs and lasers
 *  alike, and lose a hit point either way. */
function damagesObstacle(state: GameState, projectile: Rect): boolean {
  for (let i = 0; i < state.obstacles.length; i++) {
    const obstacle = state.obstacles[i]
    if (obstacle === undefined) continue
    const rect: Rect = { x: obstacle.x, y: obstacle.y, width: OBSTACLE.width, height: OBSTACLE.height }
    if (!overlaps(projectile, rect)) continue
    obstacle.health -= 1
    if (obstacle.health <= 0) state.obstacles.splice(i, 1)
    return true
  }
  return false
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
 * Returns true when the egg burst on a hull. An egg that reaches an
 * already-splattered saucer is wasted: the windscreen is as dirty as it is
 * going to get, and the player has spent one of three in flight on a saucer
 * that was already leaving. That is the whole cost the retreat imposes, so it
 * is deliberate.
 */
function splattersUfo(state: GameState, egg: Rect, events: GameEvents): boolean {
  for (const ufo of state.ufos) {
    const rect: Rect = { x: ufo.x, y: ufo.y, width: UFO.width, height: UFO.height }
    if (!overlaps(egg, rect)) continue
    if (ufo.state.kind === 'flying') {
      ufo.state = retreatFrom(ufo.x, UFO.width)
      events.onUfoSplattered?.(ufo)
    }
    return true
  }
  return false
}

/** A blinded hull's escape plan: run for whichever wall it is already nearer,
 *  because that is the shortest way out of the fight. */
function retreatFrom(x: number, width: number): Extract<Ufo['state'], { kind: 'splattered' }> {
  return {
    kind: 'splattered',
    direction: x + width / 2 < VIEW.width / 2 ? -1 : 1,
    reeling: SPLAT.reelDuration,
    speed: SPLAT.fleeSpeed,
  }
}

function hurtHen(state: GameState, events: GameEvents): void {
  state.hen.lives -= 1
  state.hen.invulnerable = HEN.hurtInvulnerability
  // Clear the air so she does not respawn into a laser she cannot dodge.
  state.lasers = []
  events.onHenHurt?.()
  if (state.hen.lives <= 0) endGame(state, events)
}

function endGame(state: GameState, events: GameEvents): void {
  if (state.phase.kind === 'over') return
  state.phase = { kind: 'over', scoreSubmitted: false }
  events.onGameOver?.(state.score, state.round)
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

/** Seconds between march steps. The formation accelerates as its ranks thin and
 *  starts each round a little faster than the last. Saucers on their way out
 *  have already left the formation, so they no longer slow it down. */
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
