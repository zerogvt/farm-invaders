/** Keyboard input. Desktop only for now; nothing here assumes a single layout
 *  beyond the arrow keys, so adding touch later means adding a second source
 *  that writes the same three fields. */

export interface InputState {
  left: boolean
  right: boolean
  fire: boolean
}

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA'])
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD'])
const FIRE_KEYS = new Set(['Space', 'KeyW', 'ArrowUp'])

export function createInput(target: Window = window): InputState {
  const state: InputState = { left: false, right: false, fire: false }
  const held = new Set<string>()

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

  function sync(): void {
    state.left = anyHeld(LEFT_KEYS)
    state.right = anyHeld(RIGHT_KEYS)
    state.fire = anyHeld(FIRE_KEYS)
  }

  function anyHeld(codes: Set<string>): boolean {
    for (const code of codes) {
      if (held.has(code)) return true
    }
    return false
  }

  return state
}
