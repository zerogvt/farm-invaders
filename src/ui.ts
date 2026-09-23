import { loadScores, qualifies, saveScore } from './scores'
import type { HighScore } from './types'

/**
 * Screens that sit on top of the canvas: the title card, the round banner and
 * the game-over panel. These are real DOM elements rather than canvas drawing
 * so that buttons and the initials field are focusable, keyboard-operable and
 * readable by a screen reader without any work on our part.
 */

export interface Ui {
  showTitle(onStart: () => void): void
  showGameOver(score: number, round: number, onRestart: () => void): void
  hidePanel(): void
  /** The transient "ROUND 3" / "NURSERY CLEARED" text over the playfield. */
  setBanner(text: string | null): void
}

export function createUi(root: HTMLElement): Ui {
  const panel = document.createElement('div')
  panel.className = 'panel'
  panel.hidden = true

  const banner = document.createElement('div')
  banner.className = 'banner'
  banner.hidden = true
  banner.setAttribute('aria-live', 'polite')

  root.append(panel, banner)

  function showTitle(onStart: () => void): void {
    panel.hidden = false
    panel.innerHTML = ''
    panel.append(
      heading('Farm Invaders'),
      paragraph('The saucers want the cow. You are a chicken in a space helmet. Good luck.'),
      controlsList(),
      paragraph(
        'An egg does not shoot a saucer down — it bursts on the windscreen. The pilot ' +
          'reels, drops out of the formation, and limps off the nearest edge of the screen. ' +
          'Toys on the floor soak up anything that hits them, from either side — and an egg ' +
          'that meets a laser shoots it down.',
      ),
      paragraph(
        'Every second round sends one mothership instead of a fleet: it takes as many eggs ' +
          'as the round number, answers with that many lasers at a time, and is the only ' +
          'thing out there that shoots at an angle. A tenth of every fleet loses its nerve ' +
          'and goes home on its own.',
      ),
      paragraph(
        'Watch the corners for a Rambo egg — shoot it and your eggs are upgraded to one of ' +
          'ten things you do not get to choose. Every 2000 points is another hen.',
      ),
      scoreBoard(loadScores()),
    )
    const start = button('Start', () => {
      panel.hidden = true
      onStart()
    })
    panel.append(start)
    start.focus()
  }

  function showGameOver(score: number, round: number, onRestart: () => void): void {
    panel.hidden = false
    panel.innerHTML = ''
    panel.append(
      heading('Scrambled'),
      paragraph(`You scored ${score} and made it to round ${round}.`),
    )

    const finish = (board: HighScore[]): void => {
      panel.innerHTML = ''
      panel.append(heading('Scrambled'), paragraph(`You scored ${score} on round ${round}.`), scoreBoard(board))
      const again = button('Play again', () => {
        panel.hidden = true
        onRestart()
      })
      panel.append(again)
      again.focus()
    }

    if (!qualifies(score)) {
      finish(loadScores())
      return
    }

    // High enough for the board: ask for initials before showing it.
    const form = document.createElement('form')
    form.className = 'initials'
    const label = document.createElement('label')
    label.textContent = 'High score. Initials:'
    label.htmlFor = 'initials-input'
    const field = document.createElement('input')
    field.id = 'initials-input'
    field.maxLength = 3
    field.autocomplete = 'off'
    field.placeholder = 'AAA'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.textContent = 'Save'

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const initials = field.value.trim().toUpperCase().slice(0, 3) || '???'
      finish(saveScore({ initials, score, round }))
    })

    form.append(label, field, submit)
    panel.append(form)
    field.focus()
  }

  function hidePanel(): void {
    panel.hidden = true
  }

  function setBanner(text: string | null): void {
    if (text === null) {
      banner.hidden = true
      return
    }
    // Avoid re-announcing the same text every frame.
    if (banner.textContent !== text) banner.textContent = text
    banner.hidden = false
  }

  return { showTitle, showGameOver, hidePanel, setBanner }
}

function heading(text: string): HTMLElement {
  const element = document.createElement('h1')
  element.textContent = text
  return element
}

function paragraph(text: string): HTMLElement {
  const element = document.createElement('p')
  element.textContent = text
  return element
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

function controlsList(): HTMLElement {
  const list = document.createElement('ul')
  list.className = 'controls'
  for (const line of ['← → or A / D to move', 'Space to throw an egg', 'M or the speaker, bottom right, for sound']) {
    const item = document.createElement('li')
    item.textContent = line
    list.append(item)
  }
  return list
}

function scoreBoard(scores: HighScore[]): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'scores'

  const title = document.createElement('h2')
  title.textContent = 'Top hens'
  wrapper.append(title)

  if (scores.length === 0) {
    wrapper.append(paragraph('No scores yet. These are kept in this browser only.'))
    return wrapper
  }

  const list = document.createElement('ol')
  for (const entry of scores) {
    const item = document.createElement('li')
    item.textContent = `${entry.initials} — ${entry.score} (round ${entry.round})`
    list.append(item)
  }
  wrapper.append(list)
  return wrapper
}
