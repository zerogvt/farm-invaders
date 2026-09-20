import {
  BLACK_HOLE,
  BOSS,
  DESERT,
  GRAMOPHONE,
  GRAVITY,
  HEN,
  LASER,
  OBSTACLE,
  PALETTE,
  POWER,
  SPLAT,
  TAUNT,
  UFO,
  VIEW,
} from './config'
import { HEN_TOP, shotSize } from './game'
import { rowVariant, type SpriteSet } from './sprites'
import type { GameState } from './types'

/** Draws one frame. `time` is seconds since the game started and drives every
 *  idle animation, so nothing here mutates game state. */
export function render(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  drawSpace(ctx, time)
  drawObstacles(ctx, state, sprites)
  drawUfos(ctx, state, sprites, time)
  drawBoss(ctx, state, sprites, time)
  drawSpeech(ctx, state)
  drawPickup(ctx, state, sprites, time)
  drawWaves(ctx, state)
  drawProjectiles(ctx, state, sprites, time)
  drawBeam(ctx, state, time)
  drawHen(ctx, state, sprites, time)
  drawShield(ctx, state, time)
  drawBlasts(ctx, state)
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

/** Toys, tumbling once an egg has knocked them loose. Everything is drawn about
 *  the toy's centre so the scuff marks turn with it rather than sliding across
 *  it. */
function drawObstacles(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  const halfWidth = OBSTACLE.width / 2
  const halfHeight = OBSTACLE.height / 2

  for (const obstacle of state.obstacles) {
    const damage = OBSTACLE.hitPoints - obstacle.health
    ctx.save()
    ctx.translate(obstacle.x + halfWidth, obstacle.y + halfHeight)
    ctx.rotate(obstacle.rotation)

    // A loose toy is a weapon, so it gets a warm glow the static ones do not —
    // otherwise a teddy bear sailing into the fleet reads as scenery drifting.
    if (obstacle.vx !== 0 || obstacle.vy !== 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const heat = ctx.createRadialGradient(0, 0, halfWidth * 0.4, 0, 0, halfWidth * 1.1)
      heat.addColorStop(0, 'rgba(255,190,110,0.35)')
      heat.addColorStop(1, 'rgba(255,140,60,0)')
      ctx.fillStyle = heat
      ctx.beginPath()
      ctx.arc(0, 0, halfWidth * 1.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // A battered toy fades as well as scuffs, so its remaining health reads
    // from across the screen rather than only up close.
    ctx.globalAlpha = 1 - damage * 0.13
    ctx.drawImage(sprites.toys[obstacle.kind], -halfWidth, -halfHeight, OBSTACLE.width, OBSTACLE.height)

    ctx.globalAlpha = 1
    ctx.fillStyle = 'rgba(5,9,21,0.82)'
    for (let i = 0; i < damage; i++) {
      const scuff = obstacle.scuffs[i]
      if (scuff === undefined) continue
      ctx.beginPath()
      ctx.arc(scuff.x - halfWidth, scuff.y - halfHeight, scuff.r, 0, Math.PI * 2)
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

    // Caught by a gravity wave: spinning on its own axis with a violet halo,
    // which is the only cue that it is about to take something else with it.
    if (ufo.state.kind === 'wobbling') {
      ctx.save()
      ctx.translate(centreX, centreY)
      ctx.globalCompositeOperation = 'lighter'
      const halo = ctx.createRadialGradient(0, 0, UFO.width * 0.15, 0, 0, UFO.width * 0.7)
      halo.addColorStop(0, 'rgba(178,120,255,0.5)')
      halo.addColorStop(1, 'rgba(130,70,220,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(0, 0, UFO.width * 0.7, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      ctx.rotate(Math.sin(time * 11 + ufo.wobblePhase) * 0.8)
      ctx.drawImage(clean, -UFO.width / 2, -UFO.height / 2, UFO.width, UFO.height)
      ctx.restore()
      continue
    }

    // Leaving: shuddering on the spot while it reels or makes its point, then
    // banking into its run for the edge. The bank is what sells the retreat as
    // flight rather than as the sprite simply sliding sideways.
    const { direction, reason, reeling, speed } = ufo.state
    const tilt =
      reeling > 0
        ? Math.sin(time * 34 + ufo.wobblePhase) * 0.13
        : direction * SPLAT.bankAngle * Math.min(1, speed / SPLAT.fleeMaxSpeed)
    const hull = reason === 'splattered' ? (sprites.ufoSplattered[variant] ?? clean) : clean

    ctx.save()
    ctx.translate(centreX, centreY)
    if (reeling <= 0) drawExhaust(ctx, direction, speed, time, ufo.wobblePhase, UFO.width)
    ctx.rotate(tilt)
    ctx.drawImage(hull, -UFO.width / 2, -UFO.height / 2, UFO.width, UFO.height)
    ctx.restore()
  }
}

/**
 * Everything that has something to say: the deserters, and the mothership's
 * reply to a heart. Drawn in a pass of their own after the hulls, so a bubble is
 * never half-covered by the saucer in front.
 */
function drawSpeech(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const ufo of state.ufos) {
    if (ufo.state.kind !== 'leaving' || ufo.state.reason !== 'deserted') continue
    drawBubble(ctx, ufo.x + UFO.width / 2, ufo.y - 2, DESERT.bubble, 150)
  }

  const boss = state.boss
  if (state.bossTaunt === null || boss === null) return
  drawBubble(ctx, boss.x + BOSS.width / 2, boss.y - 2, TAUNT.text, 250)
}

/** A speech bubble with its tail on a hull, kept inside the view so a saucer at
 *  the wall does not talk off the edge of the screen. */
function drawBubble(ctx: CanvasRenderingContext2D, centreX: number, bottomY: number, text: string, maxWidth: number): void {
  ctx.save()
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  const lines = wrapText(ctx, text, maxWidth)
  const lineHeight = 17
  const padX = 11
  const padY = 8
  let widest = 0
  for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width)

  const boxWidth = widest + padX * 2
  const boxHeight = lines.length * lineHeight + padY * 2
  const left = Math.min(Math.max(centreX - boxWidth / 2, 6), VIEW.width - boxWidth - 6)
  const top = Math.max(4, bottomY - 11 - boxHeight)
  const tailX = Math.min(Math.max(centreX, left + 14), left + boxWidth - 14)

  ctx.fillStyle = 'rgba(250,250,255,0.95)'
  ctx.beginPath()
  ctx.roundRect(left, top, boxWidth, boxHeight, 9)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(tailX - 6, top + boxHeight - 1)
  ctx.lineTo(tailX + 6, top + boxHeight - 1)
  ctx.lineTo(tailX, top + boxHeight + 10)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#1a2033'
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? '', left + boxWidth / 2, top + padY + lineHeight * (i + 0.5))
  }
  ctx.restore()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (line !== '' && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
      continue
    }
    line = candidate
  }
  if (line !== '') lines.push(line)
  return lines
}

/** Gravity waves: rings of warped space, fading as they thin out. */
function drawWaves(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const wave of state.waves) {
    const fade = 1 - wave.radius / GRAVITY.maxRadius
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(150,96,255,${fade * 0.5})`
    ctx.lineWidth = 14 * fade + 3
    ctx.beginPath()
    ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = `rgba(226,205,255,${fade * 0.8})`
    ctx.lineWidth = 3 * fade + 1
    ctx.beginPath()
    ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

/**
 * The mothership, with one egg mark blitted onto its canopy for every hit it
 * has taken. The marks are positioned once when the round starts, so damage
 * accumulates in a fixed pattern rather than rearranging itself each frame.
 */
function drawBoss(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  const boss = state.boss
  if (boss === null) return

  const retreating = boss.state.kind === 'leaving'

  ctx.save()
  ctx.translate(boss.x + BOSS.width / 2, boss.y + BOSS.height / 2)

  if (boss.state.kind === 'leaving') {
    const { direction, reeling, speed } = boss.state
    if (reeling <= 0) drawExhaust(ctx, direction, speed, time, 0, BOSS.width)
    ctx.rotate(
      reeling > 0
        ? Math.sin(time * 26) * 0.08
        : direction * SPLAT.bankAngle * Math.min(1, speed / SPLAT.fleeMaxSpeed),
    )
  } else {
    ctx.translate(0, Math.sin(time * 2.2) * 3)
  }

  ctx.drawImage(sprites.boss, -BOSS.width / 2, -BOSS.height / 2, BOSS.width, BOSS.height)

  const taken = retreating
    ? boss.splats.length
    : Math.min(boss.splats.length, Math.floor(boss.maxHitPoints - boss.hitPoints))
  for (let i = 0; i < taken; i++) {
    const splat = boss.splats[i]
    if (splat === undefined) continue
    const width = 38 * splat.scale
    const height = 32 * splat.scale
    ctx.save()
    ctx.translate(splat.x - BOSS.width / 2, splat.y - BOSS.height / 2)
    ctx.rotate(splat.rotation)
    ctx.drawImage(sprites.bossSplat, -width / 2, -height / 2, width, height)
    ctx.restore()
  }

  ctx.restore()
}

/** An engine plume trailing a hull that is leaving under protest. Drawn in the
 *  hull's untilted frame so it stays behind it, not below it. */
function drawExhaust(
  ctx: CanvasRenderingContext2D,
  direction: -1 | 1,
  speed: number,
  time: number,
  phase: number,
  size: number,
): void {
  const intensity = Math.min(1, speed / SPLAT.fleeMaxSpeed)

  // Additive radial gradients rather than flat discs. Flat discs at a low alpha
  // came out as grey smudges that read as holes in the starfield; a soft core
  // that falls off to nothing is the only version that reads as burning fuel.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    const x = -direction * size * (0.48 + i * 0.3)
    const y = Math.sin(time * 9 + phase + i) * 2
    const radius = size * (0.15 + i * 0.07)
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

/** The Rambo egg, bobbing in its corner. It flashes over its last two seconds,
 *  so a player who has not noticed it still gets a warning that it is going. */
function drawPickup(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  const pickup = state.pickup
  if (pickup === null) return
  if (pickup.remaining < 2 && Math.floor(time * 8) % 2 === 0) return

  const centreX = pickup.x + POWER.width / 2
  const centreY = pickup.y + POWER.height / 2 + Math.sin(time * 3) * 3

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createRadialGradient(centreX, centreY, POWER.width * 0.3, centreX, centreY, POWER.width * 0.95)
  glow.addColorStop(0, 'rgba(255,205,90,0.4)')
  glow.addColorStop(1, 'rgba(255,160,60,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(centreX, centreY, POWER.width * 0.95, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.drawImage(sprites.rambo, pickup.x, centreY - POWER.height / 2, POWER.width, POWER.height)
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  for (const shot of state.shots) {
    const { width, height } = shotSize(shot.kind)
    const cx = shot.x + width / 2
    const cy = shot.y + height / 2

    // The upgrades all get an additive halo painted here rather than into their
    // sprites: inside a sprite the glow competes with the shell for the same
    // pixels and comes out as a grey ring.
    if (shot.kind === 'super') glow(ctx, cx, cy, width * 1.15, 'rgba(255,208,110,0.6)', 'rgba(255,160,50,0)')
    if (shot.kind === 'heart') glow(ctx, cx, cy, width * 1.1, 'rgba(255,120,170,0.55)', 'rgba(220,50,110,0)')
    if (shot.kind === 'gramophone') {
      // Brighter as the record runs out, which is the only warning the fleet
      // gets and the only clock the player can see.
      const urgency = 1 - shot.fuse / GRAMOPHONE.fuse
      glow(ctx, cx, cy, width * (0.8 + urgency * 0.5), `rgba(255,214,120,${0.3 + urgency * 0.4})`, 'rgba(255,170,60,0)')
      drawNotes(ctx, cx, cy, time)
    }
    if (shot.kind === 'blackHole') {
      // A faint ring at the swallow reach, so what it is about to take is
      // legible before it takes it.
      const reach = BLACK_HOLE.radius * BLACK_HOLE.reach
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = 'rgba(168,104,255,0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, reach, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(shot.rotation)
    ctx.drawImage(spriteFor(sprites, shot.kind), -width / 2, -height / 2, width, height)
    ctx.restore()
  }

  for (const laser of state.lasers) {
    ctx.save()
    ctx.translate(laser.x + LASER.width / 2, laser.y + LASER.height / 2)
    // The sprite is drawn pointing down the +y axis, so this turns it to face
    // wherever the shot is actually travelling.
    ctx.rotate(Math.atan2(-laser.vx, laser.vy))
    ctx.drawImage(sprites.laser, -LASER.width / 2, -LASER.height / 2, LASER.width, LASER.height)
    ctx.restore()
  }
}

function spriteFor(sprites: SpriteSet, kind: GameState['shots'][number]['kind']): HTMLCanvasElement {
  switch (kind) {
    case 'super':
      return sprites.superEgg
    case 'heart':
      return sprites.heart
    case 'blackHole':
      return sprites.blackHole
    case 'gramophone':
      return sprites.gramophone
    case 'normal':
      return sprites.egg
  }
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, inner: string, outer: string): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const halo = ctx.createRadialGradient(x, y, radius * 0.22, x, y, radius)
  halo.addColorStop(0, inner)
  halo.addColorStop(1, outer)
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Notes drifting out of the gramophone's horn. The game has no audio, so this
 *  is the whole of "it is playing something". */
function drawNotes(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  ctx.save()
  ctx.font = '600 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 3; i++) {
    const drift = (time * 0.9 + i * 0.37) % 1
    ctx.globalAlpha = 0.85 * (1 - drift)
    ctx.fillStyle = '#ffe9a8'
    ctx.fillText(
      i % 2 === 0 ? '\u266a' : '\u266b',
      x + 16 + Math.sin(drift * 6 + i) * 9,
      y - 14 - drift * 46,
    )
  }
  ctx.restore()
}

/** The continuous beam: a hot column from the hen's helmet to the top of the
 *  view, drawn additively so whatever it crosses glows through it. */
function drawBeam(ctx: CanvasRenderingContext2D, state: GameState, time: number): void {
  if (state.power.kind !== 'beam') return
  if (state.phase.kind !== 'playing') return

  const centreX = state.hen.x + HEN.width / 2
  // A little flutter, so it reads as something being sustained rather than a
  // rectangle that has been pasted on.
  const width = POWER.beamWidth * (0.9 + Math.sin(time * 40) * 0.1)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  const glow = ctx.createLinearGradient(centreX - width * 1.6, 0, centreX + width * 1.6, 0)
  glow.addColorStop(0, 'rgba(255,170,50,0)')
  glow.addColorStop(0.5, 'rgba(255,196,80,0.5)')
  glow.addColorStop(1, 'rgba(255,170,50,0)')
  ctx.fillStyle = glow
  ctx.fillRect(centreX - width * 1.6, 0, width * 3.2, HEN_TOP)

  ctx.fillStyle = 'rgba(255,238,190,0.85)'
  ctx.fillRect(centreX - width / 2, 0, width, HEN_TOP)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fillRect(centreX - width * 0.22, 0, width * 0.44, HEN_TOP)

  // Muzzle flare where it leaves the helmet.
  const muzzle = ctx.createRadialGradient(centreX, HEN_TOP, 0, centreX, HEN_TOP, width * 2.2)
  muzzle.addColorStop(0, 'rgba(255,245,215,0.9)')
  muzzle.addColorStop(1, 'rgba(255,180,60,0)')
  ctx.fillStyle = muzzle
  ctx.beginPath()
  ctx.arc(centreX, HEN_TOP, width * 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawHen(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  // Blink while immune. The blink is what tells the player the hit registered
  // and that they are briefly safe.
  const immune = state.hen.invulnerable > 0
  if (immune && Math.floor(time * 12) % 2 === 0) return
  const sprite = immune ? sprites.henHurt : sprites.hen
  ctx.drawImage(sprite, state.hen.x, HEN_TOP, HEN.width, HEN.height)
}

/** The shield bubble. Drawn over the hen rather than under her, so it stays
 *  legible on the frames where the hurt blink has hidden her. */
function drawShield(ctx: CanvasRenderingContext2D, state: GameState, time: number): void {
  if (state.power.kind !== 'shield') return

  const centreX = state.hen.x + HEN.width / 2
  const centreY = HEN_TOP + HEN.height * 0.55
  const radius = HEN.width * 0.78
  // Pulse faster as it runs out, which is the only warning the player gets.
  const urgency = state.power.remaining < 3 ? 9 : 3
  const pulse = 0.55 + Math.sin(time * urgency) * 0.2

  ctx.save()
  const fill = ctx.createRadialGradient(centreX, centreY, radius * 0.5, centreX, centreY, radius)
  fill.addColorStop(0, 'rgba(120,220,255,0.05)')
  fill.addColorStop(1, `rgba(120,220,255,${0.22 * pulse})`)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = `rgba(180,240,255,${pulse})`
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.restore()
}

/** A super egg's shockwave: one ring racing outwards, plus a white flash over
 *  the first fifth of it. */
function drawBlasts(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const blast of state.blasts) {
    const progress = Math.min(1, blast.age / blast.duration)
    const fade = 1 - progress
    // One saucer popping and a super egg going off share this code, so the ring
    // weight is scaled to the blast rather than fixed: a pop drawn at the super
    // egg's stroke width is all stroke and no ring.
    const weight = Math.max(0.3, blast.radius / POWER.blastRadius)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // Only something screen-sized is allowed to wash out the screen.
    if (progress < 0.2 && blast.radius > POWER.blastRadius * 0.4) {
      const flash = 1 - progress / 0.2
      ctx.fillStyle = `rgba(255,248,220,${flash * 0.55})`
      ctx.fillRect(0, 0, VIEW.width, VIEW.height)
    }

    // Three passes at full saturation. A single semi-transparent stroke
    // averaged out to khaki against the sky and read as a drawn circle rather
    // than as something detonating.
    const radius = blast.radius * progress
    ctx.strokeStyle = `rgba(255,150,40,${fade * 0.8})`
    ctx.lineWidth = (26 * fade + 4) * weight
    ctx.beginPath()
    ctx.arc(blast.x, blast.y, radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = `rgba(255,224,150,${fade})`
    ctx.lineWidth = (11 * fade + 2) * weight
    ctx.beginPath()
    ctx.arc(blast.x, blast.y, radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = `rgba(255,255,255,${fade})`
    ctx.lineWidth = (4 * fade + 1) * weight
    ctx.beginPath()
    ctx.arc(blast.x, blast.y, radius * 0.94, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

/** The HUD label for whatever upgrade is active, or null on ordinary eggs. */
function powerLabel(state: GameState): string | null {
  const power = state.power
  switch (power.kind) {
    case 'none':
      return null
    case 'superEgg':
      return 'SUPER EGG — ONE SHOT'
    case 'multishot':
      return `MULTISHOT ×${power.eggs}   ${power.remaining.toFixed(1)}s`
    case 'beam':
      return `BEAM   ${power.remaining.toFixed(1)}s`
    case 'shield':
      return `SHIELD   ${power.remaining.toFixed(1)}s`
    case 'heart':
      return 'EXPLODING HEART — ONE SHOT'
    case 'gravity':
      return `GRAVITY WAVES   ${power.remaining.toFixed(1)}s`
    case 'blackHole':
      return 'BLACK HOLE — ONE SHOT'
    case 'gramophone':
      return 'GRAMOPHONE — ONE SHOT'
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  ctx.fillStyle = PALETTE.hud
  ctx.font = '600 18px system-ui, sans-serif'
  ctx.textBaseline = 'top'

  ctx.textAlign = 'left'
  ctx.fillText(`SCORE ${state.score}`, 16, 14)

  const label = powerLabel(state)
  if (label !== null) {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = PALETTE.accent
    ctx.fillText(label, 16, 38)
  }

  ctx.font = '600 18px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = PALETTE.hudDim
  ctx.fillText(`ROUND ${state.round}`, VIEW.width / 2, 14)

  // While a mothership is up, how many eggs it still owes is the only number
  // that matters, so it goes directly under the round.
  const boss = state.boss
  if (boss !== null && boss.state.kind === 'flying') {
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = PALETTE.accent
    ctx.fillText(`MOTHERSHIP — ${Math.ceil(boss.hitPoints)} EGGS LEFT`, VIEW.width / 2, 38)
  }

  // Lives as little hens, minus the one currently on the field.
  const iconWidth = 17
  const iconHeight = 18
  for (let i = 0; i < state.hen.lives - 1; i++) {
    const x = VIEW.width - 16 - iconWidth - i * (iconWidth + 6)
    ctx.drawImage(sprites.hen, x, 13, iconWidth, iconHeight)
  }
}
