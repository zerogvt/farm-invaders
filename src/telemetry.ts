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
 * And then the player has to agree. The Dynatrace application runs in opt-in
 * mode, so the agent sets no cookies and captures nothing until it is told
 * `dtrum.enable()`. This file asks once, remembers the answer, and leaves a
 * small switch in the corner to change it.
 *
 * To remove telemetry altogether, see "Telemetry" in the README.
 */

/** The kill switch. False stops the agent loading and every event with it. */
export const TELEMETRY_ENABLED = true

const CONSENT_KEY = 'farminvaders.telemetry-consent.v1'

type Fields = Record<string, string | number | boolean>

/** The agent calls this file makes. `sendEvent` is the new RUM experience's
 *  event call, which only accepts fields under `event_properties.`; `enable`
 *  and `disable` are the opt-in switch, which the new API has no equivalent
 *  of yet, so they come from the classic `dtrum` global. */
interface RumAgent {
  sendEvent?: (fields: Fields) => void
}
interface RumClassic {
  enable?: () => void
  disable?: () => void
}

interface Target {
  document?: Document
  dynatrace?: RumAgent
  dtrum?: RumClassic
}

/** Where the player's answer is kept between visits. */
export interface ConsentStore {
  load(): boolean | null
  save(allowed: boolean): void
}

export interface Telemetry {
  /** Loads the RUM agent and, given a container, puts the consent prompt or
   *  switch in it. Call once, at startup. */
  start(container?: HTMLElement): void
  /** True or false once the player has answered; null until then. */
  consent(): boolean | null
  setConsent(allowed: boolean): void
  gameStarted(): void
  powerGained(kind: string): void
  gameOver(score: number, round: number, muted: boolean): void
}

export interface TelemetryOptions {
  enabled: boolean
  agentSrc: string | undefined
  /** Where the agent's globals live; the page's `globalThis` outside tests. */
  target: Target
  store: ConsentStore
  now: () => number
}

/** Built from options so the tests can drive it; the game uses `telemetry`. */
export function createTelemetry(options: TelemetryOptions): Telemetry {
  const { enabled, agentSrc, target, store, now } = options
  const active = enabled && typeof agentSrc === 'string' && agentSrc !== ''
  let allowed = active ? store.load() : null
  let agentLoaded = false
  let gameStartedAt: number | null = null

  // Monitoring must never be the thing that breaks the game.
  const safely = (call: () => void): void => {
    try {
      call()
    } catch {
      // Dropped.
    }
  }

  /** Tells the agent what the player said. Before the agent has loaded there
   *  is nobody to tell; it is told on arrival instead. */
  const applyConsent = (): void => {
    if (!agentLoaded || allowed === null) return
    safely(() => (allowed ? target.dtrum?.enable?.() : target.dtrum?.disable?.()))
  }

  const send = (event: string, fields: Fields = {}): void => {
    // The agent drops events while opt-in has not been given; this does not
    // rely on that.
    if (!active || allowed !== true) return
    const prefixed: Fields = { 'event_properties.game_event': event }
    for (const [key, value] of Object.entries(fields)) prefixed[`event_properties.${key}`] = value
    safely(() => target.dynatrace?.sendEvent?.(prefixed))
  }

  const telemetry: Telemetry = {
    start(container) {
      if (!active || target.document === undefined) return
      const script = target.document.createElement('script')
      script.src = agentSrc
      script.crossOrigin = 'anonymous'
      script.async = true
      script.onload = () => {
        agentLoaded = true
        applyConsent()
      }
      target.document.head.appendChild(script)
      if (container !== undefined) mountConsent(target.document, container, telemetry)
    },
    consent: () => allowed,
    setConsent(value) {
      if (!active) return
      allowed = value
      safely(() => store.save(value))
      applyConsent()
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
  return telemetry
}

/**
 * The question, then the switch. Until the player answers, a small card in the
 * bottom left corner asks; afterwards it shrinks to a "Stats on / off" pill in
 * the same place, so taking consent back is one click, as giving it was. It
 * never covers the playfield's middle and never blocks the game.
 *
 * Buttons give focus back after a mouse click, as the sound switch does: a
 * focused button would swallow the space bar, which is the fire key.
 */
function mountConsent(doc: Document, container: HTMLElement, telemetry: Telemetry): void {
  const style = doc.createElement('style')
  style.textContent = CONSENT_CSS
  doc.head.appendChild(style)

  const root = doc.createElement('div')
  root.className = 'telemetry'
  container.appendChild(root)

  const button = (label: string, onClick: () => void, className = ''): HTMLButtonElement => {
    const el = doc.createElement('button')
    el.type = 'button'
    el.textContent = label
    if (className !== '') el.className = className
    el.addEventListener('click', (event) => {
      onClick()
      paint()
      if (event.detail > 0) el.blur()
    })
    return el
  }

  const paint = (): void => {
    root.innerHTML = ''
    const allowed = telemetry.consent()
    if (allowed === null) {
      const card = doc.createElement('div')
      card.className = 'telemetry-card'
      card.setAttribute('role', 'dialog')
      card.setAttribute('aria-label', 'Anonymous gameplay stats')
      const text = doc.createElement('p')
      text.textContent =
        'Share anonymous gameplay stats (score, round, upgrades) with the developer? ' +
        'This uses Dynatrace and sets cookies.'
      const row = doc.createElement('div')
      row.className = 'telemetry-row'
      row.append(
        button('Allow', () => telemetry.setConsent(true)),
        button('No thanks', () => telemetry.setConsent(false), 'telemetry-quiet'),
      )
      card.append(text, row)
      root.appendChild(card)
    } else {
      const label = allowed ? 'Stats on' : 'Stats off'
      const pill = button(label, () => telemetry.setConsent(!allowed), 'telemetry-pill')
      pill.title = allowed ? 'Stop sharing anonymous gameplay stats' : 'Share anonymous gameplay stats'
      pill.setAttribute('aria-pressed', String(allowed))
      root.appendChild(pill)
    }
  }

  paint()
}

// Here rather than in style.css so that removing this file removes it too.
const CONSENT_CSS = `
.telemetry { position: absolute; left: 10px; bottom: 10px; max-width: min(22rem, 70%); }
.telemetry button { margin: 0; padding: 0.35rem 0.9rem; font-size: 0.8rem; }
.telemetry-card {
  padding: 0.7rem 0.8rem; border-radius: 10px; background: var(--panel);
  box-shadow: 0 0 0 1px rgba(232, 236, 247, 0.22);
}
.telemetry-card p { margin: 0 0 0.55rem; font-size: 0.78rem; line-height: 1.4; color: var(--ink-dim); }
.telemetry-row { display: flex; gap: 0.5rem; }
.telemetry .telemetry-quiet { background: transparent; color: var(--ink); box-shadow: 0 0 0 1px rgba(232, 236, 247, 0.35); }
.telemetry .telemetry-pill {
  background: rgba(12, 18, 36, 0.72); color: var(--ink-dim); font-weight: 500;
  box-shadow: 0 0 0 1px rgba(232, 236, 247, 0.22); opacity: 0.75;
}
.telemetry .telemetry-pill:hover, .telemetry .telemetry-pill:focus-visible { opacity: 1; }
`

/** The browser's storage. It can be missing or blocked, in which case the
 *  player is simply asked again next visit. */
const localConsent: ConsentStore = {
  load() {
    try {
      const value = globalThis.localStorage?.getItem(CONSENT_KEY)
      return value === 'yes' ? true : value === 'no' ? false : null
    } catch {
      return null
    }
  },
  save(allowed) {
    try {
      globalThis.localStorage?.setItem(CONSENT_KEY, allowed ? 'yes' : 'no')
    } catch {
      // Not remembered; asked again next time.
    }
  },
}

export const telemetry = createTelemetry({
  enabled: TELEMETRY_ENABLED,
  // Absent outside a Vite build, which is how the tests see it.
  agentSrc: import.meta.env?.VITE_DT_RUM_SRC,
  target: globalThis as Target,
  store: localConsent,
  now: () => performance.now(),
})
