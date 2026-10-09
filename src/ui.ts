import { PLAY_LIMIT_CHOICES } from './config'
import { limitLabel, type Allowance } from './playtime'
import { loadScores, qualifies, saveScore } from './scores'
import type { HighScore } from './types'
import { loadVersion, versionRows } from './version'

/**
 * Screens that sit on top of the canvas: the title card, the round banner and
 * the game-over panel. These are real DOM elements rather than canvas drawing
 * so that buttons and the initials field are focusable, keyboard-operable and
 * readable by a screen reader without any work on our part.
 */

export interface Ui {
  showTitle(onStart: () => void): void
  /** `won` after the final round, when the panel says so instead. */
  showGameOver(score: number, round: number, onRestart: () => void, won?: boolean): void
  /** The pause card: carry on, or look at the About card meanwhile. */
  showPaused(onResume: () => void): void
  /** The parents' card: the daily play allowance. `onClose` once it is saved. */
  showParents(onClose: () => void): void
  hidePanel(): void
  /** The transient "ROUND 3" / "NURSERY CLEARED" text over the playfield. */
  setBanner(text: string | null): void
}

export function createUi(root: HTMLElement, allowance: Allowance): Ui {
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
      paragraph('The saucers want the cow. You are a chicken in a space helmet. Defend the cow. Good luck.'),
      controlsList(),
      scoreBoard(loadScores()),
    )
    const start = button('Start', () => {
      panel.hidden = true
      onStart()
    })
    const limit = allowance.limit()
    const parents = button(
      limit === null ? '⚙ Parents: no daily limit' : `⚙ Parents: ${limitLabel(limit)} a day, ${Math.ceil(allowance.left() / 60)} min left today`,
      () => showParents(() => showTitle(onStart)),
    )
    parents.className = 'link'
    const about = button('ℹ About', () => void showAbout(() => showTitle(onStart)))
    about.className = 'link'
    panel.append(start, parents, about)
    start.focus()
  }

  function showParents(onClose: () => void): void {
    panel.hidden = false
    panel.innerHTML = ''
    let limit = allowance.limit()

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0'
    slider.max = String(PLAY_LIMIT_CHOICES.length - 1)
    slider.step = '1'
    slider.value = String(PLAY_LIMIT_CHOICES.indexOf(limit))
    slider.setAttribute('aria-label', 'Play time a day')
    const label = document.createElement('output')
    label.textContent = limitLabel(limit)
    slider.addEventListener('input', () => {
      limit = PLAY_LIMIT_CHOICES[Number(slider.value)] ?? null
      label.textContent = limitLabel(limit)
    })
    const row = document.createElement('div')
    row.className = 'play-limit'
    row.append(slider, label)

    const done = button('Done', () => {
      allowance.setLimit(limit)
      onClose()
    })
    panel.append(
      heading('For parents ⚙'),
      paragraph('How much play time a day?'),
      row,
      paragraph(
        `Played today: ${Math.floor(allowance.played() / 60)} min. Only time spent playing counts. ` +
          'When it runs out the game says goodnight until tomorrow.',
      ),
      done,
    )
    slider.focus()
  }

  /** Who made the game, and which build is running, to check that the last commit is the one deployed. */
  async function showAbout(onBack: () => void): Promise<void> {
    panel.hidden = false
    panel.innerHTML = ''
    const marker = document.createElement('div')
    panel.append(heading('Farm Invaders'), marker)
    const info = await loadVersion()
    // Backed out (or the game started) while version.json was loading.
    if (!marker.isConnected) return

    const logo = document.createElement('img')
    logo.className = 'maker'
    logo.src = '/ufo_zerogvt.svg'
    logo.alt = 'zerogvt'
    logo.width = 1600
    logo.height = 1000

    const line = document.createElement('p')
    line.className = 'maker-line'
    const name = document.createElement('b')
    name.textContent = 'zerogvt'
    const copyright = document.createElement('small')
    copyright.textContent = `© ${new Date().getFullYear()} zerogvt`
    line.append('A game by ', name, ' 🛸', document.createElement('br'), copyright)

    const details = document.createElement('dl')
    details.className = 'about'
    for (const [label, value] of versionRows(info)) {
      const term = document.createElement('dt')
      term.textContent = label
      const description = document.createElement('dd')
      description.textContent = value
      details.append(term, description)
    }

    const back = button('Back', onBack)
    marker.replaceWith(logo, line, details, back)
    back.focus()
  }

  function showGameOver(score: number, round: number, onRestart: () => void, won = false): void {
    const title = won ? 'The cow is safe' : 'Scrambled'
    const summary = won
      ? `You saw off all ${round} rounds with ${score} points.`
      : `You scored ${score} and made it to round ${round}.`
    panel.hidden = false
    panel.innerHTML = ''
    panel.append(heading(title), paragraph(summary))

    const finish = (board: HighScore[]): void => {
      panel.innerHTML = ''
      panel.append(
        heading(title),
        paragraph(won ? `You scored ${score} and won.` : `You scored ${score} on round ${round}.`),
        scoreBoard(board),
      )
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

  function showPaused(onResume: () => void): void {
    panel.hidden = false
    panel.innerHTML = ''
    const touch = window.matchMedia('(pointer: coarse)').matches
    panel.append(heading('Paused'), paragraph(touch ? 'The saucers will wait.' : 'The saucers will wait. P or Esc to carry on.'))
    const resume = button('Resume', onResume)
    const about = button('ℹ About', () => void showAbout(() => showPaused(onResume)))
    about.className = 'link'
    panel.append(resume, about)
    resume.focus()
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

  return { showTitle, showGameOver, showPaused, showParents, hidePanel, setBanner }
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
  // On a touch screen the keys mean nothing, so say what a finger does instead.
  const touch = window.matchMedia('(pointer: coarse)').matches
  const lines = touch
    ? ['Put a finger on the field: the hen follows it', 'She throws while your finger is down', 'Bottom right: pause, and the speaker for sound']
    : ['← → or A / D to move', 'Space to throw an egg', 'P or Esc to pause', 'M or the speaker, bottom right, for sound']
  for (const line of lines) {
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
