import { createSound } from './audio'
import { ABDUCTION, PARLEY_SHIP, VIEW } from './config'
import { bossHitPoints, createGame, isBossRound, restart, update, type GameEvents } from './game'
import { createInput } from './input'
import { render } from './render'
import { buildSprites } from './sprites'
import type { Gained, GameState } from './types'
import { createSoundToggle, loadMuted } from './soundToggle'
import { telemetry } from './telemetry'
import { createUi } from './ui'
import './style.css'

type Screen = 'title' | 'running' | 'over'

/** How long a picked-up upgrade is announced over the playfield. */
const NOTICE_DURATION = 2.2

function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage')
  const overlay = document.querySelector<HTMLElement>('#overlay')
  const frameEl = document.querySelector<HTMLElement>('#game')
  if (canvas === null || overlay === null || frameEl === null) {
    throw new Error('missing #game, #stage or #overlay in the document')
  }

  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('this browser has no 2D canvas context')

  telemetry.start(frameEl)
  const sprites = buildSprites()
  const input = createInput()
  const ui = createUi(overlay)
  const game = createGame()

  // Browsers keep audio off until the page has been clicked or typed at, so
  // the first of either starts it — the title screen's button is enough.
  const sound = createSound(loadMuted())
  const unlock = (): void => sound.unlock()
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
  createSoundToggle(frameEl, sound)

  let screen: Screen = 'title'
  // A transient line over the playfield, used for upgrade pickups. The
  // simulation announces the pickup and the UI decides what to say about it,
  // which is why this timer lives here rather than in the game state.
  let notice: { text: string; remaining: number } | null = null

  const events: GameEvents = {
    onPowerGained: (power) => {
      notice = { text: noticeFor(power), remaining: NOTICE_DURATION }
      sound.play('powerUp')
      telemetry.powerGained(power.kind)
    },
    onExtraLife: () => {
      notice = { text: 'Extra life', remaining: NOTICE_DURATION }
      sound.play('extraLife')
    },
    onShot: (kind, wingman) => {
      // The wingman throws every 0.3s for ten seconds; hearing each one would
      // drown everything else. Her hits still make their noise.
      if (wingman) return
      if (kind === 'normal') sound.play('throw')
      else if (kind === 'gramophone') sound.play('gramophone')
      else sound.play('heavyThrow')
    },
    onUfoSplattered: () => sound.play('splat'),
    onSuperSplat: () => sound.play('superSplat'),
    onExplosion: (size) => sound.play(size === 'big' ? 'bigExplosion' : 'explosion'),
    onBossHit: () => sound.play('bossHit'),
    onBossDowned: () => sound.play('bigExplosion'),
    onLaserFired: () => sound.play('laser'),
    onLaserShotDown: () => sound.play('zap'),
    onBurp: () => sound.play('burp'),
    onHeartBurst: () => sound.play('heart'),
    onGravityWave: () => sound.play('wave'),
    onFreeze: () => sound.play('freeze'),
    onFoxThrown: () => sound.play('fox'),
    onBlackHole: () => sound.play('blackHole'),
    onBossWipe: () => sound.play('wipe'),
    onToyKicked: () => sound.play('bonk'),
    onHenHurt: () => sound.play('hurt'),
    onRoundCleared: () => sound.play('moo'),
    // The mothership's refusal is worth a line of its own: it is also the
    // moment the hen is handed a super egg instead.
    onBossTaunt: () => {
      notice = { text: 'Super egg — one shot', remaining: NOTICE_DURATION }
    },
    onGameOver: (score, round) => {
      telemetry.gameOver(score, round, sound.muted)
      screen = 'over'
      notice = null
      ui.setBanner(null)
      ui.showGameOver(score, round, () => {
        restart(game)
        sound.setTrack('theme')
        telemetry.gameStarted()
        screen = 'running'
      })
    },
  }

  ui.showTitle(() => {
    restart(game)
    telemetry.gameStarted()
    screen = 'running'
  })

  fitCanvas(canvas, ctx)
  window.addEventListener('resize', () => fitCanvas(canvas, ctx))

  // Which line of the opening exchange has been voiced, so each is said once.
  let voicedLine: number | null = null

  let previous = performance.now()
  const frame = (now: number): void => {
    // A backgrounded tab resumes with an enormous gap. Clamping it means the
    // game pauses while hidden instead of teleporting every laser past the hen.
    const dt = Math.min(0.05, (now - previous) / 1000)
    previous = now

    if (screen === 'running') {
      const before = game.phase.kind
      update(game, dt, input, events)
      // The abduction is entered from several places in the simulation, so its
      // moo is keyed off the phase changing rather than an event of its own.
      // It is timed to the cow's speech bubble appearing.
      if (before !== 'abduction' && phaseOf(game) === 'abduction') {
        sound.play('longMoo', ABDUCTION.beamOn + 0.2)
      }
      // The opening exchange is voiced line by line: the mothership once it has
      // slid in and stopped, the hen as soon as it is her turn.
      if (game.phase.kind === 'parley') {
        const line = game.phase.line
        if (line !== voicedLine) {
          if (line === 0) sound.play('bossDemand', PARLEY_SHIP.arrive)
          if (line === 1) sound.play('henNever')
          voicedLine = line
        }
      } else {
        voicedLine = null
      }
      // A mothership round gets its own march. The closing scene keeps
      // whatever was playing when the last hen fell.
      if (game.phase.kind !== 'abduction' && game.phase.kind !== 'over') {
        sound.setTrack(game.boss !== null ? 'boss' : 'theme')
      }
      if (notice !== null) {
        notice.remaining -= dt
        if (notice.remaining <= 0) notice = null
      }
      // A fresh upgrade outranks the round banner: the player has two seconds
      // to learn what they are now holding.
      ui.setBanner(notice?.text ?? bannerFor(game))
    }

    render(ctx, game, sprites, now / 1000)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/** Read through a call so the compiler does not carry a narrowing from before
 *  `update` ran across to after it. */
function phaseOf(game: GameState): GameState['phase']['kind'] {
  return game.phase.kind
}

function bannerFor(game: GameState): string | null {
  switch (game.phase.kind) {
    // The opening argument and the closing abduction both speak for themselves
    // on the canvas, in bubbles, so the banner stays out of their way.
    case 'parley':
    case 'abduction':
      return null
    case 'intro':
      // The boss round says what it is going to cost before it starts, because
      // the answer changes every time it comes round.
      return isBossRound(game.round)
        ? `Mothership — ${bossHitPoints(game.round)} eggs`
        : 'Here they come'
    case 'cleared':
      return 'Sector cleared'
    case 'playing':
    case 'over':
      return null
  }
}

/** Every upgrade announces itself: which of the ten a Rambo egg turns into is
 *  random, so the player has no way of knowing what they are holding otherwise. */
function noticeFor(power: Gained): string {
  switch (power.kind) {
    case 'multishot':
      return `Multishot ×${power.eggs}`
    case 'superEgg':
      return 'Super egg — one shot'
    case 'beam':
      return 'Beam online'
    case 'shield':
      return 'Shield up'
    case 'heart':
      return 'Exploding heart — one shot'
    case 'gravity':
      return 'Gravity waves'
    case 'blackHole':
      return 'Black hole — one shot'
    case 'gramophone':
      return 'Gramophone — one shot'
    case 'burp':
      return 'Cow burp — one shot'
    case 'wingman':
      return 'Wingman'
    case 'none':
      return ''
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
