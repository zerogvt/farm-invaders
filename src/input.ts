import { VIEW } from './config'

/**
 * Input from the keyboard and from touch. Both write the same fields. On a
 * phone the player puts a finger on the playfield: the hen heads for the point
 * under it, left or right, and throws for as long as the finger is down.
 */

export interface InputState {
  left: boolean
  right: boolean
  fire: boolean
  /** Where a finger on the playfield wants the hen's middle to be, in playfield
   *  pixels, or null (or absent) with no finger down. */
  targetX?: number | null
}

/** A screen position across the canvas, as a playfield x: the canvas is
 *  CSS-scaled, so it is rescaled to the 800-wide space the game runs in. */
export function toPlayfieldX(clientX: number, canvasLeft: number, canvasWidth: number): number {
  return ((clientX - canvasLeft) / canvasWidth) * VIEW.width
}

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA'])
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD'])
const FIRE_KEYS = new Set(['Space', 'KeyW', 'ArrowUp'])

export function createInput(target: Window = window, surface?: HTMLElement): InputState {
  const state: InputState = { left: false, right: false, fire: false, targetX: null }
  const held = new Set<string>()
  // The finger steering the hen, if there is one. Only the first finger down
  // steers; a second is ignored until the first lifts.
  let finger: number | null = null

  target.addEventListener('keydown', (event) => {
    // Menus and the initials field are real form controls, so let the browser
    // handle keys aimed at them — otherwise Space would never press a button.
    if (isFormControl(event.target)) return
    // Stop the page scrolling out from under the canvas on space/arrows.
    if (LEFT_KEYS.has(event.code) || RIGHT_KEYS.has(event.code) || FIRE_KEYS.has(event.code)) {
      event.preventDefault()
    }
    if (event.repeat) return
    held.add(event.code)
    sync()
  })

  target.addEventListener('keyup', (event) => {
    held.delete(event.code)
    sync()
  })

  function isFormControl(node: EventTarget | null): boolean {
    if (!(node instanceof HTMLElement)) return false
    return node.tagName === 'INPUT' || node.tagName === 'BUTTON' || node.tagName === 'TEXTAREA'
  }

  // A window that loses focus mid-press would otherwise never see the keyup.
  target.addEventListener('blur', () => {
    held.clear()
    sync()
  })

  // Touch and pen, but not the mouse: a mouse player has the keyboard, and a
  // click on the canvas steering the hen would only surprise them.
  if (surface !== undefined) {
    const steer = (event: PointerEvent): void => {
      const rect = surface.getBoundingClientRect()
      state.targetX = toPlayfieldX(event.clientX, rect.left, rect.width)
    }
    surface.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || finger !== null) return
      finger = event.pointerId
      // Keeps the finger's moves coming even when it slides off the canvas. A
      // browser can refuse it; steering works without it, just less far.
      try {
        surface.setPointerCapture(event.pointerId)
      } catch {
        // Not captured.
      }
      event.preventDefault()
      steer(event)
      sync()
    })
    surface.addEventListener('pointermove', (event) => {
      if (event.pointerId !== finger) return
      event.preventDefault()
      steer(event)
    })
    const lift = (event: PointerEvent): void => {
      if (event.pointerId !== finger) return
      finger = null
      state.targetX = null
      sync()
    }
    surface.addEventListener('pointerup', lift)
    surface.addEventListener('pointercancel', lift)
  }

  function sync(): void {
    state.left = anyHeld(LEFT_KEYS)
    state.right = anyHeld(RIGHT_KEYS)
    state.fire = anyHeld(FIRE_KEYS) || finger !== null
  }

  function anyHeld(codes: Set<string>): boolean {
    for (const code of codes) {
      if (held.has(code)) return true
    }
    return false
  }

  return state
}
