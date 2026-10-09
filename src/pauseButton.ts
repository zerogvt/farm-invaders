const BARS = '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'

export interface PauseButton {
  /** Shown only while a game is being played. */
  setVisible(visible: boolean): void
}

/**
 * The pause button, bottom right beside the sound switch. Like that switch it
 * gives focus back after a mouse click, or the space bar (the fire key) would
 * press it again on the next throw. P and Esc are wired in main.ts, since they
 * also resume.
 */
export function createPauseButton(container: HTMLElement, onPress: () => void): PauseButton {
  const button = document.createElement('button')
  button.type = 'button'
  // Shares the sound switch's look; .pause-toggle only moves it along.
  button.className = 'sound-toggle pause-toggle'
  button.setAttribute('aria-label', 'Pause (P)')
  button.title = 'Pause (P)'
  button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${BARS}</svg>`
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
