import { bossHitPoints, createGame, isBossRound, startRound, update, HEN_TOP } from '../src/game.ts'
import type { InputState } from '../src/input.ts'
import { BOSS, POWER, UFO, VIEW } from '../src/config.ts'
import type { Egg, GameState, Laser, Power, Ufo } from '../src/types.ts'

const DT = 1 / 60
const idle: InputState = { left: false, right: false, fire: false }
const firing: InputState = { left: false, right: false, fire: true }

function step(game: GameState, seconds: number, input: InputState, events = {}) {
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) update(game, DT, input, events)
}

function egg(x: number, y: number): Egg {
  return { x, y, spin: 0, rotation: 0, vx: 0, kind: 'normal' }
}

/** Handing an upgrade over through a call rather than by assigning the field
 *  keeps the compiler from narrowing `game.power` to whatever was just put in
 *  it, which would make every later check on it unreachable. */
function grant(game: GameState, power: Power) {
  game.power = power
}

/** Drops an egg right on a saucer's canopy and lets the next frame resolve it,
 *  so the splatter goes through the real collision path rather than being
 *  assigned straight into the state. */
function throwEggAt(game: GameState, ufo: Ufo) {
  game.eggs = [egg(ufo.x + UFO.width / 2 - 6, ufo.y + UFO.height / 2)]
  update(game, DT, idle)
}

/** Runs a fresh round-1 game and returns every laser it ever put in the air.
 *  Sampling across whole games is what keeps the stray-shot check clear of
 *  chance: one game does not fire enough shots to be sure of seeing one. */
function lasersFiredOver(seconds: number): Laser[] {
  const game = createGame()
  const seen = new Set<Laser>()
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) {
    update(game, DT, idle)
    for (const laser of game.lasers) seen.add(laser)
    if (game.phase.kind === 'over') break
  }
  return [...seen]
}

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// 1. Intro gates the march, then play begins.
const g = createGame()
const startUfos = g.ufos.length
const startY = g.ufos[0]!.y
step(g, 1.0, idle)
check('formation waits during the intro banner', g.ufos[0]!.y === startY && g.phase.kind === 'intro')
step(g, 1.2, idle)
check('phase becomes playing after the banner', g.phase.kind === 'playing', g.phase.kind)

// 2. Saucers march and eventually descend.
const xBefore = g.ufos[0]!.x
step(g, 2, idle)
check('formation marches sideways', g.ufos[0]!.x !== xBefore)

// 3. Firing splatters saucers, which then leave and score.
step(g, 12, firing)
check('eggs drive saucers off', g.ufos.length < startUfos, `${startUfos} -> ${g.ufos.length}`)
check('a saucer that leaves scores points', g.score > 0, `score ${g.score}`)
check('eggs in flight respect the cap', g.eggs.length <= 3, `${g.eggs.length}`)

// 4. An egg on the windscreen sends the saucer to the nearer wall, and it scores
//    only once it is fully out of the view.
const gl = createGame()
step(gl, 2, idle)
const leftward = gl.ufos[0]!
gl.ufos = [leftward]
leftward.x = 40
leftward.y = 100
throwEggAt(gl, leftward)
check('an egg bursts on the canopy', leftward.state.kind === 'splattered', leftward.state.kind)
check(
  'a saucer on the left half runs left',
  leftward.state.kind === 'splattered' && leftward.state.direction === -1,
)
check('the egg is spent on the hit', gl.eggs.length === 0, `${gl.eggs.length} still in flight`)
check('nothing scores while it is still on screen', gl.score === 0, `score ${gl.score}`)
step(gl, 1.5, idle)
check('the splattered saucer leaves the view', gl.ufos.length === 0, `${gl.ufos.length} left`)
check('leaving the view is what scores', gl.score > 0, `score ${gl.score}`)

// ...and one on the right half runs the other way.
const gr = createGame()
step(gr, 2, idle)
const rightward = gr.ufos[0]!
gr.ufos = [rightward]
rightward.x = VIEW.width - 90
throwEggAt(gr, rightward)
check(
  'a saucer on the right half runs right',
  rightward.state.kind === 'splattered' && rightward.state.direction === 1,
)

// 5. A splattered saucer is out of the fight: it cannot shoot, cannot be hit
//    again to any effect, and cannot invade.
const gs = createGame()
step(gs, 2, idle)
for (const ufo of gs.ufos) ufo.state = { kind: 'splattered', direction: -1, reeling: 999, speed: 0 }
gs.lasers = []
step(gs, 6, idle)
check('splattered saucers fire no lasers', gs.lasers.length === 0, `${gs.lasers.length} fired`)

// ...while a formation of flying ones definitely does.
const gf = createGame()
step(gf, 2, idle)
gf.lasers = []
step(gf, 6, idle)
check('flying saucers do fire lasers', gf.lasers.length > 0, `${gf.lasers.length} in flight`)

const gw = createGame()
step(gw, 2, idle)
const alreadyHit = gw.ufos[0]!
alreadyHit.state = { kind: 'splattered', direction: -1, reeling: 999, speed: 0 }
const roundBefore = gw.round
throwEggAt(gw, alreadyHit)
check('a second egg into a splattered saucer is wasted', gw.eggs.length === 0 && gw.round === roundBefore)

const gi = createGame()
step(gi, 2, idle)
const runner = gi.ufos[0]!
runner.state = { kind: 'splattered', direction: -1, reeling: 999, speed: 0 }
runner.y = HEN_TOP - 2
update(gi, DT, idle)
check('a fleeing saucer past the line is not an invasion', gi.phase.kind === 'playing', gi.phase.kind)

// 6. A saucer on its way out must not drag the formation into a wall it is not
//    touching. This is the whole reason the march ignores splattered saucers.
//    The scout is held reeling so it is still sitting out past the wall when the
//    next march step lands.
const gb = createGame()
step(gb, 2, idle)
const scout = gb.ufos[0]!
const neighbour = gb.ufos[1]!
scout.state = { kind: 'splattered', direction: 1, reeling: 999, speed: 0 }
scout.x = VIEW.width - 10
const rowY = neighbour.y
step(gb, 0.7, idle)
check('a fleeing saucer does not bounce the formation off a wall', neighbour.y === rowY, `y ${neighbour.y}`)

// 7. Obstacles absorb shots and are destroyed, never resurrected.
const g2 = createGame()
step(g2, 2, idle)
const toys = g2.obstacles.length
let overlapping = false
for (let i = 0; i < g2.obstacles.length; i++) {
  for (let j = i + 1; j < g2.obstacles.length; j++) {
    const a = g2.obstacles[i]!, b = g2.obstacles[j]!
    if (a.x < b.x + 56 && a.x + 56 > b.x) overlapping = true
  }
}
check('toys never overlap', !overlapping, `${toys} toys placed`)
check('toys stay inside the view', g2.obstacles.every((o) => o.x >= 0 && o.x + 56 <= 800))

// 8. Invasion ends the game even with lives remaining.
const g3 = createGame()
step(g3, 2, idle)
for (const ufo of g3.ufos) ufo.y = HEN_TOP - UFO.height
let overCalled = 0
step(g3, 1.0, idle, { onGameOver: () => overCalled++ })
check('saucers reaching the hen end the run', g3.phase.kind === 'over', g3.phase.kind)
check('lives were still remaining at invasion', g3.hen.lives === 3, `lives ${g3.hen.lives}`)
check('onGameOver fires exactly once', overCalled === 1, `${overCalled}`)

// A saucer one pixel short of the line is not an invasion.
const g3b = createGame()
step(g3b, 2, idle)
for (const ufo of g3b.ufos) ufo.y = HEN_TOP - UFO.height - 1
update(g3b, DT, idle)
check('one pixel short is not an invasion', g3b.phase.kind === 'playing', g3b.phase.kind)

// 9. Round advances after a clear.
const g4 = createGame()
step(g4, 2, idle)
g4.ufos = []
step(g4, 2, idle)
check('clearing the sector advances the round', g4.round === 2, `round ${g4.round}`)

// --- boss rounds -----------------------------------------------------------

// 10. Every second round sends one mothership instead of a formation.
check('round 1 is a formation round', !isBossRound(1))
check('round 2 is a boss round', isBossRound(2))
check('round 3 is a formation round', !isBossRound(3))

const gp = createGame()
check('a formation round has no mothership', gp.boss === null && gp.ufos.length > 0)
startRound(gp, 2)
check('a boss round has a mothership and no formation', gp.boss !== null && gp.ufos.length === 0)
startRound(gp, 3)
check('and the round after is a formation again', gp.boss === null && gp.ufos.length > 0)

// 11. It takes one egg per round number, and nothing happens before that.
const gboss = createGame()
startRound(gboss, 4)
step(gboss, 3, idle)
check('the announced number matches the mothership', bossHitPoints(4) === 4)
check('a round-4 mothership starts on four hits', gboss.boss?.maxHitPoints === 4, `${gboss.boss?.maxHitPoints}`)

const boss = gboss.boss!
for (let i = 0; i < 3; i++) gboss.eggs.push(egg(boss.x + 40 + i * 12, boss.y + BOSS.height / 2))
update(gboss, DT, idle)
check('three eggs are not enough', boss.state.kind === 'flying' && boss.hitPoints === 1, `${boss.hitPoints} left`)

gboss.eggs.push(egg(boss.x + 40, boss.y + BOSS.height / 2))
update(gboss, DT, idle)
check('the fourth sees it off', boss.state.kind === 'splattered', boss.state.kind)

const scoreBefore = gboss.score
step(gboss, 2.5, idle)
check('the mothership leaves the view', gboss.boss === null)
check('and scores on the way out', gboss.score > scoreBefore, `score ${gboss.score}`)

// 12. A volley carries as many lasers as the round number.
const gv = createGame()
startRound(gv, 6)
step(gv, 2.6, idle)
gv.lasers = []
step(gv, 1.4, idle)
check('a round-6 volley is six lasers', gv.lasers.length === 6, `${gv.lasers.length}`)
check('volley shots are fanned, not parallel', new Set(gv.lasers.map((l) => l.vx)).size === gv.lasers.length)

// 13. Some of a formation's shots are aimed off the vertical.
const sampled = [...lasersFiredOver(25), ...lasersFiredOver(25), ...lasersFiredOver(25), ...lasersFiredOver(25)]
const strays = sampled.filter((laser) => laser.vx !== 0).length
check('some lasers are aimed off the vertical', strays > 0, `${strays} of ${sampled.length}`)
check('but most still fall straight down', strays < sampled.length, `${sampled.length - strays} straight`)

// --- the Rambo egg and its upgrades ----------------------------------------

// 14. It turns up in a top corner and leaves on its own if it is not shot.
const gr2 = createGame()
step(gr2, 2, idle)
gr2.pickupTimer = 0.05
step(gr2, 0.2, idle)
const pickup = gr2.pickup
check('the Rambo egg turns up', pickup !== null)
check(
  'in a top corner',
  pickup !== null && pickup.y < 100 && (pickup.x < 200 || pickup.x > VIEW.width - 200),
  pickup === null ? '' : `x ${pickup.x}, y ${pickup.y}`,
)
check('with ten seconds on it', pickup !== null && pickup.remaining > 9.5, `${pickup?.remaining.toFixed(1)}s`)

gr2.hen.lives = 99
step(gr2, 10.5, idle)
check('and leaves if it is not shot', gr2.pickup === null)

// ...and shooting it upgrades the eggs.
const gu = createGame()
step(gu, 2, idle)
gu.pickupTimer = 0.05
step(gu, 0.2, idle)
const target = gu.pickup!
gu.eggs = [egg(target.x + POWER.width / 2 - 6, target.y + POWER.height / 2)]
let gained = 0
update(gu, DT, idle, { onPowerGained: () => gained++ })
check('shooting it grants an upgrade', gu.power.kind !== 'none', gu.power.kind)
check('the upgrade is announced once', gained === 1, `${gained}`)
check('and the pickup is consumed', gu.pickup === null && gu.eggs.length === 0)

// 15. Multishot fires a fan.
const gm = createGame()
step(gm, 2, idle)
grant(gm, { kind: 'multishot', eggs: 9, remaining: 5 })
gm.eggs = []
gm.shotCooldown = 0
update(gm, DT, firing)
check('multishot fires the whole fan at once', gm.eggs.length === 9, `${gm.eggs.length}`)
check(
  'and the fan spreads both ways',
  gm.eggs.some((e) => e.vx < 0) && gm.eggs.some((e) => e.vx > 0),
)

// 16. The super egg is one shot that clears the sky at mid-screen.
const gse = createGame()
step(gse, 2, idle)
grant(gse, { kind: 'superEgg' })
gse.shotCooldown = 0
update(gse, DT, firing)
check('the super egg is a single shot', gse.eggs.length === 1 && gse.eggs[0]!.kind === 'super')
check('and firing it spends the upgrade', gse.power.kind === 'none', gse.power.kind)

const toyCount = gse.obstacles.length
step(gse, 0.6, idle)
check(
  'it bursts and clears the sky',
  gse.ufos.length > 0 && gse.ufos.every((u) => u.state.kind === 'splattered'),
  `${gse.ufos.length} saucers, all leaving`,
)
check('it leaves a shockwave behind', gse.blasts.length > 0)
check('and spares the toys', gse.obstacles.length === toyCount, `${gse.obstacles.length} toys`)

// 17. The beam burns whatever is above the hen, and clears incoming fire.
const gbm = createGame()
step(gbm, 2, idle)
grant(gbm, { kind: 'beam', remaining: 5 })
gbm.lasers = [{ x: gbm.hen.x + 20, y: 200, vx: 0, vy: 200 }]
update(gbm, DT, idle)
check(
  'the beam splatters what is above it',
  gbm.ufos.some((u) => u.state.kind === 'splattered'),
)
check('and burns incoming lasers out of the air', gbm.lasers.length === 0, `${gbm.lasers.length} left`)

// ...and takes the mothership one second per egg it would have cost. The boss is
// pinned under the beam here, since it would otherwise patrol out of it.
const gbb = createGame()
startRound(gbb, 2)
step(gbb, 3, idle)
grant(gbb, { kind: 'beam', remaining: 99 })
const pinned = gbb.boss!
const burn = (seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (gbb.boss !== null) gbb.boss.x = gbb.hen.x + 25 - BOSS.width / 2
    update(gbb, DT, idle)
  }
}
burn(1.2)
check('one second of beam is not enough for a two-egg mothership', pinned.state.kind === 'flying')
burn(1.2)
check('two seconds of it is', pinned.state.kind === 'splattered', pinned.state.kind)

// 18. The shield eats lasers that would otherwise cost a life.
const gsh = createGame()
step(gsh, 2, idle)
gsh.hen.invulnerable = 0
grant(gsh, { kind: 'shield', remaining: 5 })
gsh.lasers = [{ x: gsh.hen.x + 10, y: HEN_TOP - 4, vx: 0, vy: 210 }]
update(gsh, 0.05, idle)
check('the shield eats a laser', gsh.hen.lives === 3, `lives ${gsh.hen.lives}`)
check('and the laser is gone', gsh.lasers.length === 0)

// 19. Large dt cannot tunnel a laser through an unshielded hen.
const g5 = createGame()
step(g5, 2, idle)
g5.hen.invulnerable = 0
g5.lasers = [{ x: g5.hen.x + 10, y: HEN_TOP - 4, vx: 0, vy: 210 }]
update(g5, 0.05, idle)
check('a laser on the hen costs a life', g5.hen.lives === 2, `lives ${g5.hen.lives}`)

// Throwing rather than calling process.exit keeps this runnable without pulling
// in @types/node just for one line; an uncaught error is a non-zero exit too.
if (failures > 0) throw new Error(`${failures} check(s) failed`)
console.log('\nALL CHECKS PASSED')
