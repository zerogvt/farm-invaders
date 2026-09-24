/// <reference types="vite/client" />

/**
 * Dynatrace Real User Monitoring, kept to this one file.
 *
 * Dynatrace RUM is a hosted monitoring service: its JavaScript agent, loaded
 * from Dynatrace's CDN rather than installed from npm, reports page loads,
 * errors and the custom game events below to a Dynatrace tenant. Nothing here
 * is a dependency of the game — with the switch off, or the agent missing or
 * blocked, every function in this file does nothing.
 *
 * Two things must both hold for anything to be sent:
 *   1. `TELEMETRY_ENABLED` below is true — the kill switch.
 *   2. The build had `VITE_DT_RUM_SRC` set to the agent's script URL, which the
 *      deploy workflow takes from the repository variable `DT_RUM_SRC`. Local
 *      builds, tests and forks have no such variable, so they report nothing.
 *
 * To remove telemetry altogether, see "Telemetry" in the README.
 */

/** The kill switch. False stops the agent loading and every event with it. */
export const TELEMETRY_ENABLED = true

/** The one call this file makes on the agent: the new RUM experience's
 *  `dynatrace.sendEvent`, which only accepts fields under `event_properties.`. */
interface RumAgent {
  sendEvent?: (fields: Record<string, string | number | boolean>) => void
}

interface Target {
  document?: Document
  dynatrace?: RumAgent
}

export interface Telemetry {
  /** Loads the RUM agent. Call once, at startup. */
  start(): void
  gameStarted(): void
  powerGained(kind: string): void
  gameOver(score: number, round: number, muted: boolean): void
}

export interface TelemetryOptions {
  enabled: boolean
  agentSrc: string | undefined
  /** Where the agent's global lives; the page's `globalThis` outside tests. */
  target: Target
  now: () => number
}

/** Built from options so the tests can drive it; the game uses `telemetry`. */
export function createTelemetry(options: TelemetryOptions): Telemetry {
  const { enabled, agentSrc, target, now } = options
  const active = enabled && typeof agentSrc === 'string' && agentSrc !== ''
  let gameStartedAt: number | null = null

  const send = (event: string, fields: Record<string, string | number | boolean> = {}): void => {
    if (!active) return
    const prefixed: Record<string, string | number | boolean> = { 'event_properties.game_event': event }
    for (const [key, value] of Object.entries(fields)) prefixed[`event_properties.${key}`] = value
    // Monitoring must never be the thing that breaks the game.
    try {
      target.dynatrace?.sendEvent?.(prefixed)
    } catch {
      // Dropped.
    }
  }

  return {
    start() {
      if (!active || target.document === undefined) return
      const script = target.document.createElement('script')
      script.src = agentSrc
      script.crossOrigin = 'anonymous'
      script.async = true
      target.document.head.appendChild(script)
    },
    gameStarted() {
      gameStartedAt = now()
      send('game_started')
    },
    powerGained(kind) {
      send('power_gained', { power: kind })
    },
    gameOver(score, round, muted) {
      const seconds = gameStartedAt === null ? null : Math.round((now() - gameStartedAt) / 1000)
      gameStartedAt = null
      send('game_over', { score, round, muted, ...(seconds === null ? {} : { seconds }) })
    },
  }
}

export const telemetry = createTelemetry({
  enabled: TELEMETRY_ENABLED,
  // Absent outside a Vite build, which is how the tests see it.
  agentSrc: import.meta.env?.VITE_DT_RUM_SRC,
  target: globalThis as Target,
  now: () => performance.now(),
})
