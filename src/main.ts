import { VIEW } from './config'
import { createGame, restart, update, type GameEvents } from './game'
import { createInput } from './input'
import { render } from './render'
import { buildSprites } from './sprites'
import { createUi } from './ui'
import './style.css'

type Screen = 'title' | 'running' | 'over'

function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage')
  const overlay = document.querySelector<HTMLElement>('#overlay')
  if (canvas === null || overlay === null) throw new Error('missing #stage or #overlay in the document')

  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('this browser has no 2D canvas context')

  const sprites = buildSprites()
  const input = createInput()
  const ui = createUi(overlay)
  const game = createGame()

  let screen: Screen = 'title'

  const events: GameEvents = {
    onGameOver: (score, round) => {
      screen = 'over'
      ui.setBanner(null)
      ui.showGameOver(score, round, () => {
        restart(game)
        screen = 'running'
      })
    },
  }

  ui.showTitle(() => {
    restart(game)
    screen = 'running'
  })

  fitCanvas(canvas, ctx)
  window.addEventListener('resize', () => fitCanvas(canvas, ctx))

  let previous = performance.now()
  const frame = (now: number): void => {
    // A backgrounded tab resumes with an enormous gap. Clamping it means the
    // game pauses while hidden instead of teleporting every laser past the hen.
    const dt = Math.min(0.05, (now - previous) / 1000)
    previous = now

    if (screen === 'running') {
      update(game, dt, input, events)
      ui.setBanner(bannerFor(game.phase))
    }

    render(ctx, game, sprites, now / 1000)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

function bannerFor(phase: ReturnType<typeof createGame>['phase']): string | null {
  switch (phase.kind) {
    case 'intro':
      return 'Here they come'
    case 'cleared':
      return 'Sector cleared'
    case 'playing':
    case 'over':
      return null
  }
}

/**
 * The game draws in a fixed 800x600 coordinate space; CSS decides how big that
 * appears. The backing store is sized by device pixel ratio so the vector
 * sprites stay sharp on high-density displays rather than being upscaled.
 */
function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const ratio = Math.min(3, window.devicePixelRatio || 1)
  canvas.width = Math.round(VIEW.width * ratio)
  canvas.height = Math.round(VIEW.height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.imageSmoothingQuality = 'high'
}

main()
