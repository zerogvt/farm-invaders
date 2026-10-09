import { BEDTIME } from './config'

/** Whole seconds left to show in the HUD, given seconds of play left today, or
 *  null while it is too early to count down (or there is no limit). Rounded
 *  up, so the clock reads 0:00 only at bedtime itself. */
export function bedtimeCountdown(left: number): number | null {
  return left > BEDTIME.countdownFrom ? null : Math.ceil(Math.max(0, left))
}

/** `9:05` for 545 seconds. */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
