import { EGG, HEN, LASER, OBSTACLE, ROUND, SPLAT, UFO, VIEW } from './config'
import type { InputState } from './input'
import { placeObstacles } from './obstacles'
import type { GameState, Laser as LaserShot, Rect, Ufo } from './types'

/** Y coordinate of the top of the hen's helmet; the line the saucers race for. */
export const HEN_TOP = VIEW.height - HEN.bottomMargin - HEN.height

/** Things the simulation wants to announce but does not want to own: sounds,
 *  score submission, screen shake. Everything is optional so update() stays
 *  testable without a UI attached. */
export interface GameEvents {
  /** An egg has just burst on a windscreen. The saucer is still on screen. */
  onUfoSplattered?: (ufo: Ufo) => void
  /** A splattered saucer has finally cleared the view, and scores. */
  onUfoDowned?: (ufo: Ufo, points: number) => void
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
    eggs: [],
    lasers: [],
    obstacles: [],
    marchTimer: 0,
    marchDirection: 1,
    roundUfoCount: 0,
    fireTimer: 0,
    shotCooldown: 0,
  }
  startRound(state, 1)
  return state
}

/** Resets the board for a round: a new formation, a fresh scatter of toys, and
 *  no leftover projectiles. Score, lives and the hen's position carry over. */
export function startRound(state: GameState, round: number): void {
  state.round = round
  state.ufos = buildFormation(round)
  state.roundUfoCount = state.ufos.length
  state.obstacles = placeObstacles()
  state.eggs = []
  state.lasers = []
  state.marchDirection = 1
  state.marchTimer = stepInterval(state)
  state.fireTimer = fireInterval(round)
  state.shotCooldown = 0
  state.hen.invulnerable = HEN.hurtInvulnerability
  state.phase = { kind: 'intro', remaining: ROUND.introDuration }
}

export function restart(state: GameState): void {
  state.score = 0
  state.hen.lives = HEN.lives
  state.hen.x = VIEW.width / 2 - HEN.width / 2
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
  fireLasers(state, dt)
  resolveCollisions(state, events)

  if (state.ufos.length === 0) {
    events.onRoundCleared?.(state.round)
    state.phase = { kind: 'cleared', remaining: 1.4 }
    return
  }

  // A saucer that reaches the hen's line ends the run outright, however many
  // lives are left — same rule as the original invasion. A splattered one is
  // running away and sinking as it goes, so it is not an invader any more.
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'flying') continue
    if (ufo.y + UFO.height >= HEN_TOP) {
      endGame(state, events)
      return
    }
  }
}

function tickTimers(state: GameState, dt: number): void {
  if (state.shotCooldown > 0) state.shotCooldown = Math.max(0, state.shotCooldown - dt)
  if (state.hen.invulnerable > 0) state.hen.invulnerable = Math.max(0, state.hen.invulnerable - dt)
}

function moveHen(state: GameState, dt: number, input: InputState): void {
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (direction === 0) return
  const next = state.hen.x + direction * HEN.speed * dt
  state.hen.x = clamp(next, 0, VIEW.width - HEN.width)
}

function tryShoot(state: GameState, input: InputState): void {
  if (!input.fire) return
  if (state.shotCooldown > 0) return
  if (state.eggs.length >= EGG.maxInFlight) return
  state.eggs.push({
    x: state.hen.x + HEN.width / 2 - EGG.width / 2,
    y: HEN_TOP - EGG.height,
    spin: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3),
    rotation: Math.random() * Math.PI * 2,
  })
  state.shotCooldown = EGG.cooldown
}

function advanceProjectiles(state: GameState, dt: number): void {
  const laserSpeed = LASER.baseSpeed + (state.round - 1) * LASER.speedPerRound

  const flyingEggs = []
  for (const egg of state.eggs) {
    egg.y -= EGG.speed * dt
    egg.rotation += egg.spin * dt
    if (egg.y + EGG.height > 0) flyingEggs.push(egg)
  }
  state.eggs = flyingEggs

  const fallingLasers = []
  for (const laser of state.lasers) {
    laser.y += laserSpeed * dt
    if (laser.y < VIEW.height) fallingLasers.push(laser)
  }
  state.lasers = fallingLasers
}

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

  const laser: LaserShot = {
    x: shooter.x + UFO.width / 2 - LASER.width / 2,
    y: shooter.y + UFO.height,
  }
  state.lasers.push(laser)
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

function resolveCollisions(state: GameState, events: GameEvents): void {
  const survivingEggs = []
  for (const egg of state.eggs) {
    const eggRect: Rect = { x: egg.x, y: egg.y, width: EGG.width, height: EGG.height }
    if (damagesObstacle(state, eggRect)) continue
    if (splattersUfo(state, eggRect, events)) continue
    survivingEggs.push(egg)
  }
  state.eggs = survivingEggs

  const henRect: Rect = { x: state.hen.x, y: HEN_TOP, width: HEN.width, height: HEN.height }
  const survivingLasers = []
  for (const laser of state.lasers) {
    const laserRect: Rect = { x: laser.x, y: laser.y, width: LASER.width, height: LASER.height }
    if (damagesObstacle(state, laserRect)) continue
    if (state.hen.invulnerable <= 0 && overlaps(laserRect, henRect)) {
      hurtHen(state, events)
      return
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
      ufo.state = {
        kind: 'splattered',
        direction: nearestEdge(ufo),
        reeling: SPLAT.reelDuration,
        speed: SPLAT.fleeSpeed,
      }
      events.onUfoSplattered?.(ufo)
    }
    return true
  }
  return false
}

/** Which wall a blinded saucer runs for: whichever one it is already nearer,
 *  so the retreat is the shortest way out of the fight. */
function nearestEdge(ufo: Ufo): -1 | 1 {
  return ufo.x + UFO.width / 2 < VIEW.width / 2 ? -1 : 1
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
