import type { Sound } from './audio'

const STORAGE_KEY = 'farminvaders.muted.v1'

/** Whether the player switched sound off last time. Storage can be missing or
 *  blocked, in which case sound simply starts on. */
export function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function saveMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // Not remembered next time; nothing else depends on it.
  }
}

const SPEAKER = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>'
const WAVES =
  '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
const CROSS = '<path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'

/**
 * The sound switch in the bottom right corner. A real button, so it can be
 * reached by keyboard, plus `M` from anywhere. It gives focus straight back
 * after a click: a focused button would otherwise swallow the space bar, which
 * is the fire key, and every shot would toggle the sound instead.
 */
export function createSoundToggle(container: HTMLElement, sound: Sound): void {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'sound-toggle'
  container.appendChild(button)

  const paint = (): void => {
    const label = sound.muted ? 'Turn sound on (M)' : 'Turn sound off (M)'
    button.setAttribute('aria-label', label)
    button.title = label
    button.setAttribute('aria-pressed', String(sound.muted))
    button.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${SPEAKER}${sound.muted ? CROSS : WAVES}</svg>`
  }

  const toggle = (): void => {
    sound.setMuted(!sound.muted)
    saveMuted(sound.muted)
    paint()
  }

  button.addEventListener('click', (event) => {
    toggle()
    // A mouse click should not leave focus parked on the button; a keyboard
    // user who tabbed to it keeps it, so they can press it again.
    if (event.detail > 0) button.blur()
  })
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyM' || event.repeat) return
    if (event.target instanceof HTMLInputElement) return
    toggle()
  })

  paint()
}
