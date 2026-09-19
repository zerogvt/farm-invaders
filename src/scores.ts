import { SCORES } from './config'
import type { HighScore } from './types'

/**
 * High scores live in localStorage, which means they are per-browser and never
 * leave the machine — there is no shared leaderboard and no way to compare
 * scores with anyone else. Every read is defensive: localStorage throws in
 * private-mode browsers and can hold anything a previous version wrote.
 */

export function loadScores(): HighScore[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SCORES.storageKey)
  } catch {
    return []
  }
  if (raw === null) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const valid: HighScore[] = []
    for (const entry of parsed) {
      const score = toScore(entry)
      if (score !== null) valid.push(score)
    }
    return sortAndTrim(valid)
  } catch {
    return []
  }
}

export function saveScore(entry: HighScore): HighScore[] {
  const updated = sortAndTrim([...loadScores(), entry])
  try {
    localStorage.setItem(SCORES.storageKey, JSON.stringify(updated))
  } catch {
    // Storage unavailable or full: the board simply will not persist.
  }
  return updated
}

/** True when the score earns a place on the board, so the game knows whether
 *  to prompt for initials at all. */
export function qualifies(score: number): boolean {
  if (score <= 0) return false
  const board = loadScores()
  if (board.length < SCORES.keep) return true
  const lowest = board[board.length - 1]
  return lowest === undefined || score > lowest.score
}

function toScore(value: unknown): HighScore | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record['score'] !== 'number' || !Number.isFinite(record['score'])) return null
  const initials = typeof record['initials'] === 'string' ? record['initials'] : '???'
  const round = typeof record['round'] === 'number' && Number.isFinite(record['round']) ? record['round'] : 1
  return { initials: initials.slice(0, 3).toUpperCase(), score: Math.floor(record['score']), round: Math.floor(round) }
}

function sortAndTrim(entries: HighScore[]): HighScore[] {
  return [...entries].sort((a, b) => b.score - a.score).slice(0, SCORES.keep)
}
