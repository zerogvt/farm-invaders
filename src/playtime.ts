/**
 * The parents' daily play allowance: seconds played today, kept per calendar
 * day so a new game (or a reload) does not start a new allowance. Only time
 * spent actually playing counts; the title card, the pause card and the
 * game-over panel do not. Ported from the syllable game.
 */
import { PLAY_LIMIT_CHOICES } from './config'

export interface PlayedToday {
  /** Local calendar day, YYYY-MM-DD. */
  day: string
  seconds: number
}

export function dayKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Today's record: `saved` if it is from today, a fresh one otherwise (also for junk). */
export function playedToday(saved: unknown, today: string): PlayedToday {
  const record = saved as Partial<PlayedToday> | null
  if (record && record.day === today && typeof record.seconds === 'number' && record.seconds >= 0) {
    return { day: today, seconds: record.seconds }
  }
  return { day: today, seconds: 0 }
}

/** Seconds of play left today, or Infinity with no limit. */
export function playLeft(played: PlayedToday, limitMinutes: number | null): number {
  if (limitMinutes === null) return Infinity
  return Math.max(0, limitMinutes * 60 - played.seconds)
}

/** A stored limit, or null (no limit) if it is not one of the choices. */
export function parseLimit(stored: string | null): number | null {
  const value = Number(stored)
  return stored !== null && PLAY_LIMIT_CHOICES.includes(value) ? value : null
}

/** "45 min", "1 hour 30 min", "No limit". */
export function limitLabel(minutes: number | null): string {
  if (minutes === null) return 'No limit ∞'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  const h = hours === 1 ? '1 hour' : `${hours} hours`
  return rest === 0 ? h : `${h} ${rest} min`
}

const LIMIT_KEY = 'farminvaders.playLimit.v1'
const PLAYED_KEY = 'farminvaders.played.v1'

/** The allowance as the page uses it, kept in localStorage. */
export interface Allowance {
  /** Minutes a day, or null for no limit. */
  limit(): number | null
  setLimit(minutes: number | null): void
  /** Seconds played today. */
  played(): number
  /** Seconds of play left today, or Infinity with no limit. */
  left(): number
  /** Counts `dt` seconds of play, saving every few seconds. */
  add(dt: number): void
  save(): void
}

/** Blocked storage means the limit and today's count last only until the page closes. */
export function createAllowance(): Allowance {
  let limit: number | null = null
  let saved: unknown = null
  try {
    limit = parseLimit(window.localStorage.getItem(LIMIT_KEY))
    saved = JSON.parse(window.localStorage.getItem(PLAYED_KEY) ?? 'null')
  } catch {
    // Blocked storage or junk: no limit, counted from zero.
  }
  let record = playedToday(saved, dayKey(new Date()))
  // Read through this, so a game left running past midnight starts tomorrow's count.
  const today = (): PlayedToday => (record = playedToday(record, dayKey(new Date())))

  const save = (): void => {
    try {
      window.localStorage.setItem(PLAYED_KEY, JSON.stringify(today()))
    } catch {
      // Counted for this page only.
    }
  }

  return {
    limit: () => limit,
    setLimit(minutes) {
      limit = minutes
      try {
        if (minutes === null) window.localStorage.removeItem(LIMIT_KEY)
        else window.localStorage.setItem(LIMIT_KEY, String(minutes))
      } catch {
        // Holds for this page only.
      }
    },
    played: () => today().seconds,
    left: () => playLeft(today(), limit),
    add(dt) {
      const current = today()
      const before = Math.floor(current.seconds / 5)
      current.seconds += dt
      if (Math.floor(current.seconds / 5) !== before) save()
    },
    save,
  }
}
