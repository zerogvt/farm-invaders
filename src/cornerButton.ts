export interface CornerButton {
  setVisible(visible: boolean): void
}

/** Two bars. */
export const PAUSE_ICON =
  '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'
/** A cog: a dashed thick ring makes the teeth, a solid ring the wheel. */
export const PARENTS_ICON =
  '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="3.2 2.69"/>' +
  '<circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="3"/>'

/**
 * A small round button over a corner of the playfield, styled like the sound
 * switch: the pause button during play, and the parents' button at bedtime.
 * Like the sound switch it gives focus back after a mouse click, or the space
 * bar (the fire key) would press it again on the next throw. `className` adds
 * the class that places it.
 */
export function createCornerButton(container: HTMLElement, className: string, label: string, icon: string, onPress: () => void): CornerButton {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `sound-toggle ${className}`
  button.setAttribute('aria-label', label)
  button.title = label
  button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${icon}</svg>`
  button.hidden = true
  container.appendChild(button)

  button.addEventListener('click', (event) => {
    onPress()
    if (event.detail > 0) button.blur()
  })

  return {
    setVisible(visible) {
      if (button.hidden === visible) button.hidden = !visible
    },
  }
}
