import {
  ABDUCTION,
  BLACK_HOLE,
  BOSS,
  BURP,
  COW,
  DESERT,
  FEATHERS,
  FOX,
  FREEZE,
  GRAMOPHONE,
  GRAVITY,
  HEN,
  LASER,
  OBSTACLE,
  PALETTE,
  PARLEY,
  POWER,
  SPLAT,
  TAUNT,
  UFO,
  VIEW,
  WIPER,
} from './config'
import { bubbleCentre, featherSway, HEN_TOP, shotSize } from './game'
import { FEATHER_SIZE, rowVariant, type SpriteSet } from './sprites'
import type { GameState } from './types'

/** Draws one frame. `time` is seconds since the game started and drives every
 *  idle animation, so nothing here mutates game state. */
export function render(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  drawSpace(ctx, time)
  drawCow(ctx, state, sprites)
  drawObstacles(ctx, state, sprites)
  drawVortex(ctx, state, sprites, time)
  drawUfos(ctx, state, sprites, time)
  drawBoss(ctx, state, sprites, time)
  drawSpeech(ctx, state)
  drawPickup(ctx, state, sprites, time)
  drawWaves(ctx, state)
  drawProjectiles(ctx, state, sprites, time)
  drawFoxes(ctx, state, sprites, time)
  drawBubbles(ctx, state)
  // The wash goes over everything time has stopped, and under the hen: she is
  // the only warm thing left on the board, which is the whole point of it.
  drawFreeze(ctx, state, sprites, time)
  drawBeam(ctx, state, time)
  drawWingman(ctx, state, sprites, time)
  drawHen(ctx, state, sprites, time)
  drawShield(ctx, state, time)
  drawFeathers(ctx, state, sprites)
  drawCowSpeech(ctx, state)
  drawBlasts(ctx, state)
  drawParley(ctx, state)
  drawAbduction(ctx, state, sprites, time)
  drawHud(ctx, state, sprites)
}

/** Ground level: what the hen and the cow both stand on. */
const GROUND = HEN_TOP + HEN.height

/** Bottom of the HUD's second row, which speech bubbles keep clear of. */
const HUD_BOTTOM = 62

/** The cow, standing where it always stands. It is gone from the moment the
 *  mothership finishes lifting it, which is why the abduction draws its own. */
function drawCow(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  if (state.phase.kind === 'abduction' || state.phase.kind === 'over') return
  ctx.drawImage(sprites.cow, COW.x, GROUND - COW.height, COW.width, COW.height)
}

/** The cow's own lines: a burp when it lets one go, and a moo for every round
 *  cleared. The abduction line is the scene's, drawn there. */
function drawCowSpeech(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Over its head, which is at the right-hand end now that it faces the field.
  const centreX = COW.x + COW.width * 0.7
  const top = GROUND - COW.height
  if (state.burpLine !== null) {
    drawBubble(ctx, centreX, top - 2, BURP.line, 120)
    return
  }
  if (state.phase.kind === 'cleared') drawBubble(ctx, centreX, top - 2, COW.roundLine, 120)
}

/** The burp: soap-film bubbles, a rim, a highlight and nothing inside, so the
 *  board shows through the cloud rather than being buried under it. */
function drawBubbles(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const bubble of state.bubbles) {
    const { x, y } = bubbleCentre(bubble)
    const r = bubble.radius
    ctx.save()
    const film = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    film.addColorStop(0, 'rgba(255,255,255,0.05)')
    film.addColorStop(0.75, 'rgba(170,225,255,0.12)')
    film.addColorStop(1, 'rgba(220,170,255,0.42)')
    ctx.fillStyle = film
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(210,240,255,0.8)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, r * 0.68, Math.PI * 1.1, Math.PI * 1.45)
    ctx.stroke()
    ctx.restore()
  }
}

/** The opening exchange. The fleet speaks from above its own back rank, so the
 *  bubble never covers the saucers it belongs to. */
function drawParley(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase.kind !== 'parley') return

  if (state.phase.line === 1) {
    drawBubble(ctx, state.hen.x + HEN.width / 2, HEN_TOP - 2, PARLEY.refusal, 160)
    return
  }

  let left = Infinity
  let right = -Infinity
  let top = Infinity
  for (const ufo of state.ufos) {
    left = Math.min(left, ufo.x)
    right = Math.max(right, ufo.x + UFO.width)
    top = Math.min(top, ufo.y)
  }
  if (left === Infinity) return
  drawBubble(ctx, (left + right) / 2, top - 2, PARLEY.demand, 220)
}

/**
 * The closing scene: a mothership comes down over the cow, switches on a beam,
 * lifts it, and leaves. Everything is driven off the phase's age, so the
 * simulation counts and the renderer decides what that looks like.
 */
function drawAbduction(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  if (state.phase.kind !== 'abduction') return
  const age = state.phase.age

  // Everything that was on the board is still exactly where it stopped, so it
  // is pushed back to let the scene read.
  ctx.fillStyle = 'rgba(4,7,16,0.62)'
  ctx.fillRect(0, 0, VIEW.width, VIEW.height)

  const centreX = COW.x + COW.width / 2
  const arriving = ease(clamp01(age / ABDUCTION.beamOn))
  const leaving = ease(clamp01((age - ABDUCTION.leaveFrom) / (ABDUCTION.duration - ABDUCTION.leaveFrom)))
  const shipY = -BOSS.height + (ABDUCTION.hoverY + BOSS.height) * arriving - (ABDUCTION.hoverY + BOSS.height) * leaving

  const beamTop = shipY + BOSS.height * 0.78
  const lift = clamp01((age - ABDUCTION.liftFrom) / (ABDUCTION.liftTo - ABDUCTION.liftFrom))
  const cowY = GROUND - COW.height - (GROUND - COW.height - beamTop) * ease(lift)
  const cowScale = 1 - lift * 0.55

  if (age > ABDUCTION.beamOn && age < ABDUCTION.leaveFrom + 0.4) {
    const strength = Math.min(1, (age - ABDUCTION.beamOn) / 0.35) * (1 - leaving)
    drawTractorBeam(ctx, centreX, beamTop, strength, time)
  }

  if (lift < 1) {
    ctx.save()
    ctx.translate(centreX, cowY + COW.height / 2)
    ctx.scale(cowScale, cowScale)
    // A slow list to one side, so it reads as being carried rather than rising.
    ctx.rotate(Math.sin(time * 3.4) * 0.12 * lift)
    ctx.drawImage(sprites.cow, -COW.width / 2, -COW.height / 2, COW.width, COW.height)
    ctx.restore()

    if (age > ABDUCTION.beamOn + 0.2) {
      drawBubble(ctx, centreX, cowY - 2, COW.line, 120)
    }
  }

  ctx.drawImage(sprites.boss, centreX - BOSS.width / 2, shipY, BOSS.width, BOSS.height)
}

/** The beam itself: a widening cone with bands running down it. */
function drawTractorBeam(
  ctx: CanvasRenderingContext2D,
  centreX: number,
  top: number,
  strength: number,
  time: number,
): void {
  const bottom = GROUND
  const topHalf = BOSS.width * 0.1
  const bottomHalf = COW.width * 0.85

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = strength

  ctx.beginPath()
  ctx.moveTo(centreX - topHalf, top)
  ctx.lineTo(centreX + topHalf, top)
  ctx.lineTo(centreX + bottomHalf, bottom)
  ctx.lineTo(centreX - bottomHalf, bottom)
  ctx.closePath()

  const cone = ctx.createLinearGradient(0, top, 0, bottom)
  cone.addColorStop(0, 'rgba(190,240,255,0.55)')
  cone.addColorStop(1, 'rgba(120,200,255,0.06)')
  ctx.fillStyle = cone
  ctx.fill()

  // Bands sliding up the cone, which is what says it is pulling rather than
  // just shining.
  ctx.save()
  ctx.clip()
  ctx.fillStyle = 'rgba(220,250,255,0.16)'
  for (let i = 0; i < 5; i++) {
    const slide = ((time * 0.6 + i * 0.2) % 1)
    const y = bottom - (bottom - top) * slide
    ctx.fillRect(centreX - bottomHalf, y, bottomHalf * 2, 7)
  }
  ctx.restore()
  ctx.restore()
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Smoothstep, so the ship settles rather than snapping to a stop. */
function ease(t: number): number {
  return t * t * (3 - 2 * t)
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

/** Toys, tumbling once an egg has knocked them loose. A toy looks the same from
 *  the first frame to the last: nothing marks, holes or fades it, however many
 *  saucers it has been through. */
function drawObstacles(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  const halfWidth = OBSTACLE.width / 2
  const halfHeight = OBSTACLE.height / 2

  for (const obstacle of state.obstacles) {
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

    ctx.drawImage(sprites.toys[obstacle.kind], -halfWidth, -halfHeight, OBSTACLE.width, OBSTACLE.height)
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

    // Falling into the black hole: turning with its orbit, and shrinking as it
    // nears the middle so it reads as going in rather than stopping on top.
    if (ufo.state.kind === 'swirling') {
      ctx.save()
      ctx.translate(centreX, centreY)
      ctx.rotate(ufo.state.angle + Math.PI / 2)
      const scale = swirlScale(ufo.state.radius)
      ctx.scale(scale, scale)
      ctx.drawImage(clean, -UFO.width / 2, -UFO.height / 2, UFO.width, UFO.height)
      ctx.restore()
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

/** How big a hull falling into the black hole is drawn: full size until it is
 *  close, then down to a sliver at the swallow point. */
function swirlScale(radius: number): number {
  return Math.max(0.15, Math.min(1, radius / 110))
}

/**
 * The black hole, open in the sky: an accretion disc with spiral arms wound
 * round it, drawn under the hulls so they visibly go into it. It opens and
 * closes by scaling, so it never pops in or out.
 */
function drawVortex(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  const vortex = state.vortex
  if (vortex === null) return
  const opening = ease(clamp01(vortex.age / BLACK_HOLE.openDuration))
  const closing = ease(clamp01((BLACK_HOLE.maxDuration - vortex.age) / BLACK_HOLE.openDuration))
  const size = Math.min(opening, closing)
  const r = BLACK_HOLE.radius * size

  ctx.save()
  ctx.translate(vortex.x, vortex.y)

  ctx.globalCompositeOperation = 'lighter'
  const halo = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 4)
  halo.addColorStop(0, 'rgba(160,96,255,0.4)')
  halo.addColorStop(1, 'rgba(90,40,200,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(0, 0, r * 4, 0, Math.PI * 2)
  ctx.fill()

  // Spiral arms, turning faster than anything caught in them.
  ctx.lineWidth = 3
  for (let arm = 0; arm < 4; arm++) {
    ctx.strokeStyle = arm % 2 === 0 ? 'rgba(255,190,110,0.45)' : 'rgba(190,140,255,0.45)'
    ctx.beginPath()
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const angle = -time * 3 + arm * (Math.PI / 2) + t * Math.PI * 2.2
      const reach = r * (1 + t * 3)
      const x = Math.cos(angle) * reach
      const y = Math.sin(angle) * reach
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.translate(vortex.x, vortex.y)
  ctx.rotate(time * 4)
  ctx.drawImage(sprites.blackHole, -r, -r, r * 2, r * 2)
  ctx.restore()
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
  // Never above the HUD's two rows: a bubble that collides with the score is
  // worse than one that sits a little low over whoever is speaking.
  const top = Math.max(HUD_BOTTOM, bottomY - 11 - boxHeight)
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
  } else if (boss.state.kind === 'swirling') {
    ctx.rotate(boss.state.angle + Math.PI / 2)
    const scale = swirlScale(boss.state.radius * 0.6)
    ctx.scale(scale, scale)
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

  if (boss.wiping > 0) drawWiper(ctx, 1 - boss.wiping / WIPER.duration)

  ctx.restore()
}

/** The mothership's wiper blade, one sweep across the canopy, pivoting from
 *  below it. Drawn in the hull's own frame, centred on the hull. */
function drawWiper(ctx: CanvasRenderingContext2D, progress: number): void {
  const pivotY = BOSS.height * 0.04
  const length = BOSS.width * 0.3
  const angle = -Math.PI / 2 + (ease(progress) * 2 - 1) * 1.15

  ctx.save()
  ctx.translate(0, pivotY)
  ctx.rotate(angle)
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#3a4058'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(length, 0)
  ctx.stroke()
  ctx.strokeStyle = '#15182a'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(length * 0.35, 0)
  ctx.lineTo(length, 0)
  ctx.stroke()
  ctx.restore()
  ellipse(ctx, 0, pivotY, 4, '#5b6280')
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
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
    case 'gramophone':
      return sprites.gramophone
    case 'normal':
      return sprites.egg
  }
}

/** Radioactive foxes, in a sickly green glow that pulses so they read as
 *  dangerous at a glance, and apart from anything the hen can shoot. */
function drawFoxes(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  for (const fox of state.foxes) {
    const cx = fox.x + FOX.width / 2
    const cy = fox.y + FOX.height / 2
    const pulse = 0.4 + Math.sin(time * 9) * 0.12
    glow(ctx, cx, cy, FOX.width * 1.1, `rgba(150,255,90,${pulse})`, 'rgba(90,220,40,0)')
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(fox.rotation)
    // The sprite faces left; a fox running right is turned round to face it.
    if (fox.vx > 0) ctx.scale(-1, 1)
    ctx.drawImage(sprites.fox, -FOX.width / 2, -FOX.height / 2, FOX.width, FOX.height)
    ctx.restore()
  }
}

/** Feathers off the hen, fading out over the last third of their life. */
function drawFeathers(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  for (const feather of state.feathers) {
    const fade = clamp01((FEATHERS.life - feather.age) / (FEATHERS.life / 3))
    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(feather.x + featherSway(feather), feather.y)
    ctx.rotate(feather.rotation)
    ctx.drawImage(sprites.feather, -FEATHER_SIZE.width / 2, -FEATHER_SIZE.height / 2, FEATHER_SIZE.width, FEATHER_SIZE.height)
    ctx.restore()
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

/**
 * Stopped time: a cold wash over the board, a frost creeping in from the edges,
 * and Einstein at one side explaining himself. He is drawn after the wash
 * because he is the cause of it rather than one of its victims.
 */
function drawFreeze(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  const freeze = state.freeze
  if (freeze === null) return

  // Fade the wash in and out so time visibly stops and starts rather than
  // snapping.
  const edge = Math.min(1, Math.min(FREEZE.duration - freeze.remaining, freeze.remaining) / 0.4)

  ctx.save()
  ctx.globalAlpha = edge
  ctx.fillStyle = 'rgba(120,196,255,0.13)'
  ctx.fillRect(0, 0, VIEW.width, VIEW.height)

  const frost = ctx.createRadialGradient(
    VIEW.width / 2,
    VIEW.height / 2,
    VIEW.height * 0.32,
    VIEW.width / 2,
    VIEW.height / 2,
    VIEW.height * 0.78,
  )
  frost.addColorStop(0, 'rgba(150,220,255,0)')
  frost.addColorStop(1, 'rgba(150,220,255,0.3)')
  ctx.fillStyle = frost
  ctx.fillRect(0, 0, VIEW.width, VIEW.height)
  ctx.restore()

  const bob = Math.sin(time * 2.4) * 2
  ctx.drawImage(sprites.einstein, freeze.x, FREEZE.y + bob, FREEZE.width, FREEZE.height)
  drawBubble(ctx, freeze.x + FREEZE.width / 2, FREEZE.y + bob - 2, FREEZE.greeting, 160)
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

/** The second hen. She is never hurt, so she never blinks; she flickers over
 *  her last two seconds instead, as the Rambo egg does, to say she is going. */
function drawWingman(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  const wing = state.power
  if (wing.kind !== 'wingman') return
  if (state.phase.kind === 'abduction' || state.phase.kind === 'over') return
  if (wing.remaining < 2 && Math.floor(time * 8) % 2 === 0) return
  ctx.drawImage(sprites.wingman, wing.x, HEN_TOP, HEN.width, HEN.height)
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

/** The HUD name for whatever upgrade is active, or null on ordinary eggs. */
function powerName(power: GameState['power']): string | null {
  switch (power.kind) {
    case 'none':
      return null
    case 'multishot':
      return `MULTISHOT ×${power.eggs}`
    case 'superEgg':
      return 'SUPER EGG'
    case 'beam':
      return 'BEAM'
    case 'shield':
      return 'SHIELD'
    case 'heart':
      return 'EXPLODING HEART'
    case 'gravity':
      return 'GRAVITY WAVES'
    case 'blackHole':
      return 'BLACK HOLE'
    case 'gramophone':
      return 'GRAMOPHONE'
    case 'burp':
      return 'COW BURP'
    case 'wingman':
      return 'WINGMAN'
  }
}

/**
 * The upgrade panel: name, seconds left, and a bar draining towards zero. Every
 * upgrade carries a clock, so every upgrade gets the same three things — a
 * one-shot that reads "ONE SHOT" tells the player nothing about how long they
 * have to line it up.
 */
function drawPowerPanel(ctx: CanvasRenderingContext2D, state: GameState): void {
  const power = state.power
  const name = powerName(power)
  if (power.kind === 'none' || name === null) return

  const left = 16
  const width = 168
  const fraction = Math.max(0, Math.min(1, power.remaining / power.duration))

  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = PALETTE.accent
  ctx.fillText(name, left, 38)

  ctx.textAlign = 'right'
  // The last three seconds count in red, since that is when it matters.
  ctx.fillStyle = power.remaining <= 3 ? '#ff7a96' : PALETTE.hudDim
  ctx.fillText(`${power.remaining.toFixed(1)}s`, left + width, 38)

  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.beginPath()
  ctx.roundRect(left, 54, width, 5, 2.5)
  ctx.fill()

  ctx.fillStyle = power.remaining <= 3 ? '#ff7a96' : PALETTE.accent
  ctx.beginPath()
  ctx.roundRect(left, 54, Math.max(2, width * fraction), 5, 2.5)
  ctx.fill()

  ctx.textAlign = 'left'
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  ctx.fillStyle = PALETTE.hud
  ctx.font = '600 18px system-ui, sans-serif'
  ctx.textBaseline = 'top'

  ctx.textAlign = 'left'
  ctx.fillText(`SCORE ${state.score}`, 16, 14)

  drawPowerPanel(ctx, state)

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
