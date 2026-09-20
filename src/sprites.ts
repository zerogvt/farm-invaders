import { BLACK_HOLE, BOSS, COW, EGG, FREEZE, GRAMOPHONE, HEART, HEN, LASER, OBSTACLE, POWER, UFO } from './config'
import type { ToyKind } from './types'

/**
 * Every sprite in the game is drawn here with canvas paths — there are no image
 * files and nothing to load. The trade-off is deliberate: the art is cruder
 * than hand-drawn sprites would be, but it renders identically on every
 * platform, needs no licensing, and lets a saucer's clean and egg-covered
 * windscreens share one hull.
 *
 * Sprites are rendered once into offscreen canvases at SUPERSAMPLE resolution
 * and then blitted each frame, so the per-frame cost is a drawImage rather than
 * a few dozen path operations per entity.
 *
 * This module is the only place that knows what anything looks like. Swapping
 * the whole game over to emoji glyphs or loaded PNGs means rewriting this file
 * and nothing else.
 */

/** Sprites are drawn at this multiple of their logical size so they stay crisp
 *  when the canvas is scaled up on a large display. */
const SUPERSAMPLE = 3

const FEATHER = '#fdf4e3'
const FEATHER_SHADE = '#e6d7bd'
const FEATHER_HURT = '#ffd0d6'
const FEATHER_HURT_SHADE = '#eaaab4'
const COMB = '#e8455f'
const BEAK = '#f2a03c'
const DARK = '#22283c'

/** One hull colour per formation row, so the ranks read apart at a glance. */
const HULL = ['#8fb8f0', '#7fd4c1', '#c6a6e8', '#f2b6d4', '#f5cf87', '#a8dd90']

export interface SpriteSet {
  ufo: HTMLCanvasElement[]
  ufoSplattered: HTMLCanvasElement[]
  hen: HTMLCanvasElement
  henHurt: HTMLCanvasElement
  egg: HTMLCanvasElement
  superEgg: HTMLCanvasElement
  laser: HTMLCanvasElement
  boss: HTMLCanvasElement
  /** One egg mark, blitted repeatedly onto the mothership's canopy as it takes
   *  hits. Kept separate from the hull so the damage can build up. */
  bossSplat: HTMLCanvasElement
  rambo: HTMLCanvasElement
  heart: HTMLCanvasElement
  blackHole: HTMLCanvasElement
  gramophone: HTMLCanvasElement
  einstein: HTMLCanvasElement
  cow: HTMLCanvasElement
  toys: Record<ToyKind, HTMLCanvasElement>
}

export function buildSprites(): SpriteSet {
  const clean: HTMLCanvasElement[] = []
  const splattered: HTMLCanvasElement[] = []
  for (const colour of HULL) {
    clean.push(sprite(UFO.width, UFO.height, (ctx, w, h) => drawUfo(ctx, w, h, colour, false)))
    splattered.push(sprite(UFO.width, UFO.height, (ctx, w, h) => drawUfo(ctx, w, h, colour, true)))
  }

  return {
    ufo: clean,
    ufoSplattered: splattered,
    hen: sprite(HEN.width, HEN.height, (ctx, w, h) => drawHen(ctx, w, h, false)),
    henHurt: sprite(HEN.width, HEN.height, (ctx, w, h) => drawHen(ctx, w, h, true)),
    egg: sprite(EGG.width, EGG.height, drawEgg),
    superEgg: sprite(POWER.superEggWidth, POWER.superEggHeight, drawSuperEgg),
    laser: sprite(LASER.width, LASER.height, drawLaser),
    boss: sprite(BOSS.width, BOSS.height, drawBoss),
    bossSplat: sprite(38, 32, drawEggMark),
    rambo: sprite(POWER.width, POWER.height, drawRambo),
    heart: sprite(HEART.width, HEART.height, drawHeart),
    blackHole: sprite(BLACK_HOLE.radius * 2, BLACK_HOLE.radius * 2, drawBlackHole),
    gramophone: sprite(GRAMOPHONE.width, GRAMOPHONE.height, drawGramophone),
    einstein: sprite(FREEZE.width, FREEZE.height, drawEinstein),
    cow: sprite(COW.width, COW.height, drawCow),
    toys: {
      cradle: sprite(OBSTACLE.width, OBSTACLE.height, drawCradle),
      duck: sprite(OBSTACLE.width, OBSTACLE.height, drawDuck),
      ball: sprite(OBSTACLE.width, OBSTACLE.height, drawBall),
      teddy: sprite(OBSTACLE.width, OBSTACLE.height, drawTeddy),
    },
  }
}

/** Picks the hull colour for a formation row, wrapping if there are ever more
 *  rows than colours. */
export function rowVariant(row: number): number {
  return row % HULL.length
}

// --- drawing helpers -------------------------------------------------------

type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void

function sprite(width: number, height: number, paint: Painter): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * SUPERSAMPLE)
  canvas.height = Math.ceil(height * SUPERSAMPLE)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('2D canvas context unavailable')
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  paint(ctx, width, height)
  return canvas
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

/**
 * Nudges a hex colour towards black or white. The hull table holds one colour
 * per row and the shading is derived from it, so adding a seventh row means
 * adding one colour rather than three.
 */
function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16)
  const target = amount < 0 ? 0 : 255
  const weight = Math.abs(amount)
  const channel = (shift: number): number => {
    const base = (value >> shift) & 0xff
    return Math.round(base + (target - base) * weight)
  }
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

// --- saucers ---------------------------------------------------------------

/**
 * A flying saucer is mostly windscreen: a big glass dome on a thin hull, so
 * there is something large and obviously breakable for an egg to land on. The
 * clean and splattered versions share every shape except what is on the glass,
 * which is the whole point of drawing rather than loading — the player reads "I
 * already hit that one" from the yolk running down the canopy, not from a
 * colour swap.
 */
function drawUfo(ctx: CanvasRenderingContext2D, w: number, h: number, hull: string, splattered: boolean): void {
  const hullDark = shade(hull, -0.42)
  const hullLight = shade(hull, 0.35)

  const domeX = w * 0.5
  const domeY = h * 0.63
  const domeRx = w * 0.4
  const domeRy = h * 0.5

  // Hull: a flattened underside with a slightly brighter deck on top of it.
  ellipse(ctx, w * 0.5, h * 0.7, w * 0.49, h * 0.18, hullDark)
  ellipse(ctx, w * 0.5, h * 0.63, w * 0.49, h * 0.15, hull)

  // Canopy glass.
  const glass = ctx.createLinearGradient(0, domeY - domeRy, 0, domeY)
  glass.addColorStop(0, 'rgba(206,244,255,0.85)')
  glass.addColorStop(0.55, 'rgba(126,200,242,0.55)')
  glass.addColorStop(1, 'rgba(70,132,190,0.55)')
  ctx.beginPath()
  ctx.ellipse(domeX, domeY, domeRx, domeRy, 0, Math.PI, 0)
  ctx.fillStyle = glass
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(domeX, domeY, domeRx, domeRy, 0, Math.PI, 0)
  ctx.clip()

  if (splattered) {
    drawSplat(ctx, w, h, domeX, domeY, domeRy)
  } else {
    // A pilot, so there is somebody in there to be blinded.
    ellipse(ctx, domeX, domeY - domeRy * 0.42, w * 0.13, h * 0.17, '#9ae6a0')
    ellipse(ctx, domeX - w * 0.05, domeY - domeRy * 0.48, w * 0.028, h * 0.05, DARK)
    ellipse(ctx, domeX + w * 0.05, domeY - domeRy * 0.48, w * 0.028, h * 0.05, DARK)
  }

  // Glass highlight, last so it sits over both the pilot and the yolk.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = w * 0.035
  ctx.beginPath()
  ctx.ellipse(domeX, domeY, domeRx * 0.68, domeRy * 0.72, 0, Math.PI * 1.08, Math.PI * 1.45)
  ctx.stroke()
  ctx.restore()

  // Canopy rim, which also seals the bottom edge of the dome to the deck.
  ellipse(ctx, domeX, domeY, w * 0.45, h * 0.08, hullLight)

  // Running lights. They go out when the pilot cannot see anyway.
  const lights = splattered ? ['#6b3a46', '#6b3a46', '#6b3a46', '#6b3a46'] : ['#fff3b0', '#ff9ec4', '#a8f0ff', '#fff3b0']
  for (let i = 0; i < 4; i++) {
    const x = w * (0.18 + i * 0.213)
    ellipse(ctx, x, h * 0.74, w * 0.035, h * 0.05, lights[i] ?? '#fff3b0')
  }

  ellipse(ctx, w * 0.5, h * 0.86, w * 0.16, h * 0.06, splattered ? 'rgba(255,170,90,0.35)' : 'rgba(168,240,255,0.5)')
}

/** The egg, mid-slide down the inside of the canopy. Drawn as a few overlapping
 *  blobs rather than one shape so the edge stays irregular at any size. */
function drawSplat(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  domeX: number,
  domeY: number,
  domeRy: number,
): void {
  const white = 'rgba(250,248,238,0.95)'
  const centreY = domeY - domeRy * 0.36

  ellipse(ctx, domeX - w * 0.04, centreY, w * 0.22, h * 0.24, white)
  ellipse(ctx, domeX + w * 0.11, centreY + h * 0.06, w * 0.13, h * 0.15, white)
  ellipse(ctx, domeX - w * 0.15, centreY + h * 0.1, w * 0.1, h * 0.12, white)
  ellipse(ctx, domeX + w * 0.02, centreY - h * 0.13, w * 0.11, h * 0.1, white)

  // Runs, which are what make it read as sliding rather than painted on.
  ctx.strokeStyle = white
  ctx.lineWidth = w * 0.045
  ctx.beginPath()
  ctx.moveTo(domeX - w * 0.1, centreY + h * 0.14)
  ctx.lineTo(domeX - w * 0.12, domeY)
  ctx.moveTo(domeX + w * 0.09, centreY + h * 0.16)
  ctx.lineTo(domeX + w * 0.12, domeY)
  ctx.stroke()

  ellipse(ctx, domeX - w * 0.02, centreY + h * 0.02, w * 0.1, h * 0.13, '#ffbe2e')
  ellipse(ctx, domeX - w * 0.04, centreY - h * 0.02, w * 0.045, h * 0.05, '#ffe08a')
}

// --- the hen ---------------------------------------------------------------

/**
 * The defender is a chicken in a fishbowl space helmet. She has to read as one
 * silhouette at 50 pixels tall, so the helmet is drawn as a single bright ring
 * around a compact head rather than a realistic visor: at this size anything
 * subtler just looked like a smudge above the beak.
 */
function drawHen(ctx: CanvasRenderingContext2D, w: number, h: number, hurt: boolean): void {
  const body = hurt ? FEATHER_HURT : FEATHER
  const bodyShade = hurt ? FEATHER_HURT_SHADE : FEATHER_SHADE
  const headX = w * 0.5
  const headY = h * 0.3
  const headR = w * 0.15

  // Legs first, so the body sits over their tops.
  ctx.strokeStyle = BEAK
  ctx.lineWidth = w * 0.045
  ctx.beginPath()
  ctx.moveTo(w * 0.42, h * 0.84)
  ctx.lineTo(w * 0.4, h * 0.96)
  ctx.moveTo(w * 0.58, h * 0.84)
  ctx.lineTo(w * 0.6, h * 0.96)
  // Three toes each, splayed forward.
  for (const footX of [w * 0.4, w * 0.6]) {
    ctx.moveTo(footX - w * 0.07, h * 0.99)
    ctx.lineTo(footX, h * 0.96)
    ctx.lineTo(footX + w * 0.07, h * 0.99)
    ctx.moveTo(footX, h * 0.96)
    ctx.lineTo(footX, h)
  }
  ctx.stroke()

  // Tail feathers, sweeping up and back on her left. They leave from low on the
  // rump: struck off the shoulder instead, they read as a waving arm.
  ctx.strokeStyle = bodyShade
  ctx.lineWidth = w * 0.07
  ctx.beginPath()
  ctx.moveTo(w * 0.3, h * 0.7)
  ctx.quadraticCurveTo(w * 0.12, h * 0.68, w * 0.08, h * 0.51)
  ctx.moveTo(w * 0.3, h * 0.77)
  ctx.quadraticCurveTo(w * 0.1, h * 0.79, w * 0.03, h * 0.64)
  ctx.stroke()

  // Body.
  ellipse(ctx, w * 0.5, h * 0.68, w * 0.32, h * 0.23, body)
  ellipse(ctx, w * 0.5, h * 0.76, w * 0.26, h * 0.13, bodyShade)
  ellipse(ctx, w * 0.5, h * 0.66, w * 0.3, h * 0.2, body)

  // Wing, with two feather lines so it is not just a paler blob.
  ellipse(ctx, w * 0.66, h * 0.68, w * 0.15, h * 0.11, bodyShade)
  ctx.strokeStyle = hurt ? '#d68f9a' : '#cbb794'
  ctx.lineWidth = w * 0.018
  ctx.beginPath()
  ctx.moveTo(w * 0.57, h * 0.7)
  ctx.lineTo(w * 0.76, h * 0.7)
  ctx.moveTo(w * 0.59, h * 0.74)
  ctx.lineTo(w * 0.74, h * 0.74)
  ctx.stroke()

  // Comb, three bumps, tucked under the helmet glass.
  for (const [dx, dy, r] of [
    [-0.06, -0.05, 0.045],
    [0, -0.075, 0.05],
    [0.06, -0.05, 0.045],
  ] as const) {
    ellipse(ctx, headX + w * dx, headY + h * dy - headR * 0.72, w * r, h * (r * 0.95), COMB)
  }

  // Head and face.
  ellipse(ctx, headX, headY, headR, headR * 1.02, body)

  ctx.fillStyle = BEAK
  ctx.beginPath()
  if (hurt) {
    // An open beak: a squawk is a cheaper way to show a lost life than a
    // separate hurt pose for the whole bird.
    ctx.ellipse(headX, headY + headR * 0.52, w * 0.05, h * 0.035, 0, 0, Math.PI * 2)
  } else {
    ctx.moveTo(headX - w * 0.05, headY + headR * 0.35)
    ctx.lineTo(headX + w * 0.05, headY + headR * 0.35)
    ctx.lineTo(headX, headY + headR * 0.92)
    ctx.closePath()
  }
  ctx.fill()

  // Wattle, under the beak.
  ellipse(ctx, headX, headY + headR * 1.0, w * 0.035, h * 0.03, COMB)

  ctx.fillStyle = DARK
  ctx.beginPath()
  const eyeR = hurt ? w * 0.028 : w * 0.022
  ctx.arc(headX - headR * 0.44, headY + headR * 0.02, eyeR, 0, Math.PI * 2)
  ctx.arc(headX + headR * 0.44, headY + headR * 0.02, eyeR, 0, Math.PI * 2)
  ctx.fill()

  // Helmet: a glass bubble over the whole head, plus the collar that holds it.
  const helmetR = headR * 1.62
  const bubble = ctx.createLinearGradient(0, headY - helmetR, 0, headY + helmetR)
  bubble.addColorStop(0, 'rgba(214,248,255,0.4)')
  bubble.addColorStop(1, 'rgba(120,190,235,0.16)')
  ctx.beginPath()
  ctx.arc(headX, headY, helmetR, 0, Math.PI * 2)
  ctx.fillStyle = bubble
  ctx.fill()
  ctx.strokeStyle = 'rgba(196,240,255,0.95)'
  ctx.lineWidth = w * 0.028
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = w * 0.03
  ctx.beginPath()
  ctx.arc(headX, headY, helmetR * 0.74, Math.PI * 1.1, Math.PI * 1.45)
  ctx.stroke()

  if (hurt) {
    // A crack across the glass, so the hit registers even on the frames where
    // the blink has her on screen.
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = w * 0.022
    ctx.beginPath()
    ctx.moveTo(headX + helmetR * 0.1, headY - helmetR)
    ctx.lineTo(headX + helmetR * 0.34, headY - helmetR * 0.4)
    ctx.lineTo(headX + helmetR * 0.1, headY - helmetR * 0.1)
    ctx.lineTo(headX + helmetR * 0.42, headY + helmetR * 0.45)
    ctx.stroke()
  }

  // Collar seal.
  ctx.fillStyle = '#c9d6ec'
  ctx.beginPath()
  ctx.roundRect(headX - helmetR * 0.7, headY + helmetR * 0.82, helmetR * 1.4, h * 0.06, w * 0.02)
  ctx.fill()

  // Antenna, purely for fun, which is the only justification it needs.
  ctx.strokeStyle = '#c9d6ec'
  ctx.lineWidth = w * 0.022
  ctx.beginPath()
  ctx.moveTo(headX + helmetR * 0.62, headY - helmetR * 0.66)
  ctx.lineTo(headX + helmetR * 0.92, headY - helmetR * 1.05)
  ctx.stroke()
  ellipse(ctx, headX + helmetR * 0.96, headY - helmetR * 1.12, w * 0.035, h * 0.03, '#ffd76a')
}

// --- projectiles -----------------------------------------------------------

function drawEgg(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Two overlapping ellipses: a fat base and a narrower top. One ellipse alone
  // read as a pill, and a full bezier egg is invisible at 12 pixels wide.
  ctx.fillStyle = '#fdf6e4'
  ellipse(ctx, w * 0.5, h * 0.62, w * 0.46, h * 0.36, '#fdf6e4')
  ellipse(ctx, w * 0.5, h * 0.36, w * 0.37, h * 0.33, '#fdf6e4')

  ellipse(ctx, w * 0.5, h * 0.72, w * 0.34, h * 0.2, '#efe2c6')
  ellipse(ctx, w * 0.38, h * 0.36, w * 0.14, h * 0.14, 'rgba(255,255,255,0.9)')
}

function drawLaser(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Three stacked capsules: a wide soft glow, a saturated body, and a white
  // core. Painting the glow into the sprite keeps the render loop free of
  // shadowBlur, which is the expensive way to get the same look.
  const capsule = (inset: number, colour: string): void => {
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.roundRect(inset, inset * 0.6, w - inset * 2, h - inset * 1.2, w)
    ctx.fill()
  }
  capsule(0, 'rgba(255,74,122,0.28)')
  capsule(w * 0.18, '#ff4d7d')
  capsule(w * 0.34, '#ffe6ec')
}

// --- the mothership --------------------------------------------------------

/**
 * The boss is the same saucer grammar at four times the size: one enormous
 * canopy on a hull. It is drawn in steel and warning-red rather than the
 * pastels of the rank and file, so a boss round reads as a different kind of
 * round from the first frame.
 */
function drawBoss(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const steel = '#8794b4'
  const steelDark = '#414d6b'
  const steelLight = '#c3cde3'
  const warning = '#e8455f'

  const domeX = w * 0.5
  const domeY = h * 0.6
  const domeRx = w * 0.29
  const domeRy = h * 0.46

  // Side fins, behind the hull so they read as swept back.
  ctx.fillStyle = steelDark
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(domeX + side * w * 0.3, h * 0.52)
    ctx.lineTo(domeX + side * w * 0.52, h * 0.3)
    ctx.lineTo(domeX + side * w * 0.47, h * 0.66)
    ctx.closePath()
    ctx.fill()
  }

  // Hull.
  ellipse(ctx, w * 0.5, h * 0.7, w * 0.49, h * 0.2, steelDark)
  ellipse(ctx, w * 0.5, h * 0.62, w * 0.49, h * 0.16, steel)

  // Canopy.
  const glass = ctx.createLinearGradient(0, domeY - domeRy, 0, domeY)
  glass.addColorStop(0, 'rgba(214,246,255,0.88)')
  glass.addColorStop(0.55, 'rgba(120,196,240,0.58)')
  glass.addColorStop(1, 'rgba(58,118,178,0.6)')
  ctx.beginPath()
  ctx.ellipse(domeX, domeY, domeRx, domeRy, 0, Math.PI, 0)
  ctx.fillStyle = glass
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(domeX, domeY, domeRx, domeRy, 0, Math.PI, 0)
  ctx.clip()

  // The commander: a bigger head than the rank and file, with a brow that
  // slopes the other way. At this size the crew have to be readable, since the
  // canopy is most of what the player is shooting at.
  ellipse(ctx, domeX, domeY - domeRy * 0.4, w * 0.11, h * 0.2, '#86d98f')
  ellipse(ctx, domeX - w * 0.04, domeY - domeRy * 0.46, w * 0.024, h * 0.06, DARK)
  ellipse(ctx, domeX + w * 0.04, domeY - domeRy * 0.46, w * 0.024, h * 0.06, DARK)
  ctx.strokeStyle = DARK
  ctx.lineWidth = w * 0.012
  ctx.beginPath()
  ctx.moveTo(domeX - w * 0.075, domeY - domeRy * 0.68)
  ctx.lineTo(domeX - w * 0.015, domeY - domeRy * 0.56)
  ctx.moveTo(domeX + w * 0.075, domeY - domeRy * 0.68)
  ctx.lineTo(domeX + w * 0.015, domeY - domeRy * 0.56)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth = w * 0.018
  ctx.beginPath()
  ctx.ellipse(domeX, domeY, domeRx * 0.7, domeRy * 0.74, 0, Math.PI * 1.06, Math.PI * 1.42)
  ctx.stroke()
  ctx.restore()

  // Canopy rim and a warning stripe around the hull.
  ellipse(ctx, domeX, domeY, w * 0.34, h * 0.06, steelLight)
  ctx.fillStyle = warning
  ctx.fillRect(w * 0.06, h * 0.66, w * 0.88, h * 0.035)

  // Running lights, more of them than a scout carries.
  for (let i = 0; i < 9; i++) {
    const x = w * (0.1 + i * 0.1)
    ellipse(ctx, x, h * 0.76, w * 0.016, h * 0.032, i % 2 === 0 ? '#fff3b0' : '#a8f0ff')
  }

  // The emitter the volleys come out of.
  ellipse(ctx, w * 0.5, h * 0.87, w * 0.12, h * 0.07, steelDark)
  ellipse(ctx, w * 0.5, h * 0.87, w * 0.07, h * 0.042, '#ff6b88')
  ellipse(ctx, w * 0.5, h * 0.87, w * 0.035, h * 0.022, '#ffe6ec')
}

/** A single burst egg, blitted onto the mothership once per hit it has taken. */
function drawEggMark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const white = 'rgba(250,248,238,0.95)'
  ellipse(ctx, w * 0.46, h * 0.5, w * 0.34, h * 0.36, white)
  ellipse(ctx, w * 0.72, h * 0.6, w * 0.2, h * 0.22, white)
  ellipse(ctx, w * 0.24, h * 0.64, w * 0.16, h * 0.18, white)
  ellipse(ctx, w * 0.56, h * 0.26, w * 0.17, h * 0.16, white)
  ellipse(ctx, w * 0.46, h * 0.5, w * 0.16, h * 0.19, '#ffbe2e')
  ellipse(ctx, w * 0.41, h * 0.44, w * 0.07, h * 0.07, '#ffe08a')
}

// --- upgrades --------------------------------------------------------------

/**
 * The super egg. It has to read as "not an ordinary egg" from across the
 * playfield at a glance, so it gets a halo and a crack with light coming out of
 * it rather than just a larger version of the normal shell.
 */
function drawSuperEgg(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const halo = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.2, w * 0.5, h * 0.5, w * 0.5)
  halo.addColorStop(0, 'rgba(255,214,110,0.55)')
  halo.addColorStop(1, 'rgba(255,170,60,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, w, h)

  ellipse(ctx, w * 0.5, h * 0.62, w * 0.38, h * 0.34, '#fffaf0')
  ellipse(ctx, w * 0.5, h * 0.37, w * 0.3, h * 0.3, '#fffaf0')
  ellipse(ctx, w * 0.5, h * 0.72, w * 0.28, h * 0.18, '#f6e6c0')

  // A crack with light behind it.
  ctx.strokeStyle = '#ffc33a'
  ctx.lineWidth = w * 0.06
  ctx.beginPath()
  ctx.moveTo(w * 0.3, h * 0.42)
  ctx.lineTo(w * 0.46, h * 0.52)
  ctx.lineTo(w * 0.36, h * 0.62)
  ctx.lineTo(w * 0.56, h * 0.74)
  ctx.stroke()
  ctx.strokeStyle = '#fff6d8'
  ctx.lineWidth = w * 0.025
  ctx.stroke()

  ellipse(ctx, w * 0.36, h * 0.32, w * 0.1, h * 0.08, 'rgba(255,255,255,0.9)')
}

/**
 * The Rambo egg: bandana, scowl and a belt of ammunition. It is a pickup rather
 * than a threat, so it is drawn warm and slightly ridiculous — the player has
 * to want to shoot it, not avoid it.
 */
function drawRambo(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const shell = '#fdf3dd'

  // Body.
  ellipse(ctx, w * 0.5, h * 0.62, w * 0.4, h * 0.35, shell)
  ellipse(ctx, w * 0.5, h * 0.35, w * 0.32, h * 0.3, shell)
  ellipse(ctx, w * 0.5, h * 0.74, w * 0.3, h * 0.18, '#eee0bf')

  // Ammunition belt, slung across the shell.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(w * 0.5, h * 0.58, w * 0.42, h * 0.4, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = '#6b4a2a'
  ctx.lineWidth = h * 0.1
  ctx.beginPath()
  ctx.moveTo(w * 0.02, h * 0.52)
  ctx.lineTo(w * 0.98, h * 0.86)
  ctx.stroke()
  ctx.fillStyle = '#e8b53c'
  for (let i = 0; i < 5; i++) {
    const t = 0.1 + i * 0.2
    ellipse(ctx, w * (0.02 + t * 0.96), h * (0.52 + t * 0.34), w * 0.05, h * 0.035, '#e8b53c')
  }
  ctx.restore()

  // Bandana across the brow, with two tails streaming off to one side.
  ctx.fillStyle = '#d63b52'
  ctx.beginPath()
  ctx.roundRect(w * 0.18, h * 0.22, w * 0.64, h * 0.1, w * 0.04)
  ctx.fill()
  ctx.strokeStyle = '#d63b52'
  ctx.lineWidth = w * 0.06
  ctx.beginPath()
  ctx.moveTo(w * 0.8, h * 0.28)
  ctx.quadraticCurveTo(w * 0.98, h * 0.3, w * 0.94, h * 0.44)
  ctx.moveTo(w * 0.8, h * 0.31)
  ctx.quadraticCurveTo(w * 1.0, h * 0.4, w * 0.86, h * 0.52)
  ctx.stroke()

  // A scowl: angled brows over small hard eyes.
  ctx.strokeStyle = DARK
  ctx.lineWidth = w * 0.05
  ctx.beginPath()
  ctx.moveTo(w * 0.3, h * 0.38)
  ctx.lineTo(w * 0.44, h * 0.43)
  ctx.moveTo(w * 0.7, h * 0.38)
  ctx.lineTo(w * 0.56, h * 0.43)
  ctx.stroke()

  ctx.fillStyle = DARK
  ctx.beginPath()
  ctx.arc(w * 0.38, h * 0.48, w * 0.04, 0, Math.PI * 2)
  ctx.arc(w * 0.62, h * 0.48, w * 0.04, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#8c5a4a'
  ctx.lineWidth = w * 0.035
  ctx.beginPath()
  ctx.moveTo(w * 0.42, h * 0.6)
  ctx.lineTo(w * 0.58, h * 0.6)
  ctx.stroke()
}

/** The exploding heart. Deliberately the softest thing on the board: it is the
 *  only shot that asks rather than tells. */
function drawHeart(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const skin = ctx.createLinearGradient(0, 0, 0, h)
  skin.addColorStop(0, '#ff7fa4')
  skin.addColorStop(1, '#d82f57')

  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.96)
  ctx.bezierCurveTo(w * -0.08, h * 0.56, w * 0.14, h * 0.02, w * 0.5, h * 0.3)
  ctx.bezierCurveTo(w * 0.86, h * 0.02, w * 1.08, h * 0.56, w * 0.5, h * 0.96)
  ctx.closePath()
  ctx.fillStyle = skin
  ctx.fill()
  ctx.strokeStyle = '#ffb3c9'
  ctx.lineWidth = w * 0.035
  ctx.stroke()

  ellipse(ctx, w * 0.33, h * 0.32, w * 0.09, h * 0.07, 'rgba(255,255,255,0.75)')
}

/**
 * The black hole. Three rings and a hole: a violet lensing halo, a hot
 * accretion edge, and nothing at all in the middle. The pure black centre is
 * the point — it is the only thing in the game that is darker than the sky.
 */
function drawBlackHole(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const r = Math.min(w, h) / 2

  const halo = ctx.createRadialGradient(r, r, r * 0.55, r, r, r)
  halo.addColorStop(0, 'rgba(150,90,230,0)')
  halo.addColorStop(0.7, 'rgba(168,104,255,0.55)')
  halo.addColorStop(1, 'rgba(120,60,200,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(r, r, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#ffb14a'
  ctx.lineWidth = r * 0.2
  ctx.beginPath()
  ctx.arc(r, r, r * 0.76, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,240,200,0.9)'
  ctx.lineWidth = r * 0.07
  ctx.beginPath()
  ctx.arc(r, r, r * 0.76, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.arc(r, r, r * 0.66, 0, Math.PI * 2)
  ctx.fill()
}

/** The gramophone: horn, record and crank. There is no audio in the game, so
 *  the notes drifting out of it in the renderer are doing all the work of
 *  saying that it is playing. */
function drawGramophone(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Horn, opening up and to the right.
  const brass = ctx.createLinearGradient(w * 0.3, h * 0.5, w * 0.95, h * 0.05)
  brass.addColorStop(0, '#9c6a22')
  brass.addColorStop(0.5, '#e8b84e')
  brass.addColorStop(1, '#ffe9a8')

  ctx.beginPath()
  ctx.moveTo(w * 0.34, h * 0.56)
  ctx.quadraticCurveTo(w * 0.5, h * 0.12, w * 0.93, h * 0.06)
  ctx.quadraticCurveTo(w * 1.0, h * 0.34, w * 0.62, h * 0.52)
  ctx.quadraticCurveTo(w * 0.48, h * 0.62, w * 0.34, h * 0.56)
  ctx.closePath()
  ctx.fillStyle = brass
  ctx.fill()
  ctx.strokeStyle = '#8a5a1c'
  ctx.lineWidth = w * 0.022
  ctx.stroke()

  // Neck down to the box.
  ctx.strokeStyle = '#b8862c'
  ctx.lineWidth = w * 0.07
  ctx.beginPath()
  ctx.moveTo(w * 0.36, h * 0.56)
  ctx.lineTo(w * 0.3, h * 0.72)
  ctx.stroke()

  // Case.
  ctx.fillStyle = '#7b4a2a'
  ctx.beginPath()
  ctx.roundRect(w * 0.08, h * 0.7, w * 0.72, h * 0.24, w * 0.05)
  ctx.fill()
  ctx.fillStyle = '#955c34'
  ctx.beginPath()
  ctx.roundRect(w * 0.08, h * 0.7, w * 0.72, h * 0.08, w * 0.04)
  ctx.fill()

  // Record on the turntable.
  ellipse(ctx, w * 0.42, h * 0.71, w * 0.26, h * 0.07, '#2b2b33')
  ellipse(ctx, w * 0.42, h * 0.71, w * 0.05, h * 0.016, '#d8b04a')

  // Crank.
  ctx.strokeStyle = '#d8b04a'
  ctx.lineWidth = w * 0.035
  ctx.beginPath()
  ctx.moveTo(w * 0.8, h * 0.82)
  ctx.lineTo(w * 0.92, h * 0.82)
  ctx.lineTo(w * 0.92, h * 0.92)
  ctx.stroke()
}

/**
 * Einstein. Three white shapes carry the recognition — the hair, the eyebrows
 * and the moustache — but the face has to stay bigger than all of them or the
 * whole thing reads as a sheep. An earlier version buried a small face in a
 * bank of puffs and did exactly that.
 */
function drawEinstein(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const hair = '#f1f3f9'
  const hairShade = '#cdd3e2'
  const skin = '#f0c59b'

  // Hair, in two layers: a shaded mass behind and brighter puffs in front of
  // it. A single flat colour merged into one cloud, and a shaded band across
  // the forehead instead of this read as the brim of a hat.
  for (const [dx, dy, rx, ry] of [
    [0.5, 0.18, 0.37, 0.19],
    [0.14, 0.29, 0.19, 0.16],
    [0.86, 0.29, 0.19, 0.16],
    [0.1, 0.48, 0.13, 0.13],
    [0.9, 0.48, 0.13, 0.13],
  ] as const) {
    ellipse(ctx, w * dx, h * dy, w * rx, h * ry, hairShade)
  }
  for (const [dx, dy, rx, ry] of [
    [0.5, 0.2, 0.32, 0.16],
    [0.18, 0.31, 0.15, 0.13],
    [0.82, 0.31, 0.15, 0.13],
    [0.13, 0.48, 0.1, 0.1],
    [0.87, 0.48, 0.1, 0.1],
    [0.31, 0.13, 0.14, 0.09],
    [0.69, 0.13, 0.14, 0.09],
  ] as const) {
    ellipse(ctx, w * dx, h * dy, w * rx, h * ry, hair)
  }

  // Face, large enough to hold a readable expression.
  ellipse(ctx, w * 0.5, h * 0.57, w * 0.28, h * 0.29, skin)
  ellipse(ctx, w * 0.5, h * 0.44, w * 0.27, h * 0.12, '#f6d4b1')

  // Bushy brows, then the eyes beneath them.
  ctx.strokeStyle = hair
  ctx.lineWidth = w * 0.085
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(w * 0.29, h * 0.47)
  ctx.lineTo(w * 0.44, h * 0.5)
  ctx.moveTo(w * 0.71, h * 0.47)
  ctx.lineTo(w * 0.56, h * 0.5)
  ctx.stroke()

  ctx.fillStyle = DARK
  ctx.beginPath()
  ctx.arc(w * 0.385, h * 0.58, w * 0.038, 0, Math.PI * 2)
  ctx.arc(w * 0.615, h * 0.58, w * 0.038, 0, Math.PI * 2)
  ctx.fill()

  // Nose, and the moustache under it. The moustache is shaded rather than pure
  // white so it separates from the hair instead of merging into it.
  ellipse(ctx, w * 0.5, h * 0.67, w * 0.06, h * 0.045, '#dda87e')
  ellipse(ctx, w * 0.39, h * 0.76, w * 0.15, h * 0.075, hairShade)
  ellipse(ctx, w * 0.61, h * 0.76, w * 0.15, h * 0.075, hairShade)
  ellipse(ctx, w * 0.39, h * 0.745, w * 0.14, h * 0.06, hair)
  ellipse(ctx, w * 0.61, h * 0.745, w * 0.14, h * 0.06, hair)

  // Chin below the moustache, so the face does not stop at it.
  ellipse(ctx, w * 0.5, h * 0.85, w * 0.14, h * 0.06, skin)
}

/**
 * The cow. Side on, facing left, because the whole sprite exists to be pointed
 * at: the saucers open by demanding it and close by taking it, and a
 * three-quarter view of a cow at seventy pixels is a brown smudge.
 */
function drawCow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const hide = '#fbf7ef'
  const patch = '#33323c'
  const muzzle = '#f0a9b4'

  // Legs first, so the body covers their tops.
  ctx.strokeStyle = hide
  ctx.lineWidth = w * 0.065
  ctx.beginPath()
  for (const x of [0.3, 0.42, 0.66, 0.78]) {
    ctx.moveTo(w * x, h * 0.72)
    ctx.lineTo(w * x, h * 0.96)
  }
  ctx.stroke()
  ctx.strokeStyle = patch
  ctx.lineWidth = w * 0.065
  ctx.beginPath()
  for (const x of [0.3, 0.42, 0.66, 0.78]) {
    ctx.moveTo(w * x, h * 0.9)
    ctx.lineTo(w * x, h * 0.99)
  }
  ctx.stroke()

  // Tail, off the back.
  ctx.strokeStyle = hide
  ctx.lineWidth = w * 0.03
  ctx.beginPath()
  ctx.moveTo(w * 0.86, h * 0.44)
  ctx.quadraticCurveTo(w * 0.97, h * 0.52, w * 0.94, h * 0.74)
  ctx.stroke()
  ellipse(ctx, w * 0.94, h * 0.78, w * 0.03, h * 0.07, patch)

  // Barrel.
  ellipse(ctx, w * 0.56, h * 0.52, w * 0.32, h * 0.26, hide)

  // Patches, clipped to the barrel so they never float off it.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(w * 0.56, h * 0.52, w * 0.32, h * 0.26, 0, 0, Math.PI * 2)
  ctx.clip()
  ellipse(ctx, w * 0.46, h * 0.4, w * 0.11, h * 0.14, patch)
  ellipse(ctx, w * 0.72, h * 0.58, w * 0.13, h * 0.15, patch)
  ellipse(ctx, w * 0.84, h * 0.36, w * 0.08, h * 0.09, patch)
  ctx.restore()

  // Udder, because otherwise it is a bull and the joke is about milk.
  ellipse(ctx, w * 0.6, h * 0.74, w * 0.08, h * 0.06, muzzle)

  // Head, snout and ear.
  ellipse(ctx, w * 0.22, h * 0.48, w * 0.15, h * 0.18, hide)
  ellipse(ctx, w * 0.12, h * 0.58, w * 0.1, h * 0.1, muzzle)
  ellipse(ctx, w * 0.09, h * 0.56, w * 0.02, h * 0.02, '#c9808d')
  ellipse(ctx, w * 0.15, h * 0.61, w * 0.02, h * 0.02, '#c9808d')
  ellipse(ctx, w * 0.31, h * 0.38, w * 0.06, h * 0.05, hide)
  ellipse(ctx, w * 0.2, h * 0.3, w * 0.05, h * 0.05, patch)

  // Horn nub and eye.
  ctx.strokeStyle = '#d9cdb2'
  ctx.lineWidth = w * 0.025
  ctx.beginPath()
  ctx.moveTo(w * 0.24, h * 0.32)
  ctx.lineTo(w * 0.27, h * 0.25)
  ctx.stroke()
  ellipse(ctx, w * 0.19, h * 0.46, w * 0.022, h * 0.03, DARK)
}

// --- toys ------------------------------------------------------------------

function drawCradle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Rocker.
  ctx.strokeStyle = '#8b5e3c'
  ctx.lineWidth = h * 0.09
  ctx.beginPath()
  ctx.arc(w / 2, h * 0.42, w * 0.44, Math.PI * 0.12, Math.PI * 0.88)
  ctx.stroke()

  // Basket.
  ctx.fillStyle = '#c08a58'
  ctx.beginPath()
  ctx.moveTo(w * 0.14, h * 0.4)
  ctx.lineTo(w * 0.86, h * 0.4)
  ctx.lineTo(w * 0.74, h * 0.78)
  ctx.lineTo(w * 0.26, h * 0.78)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#f2b6d4'
  ctx.fillRect(w * 0.2, h * 0.38, w * 0.6, h * 0.12)

  // Hood.
  ctx.fillStyle = '#a8dd90'
  ctx.beginPath()
  ctx.arc(w * 0.32, h * 0.4, w * 0.2, Math.PI, 0)
  ctx.fill()
}

function drawDuck(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ellipse(ctx, w * 0.52, h * 0.66, w * 0.34, h * 0.26, '#ffd24a')
  ellipse(ctx, w * 0.34, h * 0.36, w * 0.21, h * 0.24, '#ffd24a')

  // Tail.
  ctx.fillStyle = '#ffd24a'
  ctx.beginPath()
  ctx.moveTo(w * 0.84, h * 0.6)
  ctx.lineTo(w * 0.98, h * 0.42)
  ctx.lineTo(w * 0.88, h * 0.74)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#f2913c'
  ctx.beginPath()
  ctx.moveTo(w * 0.17, h * 0.36)
  ctx.lineTo(w * 0.02, h * 0.44)
  ctx.lineTo(w * 0.17, h * 0.5)
  ctx.closePath()
  ctx.fill()

  ellipse(ctx, w * 0.3, h * 0.3, w * 0.035, h * 0.045, '#3a2a20')
  ellipse(ctx, w * 0.6, h * 0.62, w * 0.16, h * 0.1, '#f7c02f')
}

function drawBall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const r = Math.min(w, h) * 0.46
  const wedges = ['#ff8fa3', '#ffd24a', '#7fd4c1', '#8fb8f0', '#c6a6e8', '#fdfbf6']

  for (let i = 0; i < wedges.length; i++) {
    ctx.beginPath()
    ctx.moveTo(w / 2, h / 2)
    ctx.arc(w / 2, h / 2, r, (i / wedges.length) * Math.PI * 2, ((i + 1) / wedges.length) * Math.PI * 2)
    ctx.closePath()
    ctx.fillStyle = wedges[i] ?? '#fdfbf6'
    ctx.fill()
  }

  ellipse(ctx, w / 2 - r * 0.3, h / 2 - r * 0.34, r * 0.22, r * 0.14, 'rgba(255,255,255,0.65)')
}

function drawTeddy(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const fur = '#a9754a'
  const snout = '#e4c49a'

  ellipse(ctx, w * 0.28, h * 0.28, w * 0.1, h * 0.12, fur)
  ellipse(ctx, w * 0.62, h * 0.28, w * 0.1, h * 0.12, fur)
  ellipse(ctx, w * 0.45, h * 0.72, w * 0.26, h * 0.26, fur)

  // Limbs.
  ellipse(ctx, w * 0.16, h * 0.72, w * 0.1, h * 0.11, fur)
  ellipse(ctx, w * 0.74, h * 0.72, w * 0.1, h * 0.11, fur)
  ellipse(ctx, w * 0.32, h * 0.95, w * 0.11, h * 0.09, fur)
  ellipse(ctx, w * 0.58, h * 0.95, w * 0.11, h * 0.09, fur)

  ellipse(ctx, w * 0.45, h * 0.38, w * 0.22, h * 0.24, fur)
  ellipse(ctx, w * 0.45, h * 0.46, w * 0.11, h * 0.1, snout)

  ctx.fillStyle = '#3a2a20'
  ctx.beginPath()
  ctx.arc(w * 0.35, h * 0.31, w * 0.025, 0, Math.PI * 2)
  ctx.arc(w * 0.55, h * 0.31, w * 0.025, 0, Math.PI * 2)
  ctx.fill()
  // Nose sits on the snout, well clear of the eyes — bunched together they
  // merged into one dark bar that read as sunglasses.
  ellipse(ctx, w * 0.45, h * 0.44, w * 0.032, h * 0.026, '#3a2a20')
}
