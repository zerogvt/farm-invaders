import { OBSTACLE, VIEW } from './config'
import type { Obstacle, ToyKind } from './types'

const TOY_KINDS: ToyKind[] = ['horse', 'duck', 'ball', 'teddy', 'bicycle', 'tractor', 'alien']

/**
 * Scatters a fresh set of toys for a round.
 *
 * The placement is random but not freely random: the usable width is cut into
 * one lane per toy and each toy is jittered inside its own lane, with
 * OBSTACLE.minGap held back at the lane's end. That guarantees the toys can
 * never overlap, never touch the side walls, and never line up into a wall that
 * seals off a column of the formation — the failure modes that make "random
 * obstacles" read as broken rather than varied.
 */
export function placeObstacles(): Obstacle[] {
  const usable = VIEW.width - OBSTACLE.sideMargin * 2
  const lane = usable / OBSTACLE.count
  const jitter = Math.max(0, lane - OBSTACLE.width - OBSTACLE.minGap)
  const kinds = shuffledKinds(OBSTACLE.count)

  const obstacles: Obstacle[] = []
  for (let i = 0; i < OBSTACLE.count; i++) {
    const laneStart = OBSTACLE.sideMargin + lane * i
    obstacles.push({
      kind: kinds[i] ?? 'ball',
      x: Math.round(laneStart + Math.random() * jitter),
      y: Math.round(OBSTACLE.minY + Math.random() * (OBSTACLE.maxY - OBSTACLE.minY)),
      health: OBSTACLE.hitPoints,
      vx: 0,
      vy: 0,
      spin: 0,
      rotation: 0,
    })
  }
  return obstacles
}

/** Fisher-Yates over the toy kinds, so a round shows four different toys out
 *  of the seven, in a different arrangement each time. */
function shuffledKinds(count: number): ToyKind[] {
  const pool = [...TOY_KINDS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = pool[i]
    const b = pool[j]
    if (a === undefined || b === undefined) continue
    pool[i] = b
    pool[j] = a
  }
  const picked: ToyKind[] = []
  for (let i = 0; i < count; i++) {
    picked.push(pool[i % pool.length] ?? 'ball')
  }
  return picked
}
