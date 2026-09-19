import { BABY, BOTTLE, DIAPER, MOM, OBSTACLE } from './config'
import type { ToyKind } from './types'

/**
 * Every sprite in the game is drawn here with canvas paths — there are no image
 * files and nothing to load. The trade-off is deliberate: the art is cruder
 * than hand-drawn sprites would be, but it renders identically on every
 * platform, needs no licensing, and lets a baby's crying and feeding faces
 * share one body.
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

const SKIN = '#ffd9b3'
const SKIN_SHADE = '#f0bf92'
const BLUSH = '#ff9d9d'
const TEAR = '#7ec8f2'
const MOUTH = '#8c3b4a'

/** One onesie colour per formation row, so the ranks read apart at a glance. */
const ONESIE = ['#7fd4c1', '#8fb8f0', '#c6a6e8', '#f2b6d4', '#f5cf87', '#a8dd90']

export interface SpriteSet {
  babyCrying: HTMLCanvasElement[]
  babyFeeding: HTMLCanvasElement[]
  mom: HTMLCanvasElement
  momHurt: HTMLCanvasElement
  bottle: HTMLCanvasElement
  diaper: HTMLCanvasElement
  toys: Record<ToyKind, HTMLCanvasElement>
}

export function buildSprites(): SpriteSet {
  const crying: HTMLCanvasElement[] = []
  const feeding: HTMLCanvasElement[] = []
  for (const colour of ONESIE) {
    crying.push(sprite(BABY.width, BABY.height, (ctx, w, h) => drawBaby(ctx, w, h, colour, false)))
    feeding.push(sprite(BABY.width, BABY.height, (ctx, w, h) => drawBaby(ctx, w, h, colour, true)))
  }

  return {
    babyCrying: crying,
    babyFeeding: feeding,
    mom: sprite(MOM.width, MOM.height, (ctx, w, h) => drawMom(ctx, w, h, false)),
    momHurt: sprite(MOM.width, MOM.height, (ctx, w, h) => drawMom(ctx, w, h, true)),
    bottle: sprite(BOTTLE.width, BOTTLE.height, drawBottle),
    diaper: sprite(DIAPER.width, DIAPER.height, drawDiaper),
    toys: {
      cradle: sprite(OBSTACLE.width, OBSTACLE.height, drawCradle),
      duck: sprite(OBSTACLE.width, OBSTACLE.height, drawDuck),
      ball: sprite(OBSTACLE.width, OBSTACLE.height, drawBall),
      teddy: sprite(OBSTACLE.width, OBSTACLE.height, drawTeddy),
    },
  }
}

/** Picks the onesie colour for a formation row, wrapping if there are ever more
 *  rows than colours. */
export function rowVariant(row: number): number {
  return row % ONESIE.length
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

// --- babies ----------------------------------------------------------------

/**
 * A baby is a big head on a small swaddled body. Crying and feeding share every
 * shape except the face, which is the whole point of drawing rather than
 * loading: the player reads "I already hit that one" from the eyes and the
 * missing tears, not from a colour swap.
 */
function drawBaby(ctx: CanvasRenderingContext2D, w: number, h: number, onesie: string, feeding: boolean): void {
  const headR = w * 0.31
  const headY = h * 0.38

  // Body: a rounded onesie peeking out under the head.
  ellipse(ctx, w / 2, h * 0.78, w * 0.27, h * 0.22, onesie)
  ellipse(ctx, w * 0.22, h * 0.74, w * 0.09, h * 0.09, onesie)
  ellipse(ctx, w * 0.78, h * 0.74, w * 0.09, h * 0.09, onesie)

  // Head.
  ellipse(ctx, w / 2, headY, headR, headR * 0.94, SKIN)
  ellipse(ctx, w / 2, headY + headR * 0.55, headR * 0.72, headR * 0.34, SKIN_SHADE)
  ellipse(ctx, w / 2, headY, headR * 0.98, headR * 0.92, SKIN)

  // A single curl of hair, because a bald baby reads as an egg.
  ctx.beginPath()
  ctx.moveTo(w / 2, headY - headR * 0.92)
  ctx.quadraticCurveTo(w / 2 + w * 0.09, headY - headR * 1.5, w / 2 - w * 0.04, headY - headR * 1.45)
  ctx.strokeStyle = '#a9722f'
  ctx.lineWidth = w * 0.045
  ctx.stroke()

  ellipse(ctx, w / 2 - headR * 0.62, headY + headR * 0.18, w * 0.055, h * 0.04, BLUSH)
  ellipse(ctx, w / 2 + headR * 0.62, headY + headR * 0.18, w * 0.055, h * 0.04, BLUSH)

  const eyeY = headY - headR * 0.18
  const eyeDx = headR * 0.42

  if (feeding) {
    // Contented: closed arcs, a small smile, and a bottle tucked in.
    ctx.strokeStyle = '#4a3328'
    ctx.lineWidth = w * 0.04
    for (const dx of [-eyeDx, eyeDx]) {
      ctx.beginPath()
      ctx.arc(w / 2 + dx, eyeY + h * 0.012, headR * 0.2, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
    }
    ellipse(ctx, w / 2, headY + headR * 0.42, w * 0.06, h * 0.035, MOUTH)

    // A bottle tipped into the mouth: pink teat first, then the white body, so
    // "this one is already fed" is legible without comparing faces.
    ctx.save()
    ctx.translate(w / 2, headY + headR * 0.42)
    ctx.rotate(-0.45)
    ctx.fillStyle = '#ffb3c7'
    ctx.beginPath()
    ctx.roundRect(-w * 0.05, -h * 0.02, w * 0.1, h * 0.09, w * 0.03)
    ctx.fill()
    ctx.fillStyle = '#fdfbf6'
    ctx.beginPath()
    ctx.roundRect(-w * 0.075, h * 0.06, w * 0.15, h * 0.26, w * 0.05)
    ctx.fill()
    ctx.fillStyle = '#fff1cf'
    ctx.beginPath()
    ctx.roundRect(-w * 0.05, h * 0.12, w * 0.1, h * 0.17, w * 0.04)
    ctx.fill()
    ctx.restore()
    return
  }

  // Crying: screwed-shut eyes, a wide open mouth, and tears in flight.
  ctx.strokeStyle = '#4a3328'
  ctx.lineWidth = w * 0.04
  for (const dx of [-eyeDx, eyeDx]) {
    ctx.beginPath()
    ctx.arc(w / 2 + dx, eyeY + headR * 0.22, headR * 0.24, Math.PI * 1.1, Math.PI * 1.9, true)
    ctx.stroke()
  }
  ellipse(ctx, w / 2, headY + headR * 0.46, w * 0.09, h * 0.07, MOUTH)
  ellipse(ctx, w / 2, headY + headR * 0.62, w * 0.045, h * 0.025, '#e2717f')

  for (const dx of [-eyeDx, eyeDx]) {
    ellipse(ctx, w / 2 + dx, eyeY + headR * 0.72, w * 0.035, h * 0.05, TEAR)
    ellipse(ctx, w / 2 + dx * 1.12, eyeY + headR * 1.35, w * 0.026, h * 0.038, TEAR)
  }
}

// --- mom -------------------------------------------------------------------

/**
 * Mom has to read as an adult next to a formation of babies, which means the
 * opposite proportions: a small head on a tall body, long hair, and a dress
 * with a visible waist. An earlier version reused the babies' head-to-body
 * ratio and was indistinguishable from her own children.
 */
function drawMom(ctx: CanvasRenderingContext2D, w: number, h: number, hurt: boolean): void {
  const dress = hurt ? '#e8798c' : '#5f7fd4'
  const dressDark = hurt ? '#c75c72' : '#4a66b4'
  const headR = w * 0.16
  const headY = h * 0.17

  // Skirt: a wide flare from the waist down.
  ctx.beginPath()
  ctx.moveTo(w * 0.36, h * 0.52)
  ctx.lineTo(w * 0.64, h * 0.52)
  ctx.quadraticCurveTo(w * 0.94, h * 0.9, w * 0.9, h)
  ctx.lineTo(w * 0.1, h)
  ctx.quadraticCurveTo(w * 0.06, h * 0.9, w * 0.36, h * 0.52)
  ctx.closePath()
  ctx.fillStyle = dress
  ctx.fill()

  // Bodice, narrower than the skirt so there is a waist to see.
  ctx.fillStyle = dressDark
  ctx.beginPath()
  ctx.roundRect(w * 0.34, h * 0.29, w * 0.32, h * 0.25, w * 0.06)
  ctx.fill()

  // Arms: one down, one raised mid-throw. They start below the hairline so the
  // side locks cannot cut them off at the shoulder and leave them floating.
  ctx.strokeStyle = SKIN
  ctx.lineWidth = w * 0.075
  ctx.beginPath()
  ctx.moveTo(w * 0.38, h * 0.44)
  ctx.lineTo(w * 0.17, h * 0.56)
  ctx.moveTo(w * 0.62, h * 0.44)
  ctx.lineTo(w * 0.85, h * 0.3)
  ctx.stroke()

  // Hair as two side locks plus a crown, never a single mass under the chin:
  // a centred ellipse behind the head reads unmistakably as a beard.
  const hair = '#4a2f22'
  ellipse(ctx, w / 2 - headR * 0.92, headY + headR * 1.1, headR * 0.46, headR * 1.7, hair)
  ellipse(ctx, w / 2 + headR * 0.92, headY + headR * 1.1, headR * 0.46, headR * 1.7, hair)
  ellipse(ctx, w / 2, headY - headR * 0.12, headR * 1.24, headR * 1.16, hair)

  // Face over the hair, so chin and cheeks stay clear.
  ellipse(ctx, w / 2, headY + headR * 0.16, headR, headR * 1.04, SKIN)

  // Fringe across the forehead only.
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(w / 2, headY + headR * 0.16, headR, headR * 1.04, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = hair
  ctx.beginPath()
  ctx.ellipse(w / 2, headY - headR * 0.42, headR * 1.1, headR * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = '#3a2a20'
  ctx.beginPath()
  ctx.arc(w / 2 - headR * 0.38, headY + headR * 0.26, w * 0.018, 0, Math.PI * 2)
  ctx.arc(w / 2 + headR * 0.38, headY + headR * 0.26, w * 0.018, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = MOUTH
  ctx.lineWidth = w * 0.02
  ctx.beginPath()
  if (hurt) {
    // A frown, so a lost life is legible without reading the HUD.
    ctx.arc(w / 2, headY + headR * 1.0, headR * 0.3, Math.PI * 1.2, Math.PI * 1.8)
  } else {
    ctx.arc(w / 2, headY + headR * 0.58, headR * 0.3, Math.PI * 0.2, Math.PI * 0.8)
  }
  ctx.stroke()

  ellipse(ctx, w / 2 - headR * 0.7, headY + headR * 0.5, w * 0.024, h * 0.012, BLUSH)
  ellipse(ctx, w / 2 + headR * 0.7, headY + headR * 0.5, w * 0.024, h * 0.012, BLUSH)
}

// --- projectiles -----------------------------------------------------------

function drawBottle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Teat first so the body overlaps its base.
  ellipse(ctx, w / 2, h * 0.12, w * 0.24, h * 0.1, '#ffc6d6')
  ctx.fillStyle = '#ffb3c7'
  ctx.fillRect(w * 0.18, h * 0.14, w * 0.64, h * 0.12)

  ctx.fillStyle = '#fdfbf6'
  ctx.beginPath()
  ctx.roundRect(w * 0.08, h * 0.24, w * 0.84, h * 0.74, w * 0.3)
  ctx.fill()

  // Milk line, shy of the top so the bottle reads as full-but-not-brimming.
  ctx.fillStyle = '#fff4d9'
  ctx.beginPath()
  ctx.roundRect(w * 0.18, h * 0.4, w * 0.64, h * 0.52, w * 0.22)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillRect(w * 0.24, h * 0.34, w * 0.1, h * 0.5)
}

function drawDiaper(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Wide waistband tapering to a rounded pouch. An earlier version came to a
  // point and read as an ice-cream cone once it was spinning.
  ctx.beginPath()
  ctx.moveTo(w * 0.03, h * 0.16)
  ctx.lineTo(w * 0.97, h * 0.16)
  ctx.quadraticCurveTo(w * 0.9, h * 0.72, w * 0.62, h * 0.92)
  ctx.quadraticCurveTo(w * 0.5, h * 0.99, w * 0.38, h * 0.92)
  ctx.quadraticCurveTo(w * 0.1, h * 0.72, w * 0.03, h * 0.16)
  ctx.closePath()
  ctx.fillStyle = '#f6f3ea'
  ctx.fill()
  ctx.strokeStyle = '#c9c2ad'
  ctx.lineWidth = w * 0.05
  ctx.stroke()

  // Waistband.
  ctx.fillStyle = '#ddd6c2'
  ctx.fillRect(w * 0.03, h * 0.12, w * 0.94, h * 0.18)

  // The reason it is a hazard, big enough to survive being spun at speed.
  ellipse(ctx, w * 0.5, h * 0.58, w * 0.27, h * 0.22, '#7d5a2c')
  ellipse(ctx, w * 0.68, h * 0.48, w * 0.12, h * 0.12, '#936c36')
  ellipse(ctx, w * 0.34, h * 0.68, w * 0.11, h * 0.1, '#6b4d24')
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
