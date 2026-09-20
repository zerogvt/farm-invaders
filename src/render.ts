import { EGG, HEN, LASER, OBSTACLE, PALETTE, SPLAT, UFO, VIEW } from './config'
import { HEN_TOP } from './game'
import { rowVariant, type SpriteSet } from './sprites'
import type { GameState } from './types'

/** Draws one frame. `time` is seconds since the game started and drives every
 *  idle animation, so nothing here mutates game state. */
export function render(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  drawSpace(ctx, time)
  drawObstacles(ctx, state, sprites)
  drawUfos(ctx, state, sprites, time)
  drawProjectiles(ctx, state, sprites)
  drawHen(ctx, state, sprites, time)
  drawHud(ctx, state, sprites)
}

interface Star {
  x: number
  y: number
  r: number
  phase: number
  speed: number
}

/**
 * The starfield is generated once from a fixed seed rather than from
 * Math.random, so the sky is the same on every run and across a reload. A
 * background that reshuffles itself every time the module is re-evaluated reads
 * as flicker rather than as space.
 */
const STARS: Star[] = buildStars(110)

function buildStars(count: number): Star[] {
  let seed = 0x5eed1234
  const random = (): number => {
    // A 32-bit LCG. Nothing here needs statistical quality, only repeatability.
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }

  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: random() * VIEW.width,
      y: random() * (HEN_TOP - 10),
      r: 0.5 + random() * 1.4,
      phase: random() * Math.PI * 2,
      speed: 0.6 + random() * 1.8,
    })
  }
  return stars
}

function drawSpace(ctx: CanvasRenderingContext2D, time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height)
  sky.addColorStop(0, PALETTE.backgroundGlow)
  sky.addColorStop(1, PALETTE.background)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, VIEW.width, VIEW.height)

  // A nebula smudge, low contrast so it never competes with a saucer.
  const nebula = ctx.createRadialGradient(VIEW.width * 0.2, 90, 10, VIEW.width * 0.2, 90, 260)
  nebula.addColorStop(0, 'rgba(120,90,200,0.18)')
  nebula.addColorStop(1, 'rgba(120,90,200,0)')
  ctx.fillStyle = nebula
  ctx.fillRect(0, 0, VIEW.width, VIEW.height)

  for (const star of STARS) {
    // Twinkle between half and full brightness; never all the way off, which
    // reads as a dead pixel rather than a star.
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * star.speed + star.phase)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // The line the saucers must not cross.
  ctx.strokeStyle = PALETTE.floorLine
  ctx.lineWidth = 2
  ctx.setLineDash([9, 9])
  ctx.beginPath()
  ctx.moveTo(0, HEN_TOP - 6)
  ctx.lineTo(VIEW.width, HEN_TOP - 6)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawObstacles(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  for (const obstacle of state.obstacles) {
    const damage = OBSTACLE.hitPoints - obstacle.health
    ctx.save()
    // A battered toy fades as well as scuffs, so its remaining health reads
    // from across the screen rather than only up close.
    ctx.globalAlpha = 1 - damage * 0.13
    ctx.drawImage(sprites.toys[obstacle.kind], obstacle.x, obstacle.y, OBSTACLE.width, OBSTACLE.height)

    ctx.globalAlpha = 1
    ctx.fillStyle = 'rgba(5,9,21,0.82)'
    for (let i = 0; i < damage; i++) {
      const scuff = obstacle.scuffs[i]
      if (scuff === undefined) continue
      ctx.beginPath()
      ctx.arc(obstacle.x + scuff.x, obstacle.y + scuff.y, scuff.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

function drawUfos(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  for (const ufo of state.ufos) {
    const variant = rowVariant(ufo.row)
    const centreX = ufo.x + UFO.width / 2
    const centreY = ufo.y + UFO.height / 2
    const clean = sprites.ufo[variant] ?? sprites.ufo[0]!

    if (ufo.state.kind === 'flying') {
      const hover = Math.sin(time * 4.5 + ufo.wobblePhase) * 1.8
      ctx.drawImage(clean, ufo.x, ufo.y + hover, UFO.width, UFO.height)
      continue
    }

    // Splattered: shuddering on the spot while it reels, then banking into its
    // run for the edge. The bank is what sells the retreat as flight rather
    // than as the sprite simply sliding sideways.
    const { direction, reeling, speed } = ufo.state
    const tilt =
      reeling > 0
        ? Math.sin(time * 34 + ufo.wobblePhase) * 0.13
        : direction * SPLAT.bankAngle * Math.min(1, speed / SPLAT.fleeMaxSpeed)

    ctx.save()
    ctx.translate(centreX, centreY)
    if (reeling <= 0) drawExhaust(ctx, direction, speed, time, ufo.wobblePhase)
    ctx.rotate(tilt)
    ctx.drawImage(sprites.ufoSplattered[variant] ?? clean, -UFO.width / 2, -UFO.height / 2, UFO.width, UFO.height)
    ctx.restore()
  }
}

/** An engine plume trailing a saucer that is leaving under protest. Drawn in
 *  the saucer's untilted frame so it stays behind the hull, not below it. */
function drawExhaust(
  ctx: CanvasRenderingContext2D,
  direction: -1 | 1,
  speed: number,
  time: number,
  phase: number,
): void {
  const intensity = Math.min(1, speed / SPLAT.fleeMaxSpeed)

  // Additive radial gradients rather than flat discs. Flat discs at a low alpha
  // came out as grey smudges that read as holes in the starfield; a soft core
  // that falls off to nothing is the only version that reads as burning fuel.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    const x = -direction * UFO.width * (0.48 + i * 0.3)
    const y = Math.sin(time * 9 + phase + i) * 2
    const radius = UFO.width * (0.15 + i * 0.07)
    const alpha = (0.8 - i * 0.22) * intensity

    const plume = ctx.createRadialGradient(x, y, 0, x, y, radius)
    plume.addColorStop(0, `rgba(255,214,150,${alpha})`)
    plume.addColorStop(0.45, `rgba(255,145,60,${alpha * 0.5})`)
    plume.addColorStop(1, 'rgba(255,110,40,0)')
    ctx.fillStyle = plume
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  for (const egg of state.eggs) {
    ctx.save()
    ctx.translate(egg.x + EGG.width / 2, egg.y + EGG.height / 2)
    ctx.rotate(egg.rotation)
    ctx.drawImage(sprites.egg, -EGG.width / 2, -EGG.height / 2, EGG.width, EGG.height)
    ctx.restore()
  }

  for (const laser of state.lasers) {
    ctx.drawImage(sprites.laser, laser.x, laser.y, LASER.width, LASER.height)
  }
}

function drawHen(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  // Blink while immune. The blink is what tells the player the hit registered
  // and that they are briefly safe.
  const immune = state.hen.invulnerable > 0
  if (immune && Math.floor(time * 12) % 2 === 0) return
  const sprite = immune ? sprites.henHurt : sprites.hen
  ctx.drawImage(sprite, state.hen.x, HEN_TOP, HEN.width, HEN.height)
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  ctx.fillStyle = PALETTE.hud
  ctx.font = '600 18px system-ui, sans-serif'
  ctx.textBaseline = 'top'

  ctx.textAlign = 'left'
  ctx.fillText(`SCORE ${state.score}`, 16, 14)

  ctx.textAlign = 'center'
  ctx.fillStyle = PALETTE.hudDim
  ctx.fillText(`ROUND ${state.round}`, VIEW.width / 2, 14)

  // Lives as little hens, minus the one currently on the field.
  const iconWidth = 17
  const iconHeight = 18
  for (let i = 0; i < state.hen.lives - 1; i++) {
    const x = VIEW.width - 16 - iconWidth - i * (iconWidth + 6)
    ctx.drawImage(sprites.hen, x, 13, iconWidth, iconHeight)
  }
}
