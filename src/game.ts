import { BABY, BOTTLE, DIAPER, MOM, OBSTACLE, ROUND, VIEW } from './config'
import type { InputState } from './input'
import { placeObstacles } from './obstacles'
import type { Baby, Diaper, GameState, Rect } from './types'

/** Y coordinate of the top of mom's head; the line the babies are racing for. */
export const MOM_TOP = VIEW.height - MOM.bottomMargin - MOM.height

/** Things the simulation wants to announce but does not want to own: sounds,
 *  score submission, screen shake. Everything is optional so update() stays
 *  testable without a UI attached. */
export interface GameEvents {
  onBabyFed?: (baby: Baby, points: number) => void
  onMomHurt?: () => void
  onRoundCleared?: (round: number) => void
  onGameOver?: (score: number, round: number) => void
}

export function createGame(): GameState {
  const state: GameState = {
    phase: { kind: 'intro', remaining: ROUND.introDuration },
    round: 1,
    score: 0,
    mom: { x: VIEW.width / 2 - MOM.width / 2, lives: MOM.lives, invulnerable: 0 },
    babies: [],
    bottles: [],
    diapers: [],
    obstacles: [],
    marchTimer: 0,
    marchDirection: 1,
    roundBabyCount: 0,
    fireTimer: 0,
    shotCooldown: 0,
  }
  startRound(state, 1)
  return state
}

/** Resets the board for a round: a new formation, a fresh scatter of toys, and
 *  no leftover projectiles. Score, lives and mom's position carry over. */
export function startRound(state: GameState, round: number): void {
  state.round = round
  state.babies = buildFormation(round)
  state.roundBabyCount = state.babies.length
  state.obstacles = placeObstacles()
  state.bottles = []
  state.diapers = []
  state.marchDirection = 1
  state.marchTimer = stepInterval(state)
  state.fireTimer = fireInterval(round)
  state.shotCooldown = 0
  state.mom.invulnerable = MOM.hurtInvulnerability
  state.phase = { kind: 'intro', remaining: ROUND.introDuration }
}

export function restart(state: GameState): void {
  state.score = 0
  state.mom.lives = MOM.lives
  state.mom.x = VIEW.width / 2 - MOM.width / 2
  startRound(state, 1)
}

/**
 * Advances the whole simulation by `dt` seconds. `dt` is clamped by the caller,
 * so a backgrounded tab cannot resume with a single enormous step that
 * teleports diapers straight through mom.
 */
export function update(state: GameState, dt: number, input: InputState, events: GameEvents = {}): void {
  switch (state.phase.kind) {
    case 'intro':
      state.phase.remaining -= dt
      // Mom can already line up her shot during the banner; only the babies wait.
      moveMom(state, dt, input)
      tickTimers(state, dt)
      if (state.phase.remaining <= 0) state.phase = { kind: 'playing' }
      return

    case 'cleared':
      state.phase.remaining -= dt
      moveMom(state, dt, input)
      advanceProjectiles(state, dt)
      tickTimers(state, dt)
      if (state.phase.remaining <= 0) startRound(state, state.round + 1)
      return

    case 'over':
      return

    case 'playing':
      break
  }

  moveMom(state, dt, input)
  tickTimers(state, dt)
  tryShoot(state, input)
  advanceProjectiles(state, dt)
  marchFormation(state, dt, events)
  tickFeeding(state, dt, events)
  throwDiapers(state, dt)
  resolveCollisions(state, events)

  if (state.babies.length === 0) {
    events.onRoundCleared?.(state.round)
    state.phase = { kind: 'cleared', remaining: 1.4 }
    return
  }

  // A baby that reaches mom's line ends the run outright, however many lives
  // are left — same rule as the original invasion.
  for (const baby of state.babies) {
    if (baby.y + BABY.height >= MOM_TOP) {
      endGame(state, events)
      return
    }
  }
}

function tickTimers(state: GameState, dt: number): void {
  if (state.shotCooldown > 0) state.shotCooldown = Math.max(0, state.shotCooldown - dt)
  if (state.mom.invulnerable > 0) state.mom.invulnerable = Math.max(0, state.mom.invulnerable - dt)
}

function moveMom(state: GameState, dt: number, input: InputState): void {
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (direction === 0) return
  const next = state.mom.x + direction * MOM.speed * dt
  state.mom.x = clamp(next, 0, VIEW.width - MOM.width)
}

function tryShoot(state: GameState, input: InputState): void {
  if (!input.fire) return
  if (state.shotCooldown > 0) return
  if (state.bottles.length >= BOTTLE.maxInFlight) return
  state.bottles.push({
    x: state.mom.x + MOM.width / 2 - BOTTLE.width / 2,
    y: MOM_TOP - BOTTLE.height,
  })
  state.shotCooldown = BOTTLE.cooldown
}

function advanceProjectiles(state: GameState, dt: number): void {
  const diaperSpeed = DIAPER.baseSpeed + (state.round - 1) * DIAPER.speedPerRound

  const flyingBottles = []
  for (const bottle of state.bottles) {
    bottle.y -= BOTTLE.speed * dt
    if (bottle.y + BOTTLE.height > 0) flyingBottles.push(bottle)
  }
  state.bottles = flyingBottles

  const fallingDiapers = []
  for (const diaper of state.diapers) {
    diaper.y += diaperSpeed * dt
    diaper.rotation += diaper.spin * dt
    if (diaper.y < VIEW.height) fallingDiapers.push(diaper)
  }
  state.diapers = fallingDiapers
}

/**
 * The formation moves in discrete steps rather than continuously, which is what
 * gives Space Invaders its march. Each step tries to move sideways; if that
 * would push the block past a wall it drops and reverses instead.
 */
function marchFormation(state: GameState, dt: number, events: GameEvents): void {
  state.marchTimer -= dt
  if (state.marchTimer > 0) return
  state.marchTimer += stepInterval(state)

  let leftmost = Infinity
  let rightmost = -Infinity
  for (const baby of state.babies) {
    leftmost = Math.min(leftmost, baby.x)
    rightmost = Math.max(rightmost, baby.x + BABY.width)
  }

  const dx = BABY.marchStep * state.marchDirection
  const wouldLeaveView = leftmost + dx < 0 || rightmost + dx > VIEW.width
  if (wouldLeaveView) {
    state.marchDirection = state.marchDirection === 1 ? -1 : 1
    for (const baby of state.babies) baby.y += BABY.descendStep
    // Dropping can be what carries the front rank onto mom, so re-check here
    // rather than waiting for the next frame.
    for (const baby of state.babies) {
      if (baby.y + BABY.height >= MOM_TOP) {
        endGame(state, events)
        return
      }
    }
    return
  }

  for (const baby of state.babies) baby.x += dx
}

/** Feeding babies count down and then vanish, scoring by the row they started
 *  in — the back rows are worth more, as in the original. */
function tickFeeding(state: GameState, dt: number, events: GameEvents): void {
  const survivors: Baby[] = []
  for (const baby of state.babies) {
    if (baby.state.kind !== 'feeding') {
      survivors.push(baby)
      continue
    }
    baby.state.remaining -= dt
    if (baby.state.remaining > 0) {
      survivors.push(baby)
      continue
    }
    const points = BABY.rowScores[baby.row] ?? BABY.rowScores[BABY.rowScores.length - 1] ?? 10
    state.score += points
    events.onBabyFed?.(baby, points)
  }
  state.babies = survivors
}

/** Only the front baby of a column can throw, so diapers always come from the
 *  rank the player can actually see and shoot back at. */
function throwDiapers(state: GameState, dt: number): void {
  const limit = ROUND.baseMaxDiapers + Math.floor((state.round - 1) / 2)
  state.fireTimer -= dt
  if (state.fireTimer > 0) return
  state.fireTimer += fireInterval(state.round)
  if (state.diapers.length >= limit) return

  const throwers = frontLineBabies(state)
  if (throwers.length === 0) return
  const thrower = throwers[Math.floor(Math.random() * throwers.length)]
  if (thrower === undefined) return

  const diaper: Diaper = {
    x: thrower.x + BABY.width / 2 - DIAPER.width / 2,
    y: thrower.y + BABY.height,
    spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3),
    rotation: Math.random() * Math.PI * 2,
  }
  state.diapers.push(diaper)
}

/** The lowest still-marching baby in each occupied column. Feeding babies are
 *  excluded: a baby with a bottle in its mouth has better things to do. */
function frontLineBabies(state: GameState): Baby[] {
  const lowestByColumn = new Map<number, Baby>()
  for (const baby of state.babies) {
    if (baby.state.kind !== 'marching') continue
    const current = lowestByColumn.get(baby.column)
    if (current === undefined || baby.y > current.y) lowestByColumn.set(baby.column, baby)
  }
  return [...lowestByColumn.values()]
}

function resolveCollisions(state: GameState, events: GameEvents): void {
  const survivingBottles = []
  for (const bottle of state.bottles) {
    const bottleRect: Rect = { x: bottle.x, y: bottle.y, width: BOTTLE.width, height: BOTTLE.height }
    if (damagesObstacle(state, bottleRect)) continue
    if (feedsBaby(state, bottleRect)) continue
    survivingBottles.push(bottle)
  }
  state.bottles = survivingBottles

  const momRect: Rect = { x: state.mom.x, y: MOM_TOP, width: MOM.width, height: MOM.height }
  const survivingDiapers = []
  for (const diaper of state.diapers) {
    const diaperRect: Rect = { x: diaper.x, y: diaper.y, width: DIAPER.width, height: DIAPER.height }
    if (damagesObstacle(state, diaperRect)) continue
    if (state.mom.invulnerable <= 0 && overlaps(diaperRect, momRect)) {
      hurtMom(state, events)
      return
    }
    survivingDiapers.push(diaper)
  }
  state.diapers = survivingDiapers
}

/** Returns true when the projectile was absorbed. Toys soak bottles and diapers
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
 * Returns true when the bottle was caught. A bottle that reaches an
 * already-feeding baby is absorbed and wasted: the baby has a bottle, and the
 * player has spent one of three in flight on a kill that was already coming.
 * That is the whole cost the feeding delay imposes, so it is deliberate.
 */
function feedsBaby(state: GameState, bottle: Rect): boolean {
  for (const baby of state.babies) {
    const rect: Rect = { x: baby.x, y: baby.y, width: BABY.width, height: BABY.height }
    if (!overlaps(bottle, rect)) continue
    if (baby.state.kind === 'marching') baby.state = { kind: 'feeding', remaining: BABY.feedDuration }
    return true
  }
  return false
}

function hurtMom(state: GameState, events: GameEvents): void {
  state.mom.lives -= 1
  state.mom.invulnerable = MOM.hurtInvulnerability
  // Clear the air so she does not respawn into a diaper she cannot dodge.
  state.diapers = []
  events.onMomHurt?.()
  if (state.mom.lives <= 0) endGame(state, events)
}

function endGame(state: GameState, events: GameEvents): void {
  if (state.phase.kind === 'over') return
  state.phase = { kind: 'over', scoreSubmitted: false }
  events.onGameOver?.(state.score, state.round)
}

function buildFormation(round: number): Baby[] {
  const rows = Math.min(BABY.maxRows, BABY.baseRows + Math.floor((round - 1) / 2))
  const formationWidth = BABY.columns * BABY.cellWidth
  const left = (VIEW.width - formationWidth) / 2 + (BABY.cellWidth - BABY.width) / 2
  const top = Math.min(BABY.maxStartY, BABY.startY + (round - 1) * BABY.startYPerRound)

  // Row 0 is the front rank (nearest mom) so it can index rowScores directly.
  const babies: Baby[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < BABY.columns; column++) {
      babies.push({
        column,
        row,
        x: left + column * BABY.cellWidth,
        y: top + (rows - 1 - row) * BABY.cellHeight,
        state: { kind: 'marching' },
        wobblePhase: Math.random() * Math.PI * 2,
      })
    }
  }
  return babies
}

/** Seconds between march steps. The formation accelerates as its ranks thin and
 *  starts each round a little faster than the last. */
function stepInterval(state: GameState): number {
  const remaining = state.babies.length
  const total = Math.max(1, state.roundBabyCount)
  const thinning = remaining <= 1 ? 0 : (remaining - 1) / Math.max(1, total - 1)
  const base = BABY.fastestStepInterval + (BABY.slowestStepInterval - BABY.fastestStepInterval) * thinning
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
