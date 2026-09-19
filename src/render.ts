import { BABY, BOTTLE, DIAPER, MOM, OBSTACLE, PALETTE, VIEW } from './config'
import { MOM_TOP } from './game'
import { rowVariant, type SpriteSet } from './sprites'
import type { GameState } from './types'

/** Draws one frame. `time` is seconds since the game started and drives every
 *  idle animation, so nothing here mutates game state. */
export function render(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  drawNursery(ctx)
  drawObstacles(ctx, state, sprites)
  drawBabies(ctx, state, sprites, time)
  drawProjectiles(ctx, state, sprites)
  drawMom(ctx, state, sprites, time)
  drawHud(ctx, state, sprites)
}

function drawNursery(ctx: CanvasRenderingContext2D): void {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height)
  sky.addColorStop(0, PALETTE.backgroundGlow)
  sky.addColorStop(1, PALETTE.background)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, VIEW.width, VIEW.height)

  // Nursery wallpaper: a faint dot grid, dim enough not to compete with sprites.
  ctx.fillStyle = 'rgba(255,255,255,0.045)'
  for (let y = 40; y < VIEW.height - 60; y += 56) {
    for (let x = 28; x < VIEW.width; x += 56) {
      const offset = (y / 56) % 2 === 0 ? 0 : 28
      ctx.beginPath()
      ctx.arc(x + offset, y, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // The line the babies must not cross.
  ctx.strokeStyle = PALETTE.floorLine
  ctx.lineWidth = 2
  ctx.setLineDash([9, 9])
  ctx.beginPath()
  ctx.moveTo(0, MOM_TOP - 6)
  ctx.lineTo(VIEW.width, MOM_TOP - 6)
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
    ctx.fillStyle = 'rgba(19,26,43,0.82)'
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

function drawBabies(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  for (const baby of state.babies) {
    const variant = rowVariant(baby.row)
    const centreX = baby.x + BABY.width / 2
    const centreY = baby.y + BABY.height / 2

    ctx.save()
    if (baby.state.kind === 'feeding') {
      // A fed baby rocks happily and shrinks away as its timer runs out, so the
      // player can see the kill coming without waiting for it to pop.
      const progress = 1 - baby.state.remaining / BABY.feedDuration
      const scale = 1 - progress * 0.3
      // Fading a light sprite over a dark background reads as "dirty" long
      // before it reads as "leaving", so the fade is held back until the last
      // moment and the shrink does most of the work.
      ctx.globalAlpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3
      ctx.translate(centreX, centreY)
      ctx.rotate(Math.sin(time * 13 + baby.wobblePhase) * 0.14)
      ctx.scale(scale, scale)
      ctx.drawImage(
        sprites.babyFeeding[variant] ?? sprites.babyCrying[0]!,
        -BABY.width / 2,
        -BABY.height / 2,
        BABY.width,
        BABY.height,
      )
    } else {
      const bob = Math.sin(time * 4.5 + baby.wobblePhase) * 1.8
      ctx.drawImage(sprites.babyCrying[variant] ?? sprites.babyCrying[0]!, baby.x, baby.y + bob, BABY.width, BABY.height)
    }
    ctx.restore()
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet): void {
  for (const bottle of state.bottles) {
    ctx.drawImage(sprites.bottle, bottle.x, bottle.y, BOTTLE.width, BOTTLE.height)
  }

  for (const diaper of state.diapers) {
    ctx.save()
    ctx.translate(diaper.x + DIAPER.width / 2, diaper.y + DIAPER.height / 2)
    ctx.rotate(diaper.rotation)
    ctx.drawImage(sprites.diaper, -DIAPER.width / 2, -DIAPER.height / 2, DIAPER.width, DIAPER.height)
    ctx.restore()
  }
}

function drawMom(ctx: CanvasRenderingContext2D, state: GameState, sprites: SpriteSet, time: number): void {
  // Blink while immune. The blink is what tells the player the hit registered
  // and that they are briefly safe.
  const immune = state.mom.invulnerable > 0
  if (immune && Math.floor(time * 12) % 2 === 0) return
  const sprite = immune ? sprites.momHurt : sprites.mom
  ctx.drawImage(sprite, state.mom.x, MOM_TOP, MOM.width, MOM.height)
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

  // Lives as little moms, minus the one currently on the field.
  const iconWidth = 16
  const iconHeight = 17
  for (let i = 0; i < state.mom.lives - 1; i++) {
    const x = VIEW.width - 16 - iconWidth - i * (iconWidth + 6)
    ctx.drawImage(sprites.mom, x, 14, iconWidth, iconHeight)
  }
}
