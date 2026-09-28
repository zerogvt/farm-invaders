import { BEDTIME } from './config'

/** Seconds of play left, given seconds since the page loaded. Never negative. */
export function bedtimeLeft(elapsed: number): number {
  return Math.max(0, BEDTIME.limit - elapsed)
}

/** Whole seconds left to show in the HUD, or null while it is too early to
 *  count down. Rounded up, so the clock reads 0:00 only at bedtime itself. */
export function bedtimeCountdown(elapsed: number): number | null {
  const left = bedtimeLeft(elapsed)
  return left > BEDTIME.countdownFrom ? null : Math.ceil(left)
}

export function isBedtime(elapsed: number): boolean {
  return bedtimeLeft(elapsed) <= 0
}

/** `9:05` for 545 seconds. */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
