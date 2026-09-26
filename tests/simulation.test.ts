import {
  bossHitPoints,
  createGame,
  foxWait,
  isBossRound,
  parleyDuration,
  eggsPerThrow,
  pickupsFor,
  startRound,
  update,
  HEN_TOP,
} from '../src/game.ts'
import { placeObstacles } from '../src/obstacles.ts'
import type { InputState } from '../src/input.ts'
import {
  ABDUCTION,
  BLACK_HOLE,
  BOSS,
  BURP,
  COW,
  DESERT,
  EGG,
  FEATHERS,
  FOX,
  FREEZE,
  HEN,
  LASER,
  OBSTACLE,
  PARLEY,
  POWER,
  SHIELD,
  UFO,
  VICTORY,
  VIEW,
  WINGMAN,
  WIPER,
} from '../src/config.ts'
import { lineAt, SONG_LINES } from '../src/song.ts'
import type { GameState, Laser, Power, Shot, Ufo } from '../src/types.ts'
import { createTelemetry, telemetry } from '../src/telemetry.ts'

const DT = 1 / 60
const idle: InputState = { left: false, right: false, fire: false }
const firing: InputState = { left: false, right: false, fire: true }

function step(game: GameState, seconds: number, input: InputState, events = {}) {
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) update(game, DT, input, events)
}

/**
 * A game with Einstein's visit and the radioactive foxes switched off. Almost
 * every check below measures how far the board gets in a given number of
 * seconds, and a random five-second stop in the middle of one measures nothing
 * at all; a fox costing the hen a life would break every check that counts
 * lives. Both have tests of their own, which turn them on deliberately.
 */
function newGame(): GameState {
  const game = createGame()
  game.freezeTimer = null
  game.foxTimer = null
  return game
}

/**
 * Runs a game to its first frame of play. Round 1 opens with the parley, which
 * is longer than a round banner and may get longer still, so every check that
 * only wants to be in the fight asks for that rather than counting seconds.
 */
function intoPlay(game: GameState): void {
  while (game.phase.kind !== 'playing') update(game, DT, idle)
}

/** startRound re-rolls the visit and the foxes, so jumping to a round needs
 *  the same guard. */
function enterRound(game: GameState, round: number): void {
  startRound(game, round)
  game.freezeTimer = null
  game.foxTimer = null
}

function egg(x: number, y: number): Shot {
  return { x, y, spin: 0, rotation: 0, vx: 0, kind: 'normal', fuse: 0, wingman: false }
}

/** True when a saucer is on its way off the board for the given reason. */
function leaving(ufo: Ufo, reason: 'splattered' | 'deserted'): boolean {
  return ufo.state.kind === 'leaving' && ufo.state.reason === reason
}

/** Reads the phase through a call, so a test that has just assigned one is not
 *  narrowed to it for the rest of the check. */
function phaseKind(game: GameState): GameState['phase']['kind'] {
  return game.phase.kind
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
  game.shots = [egg(ufo.x + UFO.width / 2 - 6, ufo.y + UFO.height / 2)]
  update(game, DT, idle)
}

/** Runs a fresh round-1 game and returns every laser it ever put in the air.
 *  Sampling across whole games is what keeps the stray-shot check clear of
 *  chance: one game does not fire enough shots to be sure of seeing one. */
function lasersFiredOver(seconds: number): Laser[] {
  const game = newGame()
  const seen = new Set<Laser>()
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) {
    update(game, DT, idle)
    for (const laser of game.lasers) seen.add(laser)
    if (game.phase.kind === 'over' || game.phase.kind === 'abduction') break
  }
  return [...seen]
}

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// 1. A run opens with the argument, and nothing moves until it is settled.
const g = newGame()
const startUfos = g.ufos.length
const startY = g.ufos[0]!.y
check('a run opens with the mothership making its demand', g.phase.kind === 'parley' && g.phase.line === 0)
check('after sliding in first', parleyDuration(0) > PARLEY.demandDuration)
step(g, parleyDuration(0) + 0.1, idle)
check('then the hen answers', g.phase.kind === 'parley' && g.phase.line === 1, g.phase.kind)
step(g, parleyDuration(1) + 0.1, idle)
check('then the mothership leaves', g.phase.kind === 'parley' && g.phase.line === 2, g.phase.kind)
check('and nothing has marched while they talk', g.ufos[0]!.y === startY && g.ufos[0]!.x === g.ufos[0]!.x)
check('and no mothership is in the fight', g.boss === null)
step(g, parleyDuration(2) + 0.1, idle)
check('and then the battle begins', g.phase.kind === 'playing', g.phase.kind)

// Later rounds have nothing left to say.
const gparley = newGame()
enterRound(gparley, 3)
check('a later round just shows its banner', gparley.phase.kind === 'intro', gparley.phase.kind)

// 2. Saucers march and eventually descend.
const xBefore = g.ufos[0]!.x
step(g, 2, idle)
check('formation marches sideways', g.ufos[0]!.x !== xBefore)

// 3. Firing splatters saucers, which then leave and score.
step(g, 12, firing)
check('eggs drive saucers off', g.ufos.length < startUfos, `${startUfos} -> ${g.ufos.length}`)
check('a saucer that leaves scores points', g.score > 0, `score ${g.score}`)
check('eggs in flight respect the cap', g.shots.length <= 3, `${g.shots.length}`)

// 4. An egg on the windscreen sends the saucer to the nearer wall, and it scores
//    only once it is fully out of the view.
const gl = newGame()
intoPlay(gl)
const leftward = gl.ufos[0]!
gl.ufos = [leftward]
leftward.x = 40
leftward.y = 100
throwEggAt(gl, leftward)
check('an egg bursts on the canopy', leaving(leftward, 'splattered'), leftward.state.kind)
check(
  'a saucer on the left half runs left',
  leftward.state.kind === 'leaving' && leftward.state.direction === -1,
)
check('the egg is spent on the hit', gl.shots.length === 0, `${gl.shots.length} still in flight`)
check('nothing scores while it is still on screen', gl.score === 0, `score ${gl.score}`)
step(gl, 1.5, idle)
check('the splattered saucer leaves the view', gl.ufos.length === 0, `${gl.ufos.length} left`)
check('leaving the view is what scores', gl.score > 0, `score ${gl.score}`)

// ...and one on the right half runs the other way.
const gr = newGame()
intoPlay(gr)
const rightward = gr.ufos[0]!
gr.ufos = [rightward]
rightward.x = VIEW.width - 90
throwEggAt(gr, rightward)
check(
  'a saucer on the right half runs right',
  rightward.state.kind === 'leaving' && rightward.state.direction === 1,
)

// 5. A splattered saucer is out of the fight: it cannot shoot, cannot be hit
//    again to any effect, and cannot invade.
const gs = newGame()
intoPlay(gs)
for (const ufo of gs.ufos) ufo.state = { kind: 'leaving', reason: 'splattered', direction: -1, reeling: 999, speed: 0 }
gs.lasers = []
step(gs, 6, idle)
check('splattered saucers fire no lasers', gs.lasers.length === 0, `${gs.lasers.length} fired`)

// ...while a formation of flying ones definitely does. Counted over the whole
// run rather than sampled at the end: a laser that reaches the hen clears the
// array on its way out, so the instantaneous count is occasionally zero.
const fired = lasersFiredOver(8)
check('flying saucers do fire lasers', fired.length > 0, `${fired.length} fired`)

const gw = newGame()
intoPlay(gw)
const alreadyHit = gw.ufos[0]!
alreadyHit.state = { kind: 'leaving', reason: 'splattered', direction: -1, reeling: 999, speed: 0 }
const roundBefore = gw.round
throwEggAt(gw, alreadyHit)
check('a second egg into a splattered saucer is wasted', gw.shots.length === 0 && gw.round === roundBefore)

const gi = newGame()
intoPlay(gi)
const runner = gi.ufos[0]!
runner.state = { kind: 'leaving', reason: 'splattered', direction: -1, reeling: 999, speed: 0 }
runner.y = HEN_TOP - 2
update(gi, DT, idle)
check('a fleeing saucer past the line is not an invasion', gi.phase.kind === 'playing', gi.phase.kind)

// 6. A saucer on its way out must not drag the formation into a wall it is not
//    touching. This is the whole reason the march ignores splattered saucers.
//    The scout is held reeling so it is still sitting out past the wall when the
//    next march step lands.
const gb = newGame()
intoPlay(gb)
const scout = gb.ufos[0]!
const neighbour = gb.ufos[1]!
scout.state = { kind: 'leaving', reason: 'splattered', direction: 1, reeling: 999, speed: 0 }
scout.x = VIEW.width - 10
const rowY = neighbour.y
step(gb, 0.7, idle)
check('a fleeing saucer does not bounce the formation off a wall', neighbour.y === rowY, `y ${neighbour.y}`)

// 7. Obstacles absorb shots and are destroyed, never resurrected.
const g2 = newGame()
intoPlay(g2)
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
const g3 = newGame()
intoPlay(g3)
for (const ufo of g3.ufos) ufo.y = HEN_TOP - UFO.height
let overCalled = 0
step(g3, 1.0, idle, { onGameOver: () => overCalled++ })
check('saucers reaching the hen start the abduction', g3.phase.kind === 'abduction', g3.phase.kind)
check('lives were still remaining at invasion', g3.hen.lives === 3, `lives ${g3.hen.lives}`)
check('and the panel waits for the scene', overCalled === 0, `${overCalled}`)
step(g3, ABDUCTION.duration, idle, { onGameOver: () => overCalled++ })
check('the run is over once the cow has gone', g3.phase.kind === 'over', g3.phase.kind)
check('onGameOver fires exactly once', overCalled === 1, `${overCalled}`)

// A saucer one pixel short of the line is not an invasion.
const g3b = newGame()
intoPlay(g3b)
for (const ufo of g3b.ufos) ufo.y = HEN_TOP - UFO.height - 1
update(g3b, DT, idle)
check('one pixel short is not an invasion', g3b.phase.kind === 'playing', g3b.phase.kind)

// 9. Round advances after a clear.
const g4 = newGame()
intoPlay(g4)
g4.ufos = []
step(g4, 2, idle)
check('clearing the sector advances the round', g4.round === 2, `round ${g4.round}`)

// --- boss rounds -----------------------------------------------------------

// 10. Every second round sends one mothership instead of a formation.
check('round 1 is a formation round', !isBossRound(1))
check('round 2 is a boss round', isBossRound(2))
check('round 3 is a formation round', !isBossRound(3))

const gp = newGame()
check('a formation round has no mothership', gp.boss === null && gp.ufos.length > 0)
enterRound(gp, 2)
check('a boss round has a mothership and no formation', gp.boss !== null && gp.ufos.length === 0)
enterRound(gp, 3)
check('and the round after is a formation again', gp.boss === null && gp.ufos.length > 0)

// 11. It takes one egg per round number, and nothing happens before that.
const gboss = newGame()
enterRound(gboss, 4)
step(gboss, 3, idle)
check('the announced number matches the mothership', bossHitPoints(4) === 4)
check('a round-4 mothership starts on four hits', gboss.boss?.maxHitPoints === 4, `${gboss.boss?.maxHitPoints}`)

const boss = gboss.boss!
for (let i = 0; i < 3; i++) gboss.shots.push(egg(boss.x + 40 + i * 12, boss.y + BOSS.height / 2))
update(gboss, DT, idle)
check('three eggs are not enough', boss.state.kind === 'flying' && boss.hitPoints === 1, `${boss.hitPoints} left`)

gboss.shots.push(egg(boss.x + 40, boss.y + BOSS.height / 2))
update(gboss, DT, idle)
check('the fourth sees it off', boss.state.kind === 'leaving', boss.state.kind)

const scoreBefore = gboss.score
step(gboss, 2.5, idle)
check('the mothership leaves the view', gboss.boss === null)
check('and scores on the way out', gboss.score > scoreBefore, `score ${gboss.score}`)

// 12. A volley is two directions short of the round number, and arrives at half
//     the rate it used to.
const gv = newGame()
enterRound(gv, 6)
step(gv, 2.6, idle)
gv.lasers = []
step(gv, 3.9, idle)
check('nothing has been fired before the interval is up', gv.lasers.length === 0, `${gv.lasers.length} early`)
step(gv, 0.4, idle)
check('a round-6 volley is two lasers', gv.lasers.length === 2, `${gv.lasers.length}`)
check('volley shots are fanned, not parallel', new Set(gv.lasers.map((l) => l.vx)).size === gv.lasers.length)
check('and every one of them is angled', gv.lasers.every((l) => l.vx !== 0))

// Even the first mothership keeps one direction rather than none.
const gv2 = newGame()
enterRound(gv2, 2)
step(gv2, 2.6, idle)
gv2.lasers = []
step(gv2, 5.2, idle)
check('a round-2 mothership still fires one', gv2.lasers.length === 1, `${gv2.lasers.length}`)

// 13. Rank-and-file saucers, by contrast, only ever fire straight down.
const sampled = [...lasersFiredOver(25), ...lasersFiredOver(25), ...lasersFiredOver(25)]
const angled = sampled.filter((laser) => laser.vx !== 0).length
check('angling a shot is the mothership trick alone', angled === 0, `${angled} of ${sampled.length} angled`)

// --- the Rambo egg and its upgrades ----------------------------------------

// 14. It turns up in a top corner and leaves on its own if it is not shot.
const gr2 = newGame()
intoPlay(gr2)
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
const gu = newGame()
intoPlay(gu)
gu.pickupTimer = 0.05
step(gu, 0.2, idle)
const target = gu.pickup!
gu.shots = [egg(target.x + POWER.width / 2 - 6, target.y + POWER.height / 2)]
let gained = 0
update(gu, DT, idle, { onPowerGained: () => gained++ })
check('shooting it grants an upgrade', gu.power.kind !== 'none', gu.power.kind)
check('the upgrade is announced once', gained === 1, `${gained}`)
check('and the pickup is consumed', gu.pickup === null && gu.shots.length === 0)

// 15. Multishot fires a fan.
const gm = newGame()
intoPlay(gm)
grant(gm, { kind: 'multishot', eggs: 9, remaining: 5, duration: 5 })
gm.shots = []
gm.shotCooldown = 0
update(gm, DT, firing)
check('multishot fires the whole fan at once', gm.shots.length === 9, `${gm.shots.length}`)
check(
  'and the fan spreads both ways',
  gm.shots.some((e) => e.vx < 0) && gm.shots.some((e) => e.vx > 0),
)

// 16. The super egg is one shot that clears the sky at mid-screen.
const gse = newGame()
intoPlay(gse)
grant(gse, { kind: 'superEgg', remaining: 12, duration: 12 })
gse.shotCooldown = 0
update(gse, DT, firing)
check('the super egg is a single shot', gse.shots.length === 1 && gse.shots[0]!.kind === 'super')
check('and firing it spends the upgrade', gse.power.kind === 'none', gse.power.kind)

const toyCount = gse.obstacles.length
step(gse, 0.6, idle)
check(
  'it bursts and clears the sky',
  gse.ufos.length > 0 && gse.ufos.every((u) => leaving(u, 'splattered')),
  `${gse.ufos.length} saucers, all leaving`,
)
check('it leaves a shockwave behind', gse.blasts.length > 0)
check('and spares the toys', gse.obstacles.length === toyCount, `${gse.obstacles.length} toys`)

// 17. The beam burns whatever is above the hen, and clears incoming fire.
const gbm = newGame()
intoPlay(gbm)
// Six columns leaves a gap at the centre of the view, so the hen is parked
// under a known saucer rather than wherever she happens to start.
gbm.hen.x = gbm.ufos[0]!.x + UFO.width / 2 - HEN.width / 2
grant(gbm, { kind: 'beam', remaining: 5, duration: 5 })
gbm.lasers = [{ x: gbm.hen.x + 20, y: 200, vx: 0, vy: LASER.baseSpeed }]
update(gbm, DT, idle)
check(
  'the beam splatters what is above it',
  gbm.ufos.some((u) => leaving(u, 'splattered')),
)
check('and burns incoming lasers out of the air', gbm.lasers.length === 0, `${gbm.lasers.length} left`)

// ...and takes the mothership one second per egg it would have cost. The boss is
// pinned under the beam here, since it would otherwise patrol out of it.
const gbb = newGame()
enterRound(gbb, 2)
step(gbb, 3, idle)
grant(gbb, { kind: 'beam', remaining: 99, duration: 99 })
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
check('two seconds of it is', pinned.state.kind === 'leaving', pinned.state.kind)

// 18. The shield eats lasers that would otherwise cost a life.
const gsh = newGame()
intoPlay(gsh)
gsh.hen.invulnerable = 0
gsh.shield = { hits: SHIELD.hits }
gsh.lasers = [{ x: gsh.hen.x + 10, y: HEN_TOP - 4, vx: 0, vy: LASER.baseSpeed }]
update(gsh, 0.05, idle)
check('the shield eats a laser', gsh.hen.lives === 3, `lives ${gsh.hen.lives}`)
check('and the laser is gone', gsh.lasers.length === 0)
check('for one of its hits', gsh.shield?.hits === SHIELD.hits - 1, `${gsh.shield?.hits}`)

// 19. Large dt cannot tunnel a laser through an unshielded hen.
const g5 = newGame()
intoPlay(g5)
g5.hen.invulnerable = 0
g5.lasers = [{ x: g5.hen.x + 10, y: HEN_TOP - 4, vx: 0, vy: LASER.baseSpeed }]
update(g5, 0.05, idle)
check('a laser on the hen costs a life', g5.hen.lives === 2, `lives ${g5.hen.lives}`)

// --- a lighter formation, and desertions ------------------------------------

// 20. A shallower, narrower formation than the game started with.
const shape = newGame().ufos
check('the round-1 formation is two ranks deep', new Set(shape.map((u) => u.row)).size === 2)
check('and six columns wide', new Set(shape.map((u) => u.column)).size === 6)

// 21. A tenth of every formation loses its nerve, and goes home unscored.
const gd = newGame()
const expectedDesertions = Math.round(gd.ufos.length * DESERT.fraction)
check('a tenth of the formation is down to desert', gd.desertions.length === expectedDesertions, `${gd.desertions.length}`)
check('a boss round has nobody to desert', (enterRound(gd, 2), gd.desertions.length === 0))

const gd2 = newGame()
gd2.hen.lives = 99
let deserted = 0
let firstDeserter: Ufo | null = null
step(gd2, 16, idle, {
  onUfoDeserted: (ufo: Ufo) => {
    deserted++
    firstDeserter ??= ufo
  },
})
check('and they all go before the round is out', deserted === expectedDesertions, `${deserted} left`)
check('a deserter is marked as such, not as egged', firstDeserter !== null && leaving(firstDeserter, 'deserted'))
check('talking one out of it scores nothing', gd2.score === 0, `score ${gd2.score}`)

// --- free lives -------------------------------------------------------------

// 22. Every four thousand points is another hen.
const gx = newGame()
intoPlay(gx)
check('the first free life is four thousand away', gx.nextLifeAt === 4000, `${gx.nextLifeAt}`)

gx.score = 3995
const earner = gx.ufos[0]!
gx.ufos = [earner]
earner.x = 60
throwEggAt(gx, earner)
let extraLives = 0
step(gx, 2, idle, { onExtraLife: () => extraLives++ })
check('crossing four thousand is a free life', gx.hen.lives === 4, `lives ${gx.hen.lives}`)
check('and it is announced once', extraLives === 1, `${extraLives}`)
check('the next one is four thousand further on', gx.nextLifeAt === 8000, `${gx.nextLifeAt}`)

// A single award that vaults more than one threshold pays out for each.
const gx2 = newGame()
intoPlay(gx2)
gx2.score = 11900
gx2.nextLifeAt = 4000
gx2.hen.lives = 1
const earner2 = gx2.ufos[0]!
gx2.ufos = [earner2]
earner2.x = 60
throwEggAt(gx2, earner2)
step(gx2, 2, idle)
check('one award can pay out several thresholds', gx2.hen.lives === 3, `lives ${gx2.hen.lives}`)

// --- the four new upgrades --------------------------------------------------

// 23. The exploding heart talks the fleet out of the war.
const gh = newGame()
intoPlay(gh)
grant(gh, { kind: 'heart', remaining: 12, duration: 12 })
gh.shotCooldown = 0
update(gh, DT, firing)
check('the heart is a single shot', gh.shots.length === 1 && gh.shots[0]!.kind === 'heart')
check('and firing it spends the upgrade', gh.power.kind === 'none', gh.power.kind)
step(gh, 0.8, idle)
check(
  'it talks the whole fleet into deserting',
  gh.ufos.length > 0 && gh.ufos.every((u) => leaving(u, 'deserted')),
  `${gh.ufos.length} saucers, all going home`,
)
check('and nobody is scored for it', gh.score === 0, `score ${gh.score}`)

// ...but the mothership is not open to persuasion.
const ghb = newGame()
enterRound(ghb, 4)
step(ghb, 3, idle)
grant(ghb, { kind: 'heart', remaining: 12, duration: 12 })
ghb.shotCooldown = 0
update(ghb, DT, firing)
let taunts = 0
step(ghb, 0.8, idle, { onBossTaunt: () => taunts++ })
check('the mothership refuses the heart', ghb.boss?.state.kind === 'flying' && ghb.boss.hitPoints === 4)
check('it has something to say about it', ghb.bossTaunt !== null && taunts === 1, `${taunts} taunts`)
check('and the hen is handed a super egg instead', ghb.power.kind === 'superEgg', ghb.power.kind)

// 24. Gravity waves set saucers tumbling, and tumbling saucers come off the board.
const gg = newGame()
gg.hen.lives = 99
intoPlay(gg)
grant(gg, { kind: 'gravity', remaining: 5, duration: 5 })
gg.shotCooldown = 0
update(gg, DT, firing)
check('firing gravity sends a ring out, not a projectile', gg.waves.length === 1 && gg.shots.length === 0)
// Watched across the window rather than sampled at the end of it: the wave
// reaches the fleet part way through, and a saucer it catches can have already
// detonated against its neighbour by the time the window closes.
let sawTumbling = false
const fleetBefore = gg.ufos.length
for (let i = 0; i < Math.round(3.5 / DT); i++) {
  update(gg, DT, idle)
  if (gg.ufos.some((u) => u.state.kind === 'wobbling')) sawTumbling = true
}
check('the wave sets saucers tumbling', sawTumbling)
step(gg, 4, idle)
check('and tumbling saucers come off the board', gg.ufos.length < fleetBefore, `${fleetBefore} -> ${gg.ufos.length}`)
check('which scores', gg.score > 0, `score ${gg.score}`)

// 25. The black hole: one shot, opening at a random spot in the sky, and
//     everything on the board spirals into it.
const gbh = newGame()
gbh.hen.lives = 99
intoPlay(gbh)
gbh.desertions = []
const fleetBeforeHole = gbh.ufos.length
grant(gbh, { kind: 'blackHole', remaining: 12, duration: 12 })
gbh.shotCooldown = 0
let holesOpened = 0
update(gbh, DT, firing, { onBlackHole: () => holesOpened++ })
check('firing opens a black hole', gbh.vortex !== null && holesOpened === 1, `${holesOpened}`)
check('and nothing is thrown to get it there', gbh.shots.length === 0, `${gbh.shots.length}`)
check('it is a single shot', gbh.power.kind === 'none', gbh.power.kind)
check(
  'it opens up in the sky',
  gbh.vortex !== null &&
    gbh.vortex.x >= BLACK_HOLE.minX &&
    gbh.vortex.x <= BLACK_HOLE.maxX &&
    gbh.vortex.y >= BLACK_HOLE.minY &&
    gbh.vortex.y <= BLACK_HOLE.maxY,
)
check('and catches every saucer at once', gbh.ufos.every((ufo) => ufo.state.kind === 'swirling'))
check('and the lasers in the air', gbh.lasers.length === 0)
check('which no longer fire', (() => {
  step(gbh, 0.5, idle)
  return gbh.lasers.length === 0
})())
let closest = Infinity
let farthest = 0
for (const ufo of gbh.ufos) {
  if (ufo.state.kind !== 'swirling') continue
  closest = Math.min(closest, ufo.state.radius)
  farthest = Math.max(farthest, ufo.state.radius)
}
check('they spiral in, the nearer ones first', gbh.ufos.length < fleetBeforeHole || closest < farthest)
step(gbh, BLACK_HOLE.maxDuration, idle)
check('and the whole fleet is swallowed', gbh.ufos.length === 0 || gbh.phase.kind !== 'playing', `${gbh.ufos.length} left`)
check('and scored', gbh.score > 0, `score ${gbh.score}`)
check('and the hole closes behind them', gbh.vortex === null)

// It opens somewhere different each time.
const holeSpots = new Set<number>()
for (let i = 0; i < 6; i++) {
  const g = newGame()
  intoPlay(g)
  grant(g, { kind: 'blackHole', remaining: 12, duration: 12 })
  g.shotCooldown = 0
  update(g, DT, firing)
  if (g.vortex !== null) holeSpots.add(Math.round(g.vortex.x))
}
check('the black hole opens at a random spot', holeSpots.size > 1, `${holeSpots.size} spots`)

// Eggs go through a saucer on its way in.
const gbhe = newGame()
intoPlay(gbhe)
grant(gbhe, { kind: 'blackHole', remaining: 12, duration: 12 })
gbhe.shotCooldown = 0
update(gbhe, DT, firing)
const falling = gbhe.ufos[0]!
gbhe.shots = [egg(falling.x + UFO.width / 2 - 6, falling.y + UFO.height / 2)]
update(gbhe, DT, idle)
check('an egg passes through a saucer falling into the black hole', gbhe.shots.length === 1)

// The mothership goes in too.
const gbhb = newGame()
gbhb.hen.lives = 99
enterRound(gbhb, 6)
while (gbhb.phase.kind !== 'playing') update(gbhb, DT, idle)
grant(gbhb, { kind: 'blackHole', remaining: 12, duration: 12 })
gbhb.shotCooldown = 0
update(gbhb, DT, firing)
check('the black hole catches the mothership', gbhb.boss?.state.kind === 'swirling', gbhb.boss?.state.kind)
const bossScoreBefore = gbhb.score
step(gbhb, BLACK_HOLE.maxDuration, idle)
check('and swallows it', gbhb.boss === null)
check('for the full mothership score', gbhb.score - bossScoreBefore >= BOSS.scorePerRound * 6, `${gbhb.score - bossScoreBefore}`)

// Time stopped does not stop it: it is the hen's.
const gbhz = newGame()
intoPlay(gbhz)
grant(gbhz, { kind: 'blackHole', remaining: 12, duration: 12 })
gbhz.shotCooldown = 0
update(gbhz, DT, firing)
gbhz.freeze = { x: 0, remaining: 99 }
step(gbhz, BLACK_HOLE.maxDuration, idle)
check('the black hole keeps pulling with time stopped', gbhz.ufos.length === 0, `${gbhz.ufos.length} left`)

// 26. The gramophone finishes the fleet three seconds in, mothership included.
const gmo = newGame()
gmo.hen.lives = 99
intoPlay(gmo)
grant(gmo, { kind: 'gramophone', remaining: 12, duration: 12 })
gmo.shotCooldown = 0
update(gmo, DT, firing)
check('the gramophone is a single shot', gmo.shots.length === 1 && gmo.shots[0]!.kind === 'gramophone')
check('with three seconds on the record', gmo.shots[0]!.fuse > 2.9, `${gmo.shots[0]!.fuse.toFixed(2)}s`)
step(gmo, 2.5, idle)
check('the fleet is still up while it plays', gmo.ufos.length > 0, `${gmo.ufos.length} left`)
step(gmo, 0.8, idle)
check('and gone when the record ends', gmo.ufos.length === 0, `${gmo.ufos.length} left`)
check('with the whole fleet scored', gmo.score > 0, `score ${gmo.score}`)

const gmb = newGame()
gmb.hen.lives = 99
enterRound(gmb, 4)
step(gmb, 3, idle)
grant(gmb, { kind: 'gramophone', remaining: 12, duration: 12 })
gmb.shotCooldown = 0
update(gmb, DT, firing)
step(gmb, 3.2, idle)
check('the record takes the mothership too', gmb.boss === null)

// --- toys that have been knocked loose --------------------------------------

// 27. An egg punts a toy off its spot without wearing it down; a laser is
//     absorbed and does neither.
const gt = newGame()
intoPlay(gt)
const toy = gt.obstacles[0]!
gt.shots = [egg(toy.x + OBSTACLE.width / 2 - 6, toy.y + OBSTACLE.height / 2)]
update(gt, DT, idle)
check('an egg knocks a toy loose', toy.vy < 0, `vy ${toy.vy.toFixed(0)}`)
check('and the egg is spent on it', gt.shots.length === 0)
check('but the toy is no worse for it', toy.health === OBSTACLE.hitPoints, `${toy.health} left`)
check('a knocked toy tumbles', toy.spin !== 0)

// Repeated eggs keep adding speed rather than eroding it.
gt.shotCooldown = 0
const speedAfterOne = toy.vy
gt.shots = [egg(toy.x + OBSTACLE.width / 2 - 6, toy.y + OBSTACLE.height / 2)]
update(gt, DT, idle)
check('a second egg pushes it harder still', toy.vy < speedAfterOne, `vy ${toy.vy.toFixed(0)}`)
check('and it is still in one piece', toy.health === OBSTACLE.hitPoints && gt.obstacles.includes(toy))

const gt2 = newGame()
intoPlay(gt2)
const toy2 = gt2.obstacles[0]!
gt2.lasers = [{ x: toy2.x + 20, y: toy2.y + 8, vx: 0, vy: LASER.baseSpeed }]
update(gt2, DT, idle)
check('a laser is absorbed by a toy', gt2.lasers.length === 0)
check('without damaging or moving it', toy2.health === OBSTACLE.hitPoints && toy2.vy === 0)

// A toy under sustained fire is still standing, and still whole.
const gt2b = newGame()
intoPlay(gt2b)
gt2b.hen.lives = 99
const toy2b = gt2b.obstacles[0]!
for (let i = 0; i < OBSTACLE.hitPoints * 3; i++) {
  gt2b.lasers = [{ x: toy2b.x + 20, y: toy2b.y + 8, vx: 0, vy: LASER.baseSpeed }]
  update(gt2b, DT, idle)
}
check(
  'no amount of fire wears a toy down',
  gt2b.obstacles.includes(toy2b) && toy2b.health === OBSTACLE.hitPoints,
  `${toy2b.health} left`,
)

// 28. A loose toy wrecks what it ploughs into, and pays a hit point for each.
const gt3 = newGame()
gt3.hen.lives = 99
intoPlay(gt3)
const target3 = gt3.ufos[0]!
const toy3 = gt3.obstacles[0]!
toy3.x = target3.x + UFO.width / 2 - OBSTACLE.width / 2
toy3.y = target3.y + 120
toy3.vy = -300
const fleet3 = gt3.ufos.length
step(gt3, 0.6, idle)
const wrecked = fleet3 - gt3.ufos.length
check('a loose toy wrecks what it hits', wrecked > 0, `${wrecked} wrecked`)
check('which scores', gt3.score > 0, `score ${gt3.score}`)
check(
  'and every wreck costs the toy a hit point',
  gt3.obstacles.includes(toy3) ? OBSTACLE.hitPoints - toy3.health === wrecked : wrecked === OBSTACLE.hitPoints,
  `${wrecked} wrecked, ${toy3.health} health left`,
)

// 29. One that reaches the edge of the view is simply gone.
const gt4 = newGame()
gt4.hen.lives = 99
intoPlay(gt4)
const toy4 = gt4.obstacles[0]!
toy4.x = 5
toy4.y = 200
toy4.vy = -600
const toyCount4 = gt4.obstacles.length
step(gt4, 0.8, idle)
check('a loose toy that leaves the view is gone', gt4.obstacles.length === toyCount4 - 1, `${gt4.obstacles.length} left`)

// 30. The mothership is too big to be taken out by a teddy bear.
const gt5 = newGame()
gt5.hen.lives = 99
enterRound(gt5, 6)
step(gt5, 3, idle)
const hull = gt5.boss!
const toy5 = gt5.obstacles[0]!
toy5.x = hull.x + BOSS.width / 2 - OBSTACLE.width / 2
toy5.y = hull.y + BOSS.height + 40
toy5.vy = -300
const hullBefore = hull.hitPoints
step(gt5, 0.5, idle)
check('a loose toy costs the mothership one hit point', hull.hitPoints === hullBefore - 1, `${hull.hitPoints} left`)
check('and breaks up against the hull', !gt5.obstacles.includes(toy5))

// --- Einstein, and stopped time ---------------------------------------------

// 31. He turns up, and the board stops. These are the only checks that want the
//     visit switched on, so they use createGame directly.
const gz = createGame()
gz.hen.lives = 99
gz.desertions = []
intoPlay(gz)
gz.freezeTimer = 0.05
step(gz, 0.2, idle)
const visit = gz.freeze
check('Einstein turns up', visit !== null)
check(
  'at one side of the view',
  visit !== null && (visit.x < 200 || visit.x > VIEW.width - 200),
  visit === null ? '' : `x ${visit.x}`,
)
check('with the whole freeze still to run', visit !== null && visit.remaining > FREEZE.duration - 0.5)

const marchX = gz.ufos[0]!.x
const marchY = gz.ufos[0]!.y
gz.lasers = [{ x: 100, y: 100, vx: 0, vy: LASER.baseSpeed }]
const henX = gz.hen.x
step(gz, 2, { left: false, right: true, fire: false })
check('the fleet does not march', gz.ufos[0]!.x === marchX && gz.ufos[0]!.y === marchY)
check('lasers hang in the air', gz.lasers.length === 1 && gz.lasers[0]!.y === 100, `y ${gz.lasers[0]?.y}`)
check('but the hen still moves', gz.hen.x > henX, `${henX} -> ${gz.hen.x}`)

// 32. Eggs still fly, and what they hit goes up on the spot.
const gz2 = createGame()
gz2.hen.lives = 99
gz2.desertions = []
intoPlay(gz2)
gz2.freezeTimer = 0.05
step(gz2, 0.2, idle)
check('the board is stopped', gz2.freeze !== null)

const stopped = gz2.ufos[0]!
const fleetZ = gz2.ufos.length
gz2.shots = [egg(stopped.x + UFO.width / 2 - 6, stopped.y + UFO.height / 2)]
update(gz2, DT, idle)
check('an egg with time stopped explodes what it hits', gz2.ufos.length === fleetZ - 1, `${gz2.ufos.length} left`)
check('there is no retreat to wait for, so it scores at once', gz2.score > 0, `score ${gz2.score}`)
check('and it leaves a burst behind', gz2.blasts.length > 0)

// 33. Time starts again on its own, and the board picks up where it left off.
const restX = gz2.ufos[0]!.x
step(gz2, FREEZE.duration, idle)
check('time starts again by itself', gz2.freeze === null)
step(gz2, 1.2, idle)
check('and the fleet marches again', gz2.ufos[0]!.x !== restX, `${restX} -> ${gz2.ufos[0]!.x}`)

// 34. The mothership is still worth one egg a time, stopped or not.
const gzb = createGame()
gzb.hen.lives = 99
startRound(gzb, 6)
step(gzb, 3, idle)
gzb.freezeTimer = 0.05
step(gzb, 0.2, idle)
check('the board is stopped over the mothership too', gzb.freeze !== null)
const stoppedHull = gzb.boss!
const hullHp = stoppedHull.hitPoints
gzb.shots = [egg(stoppedHull.x + 40, stoppedHull.y + BOSS.height / 2)]
update(gzb, DT, idle)
check('stopped time does not make the mothership a one-egg kill', stoppedHull.hitPoints === hullHp - 1, `${stoppedHull.hitPoints} left`)

// --- every upgrade carries a clock ------------------------------------------

// 35. Including the single-shot ones, which is what the HUD countdown reads.
const gc = newGame()
intoPlay(gc)
gc.pickupTimer = 0.05
step(gc, 0.2, idle)
const prize = gc.pickup!
gc.shots = [egg(prize.x + POWER.width / 2 - 6, prize.y + POWER.height / 2)]
update(gc, DT, idle)
const prizeClock = gc.power.kind === 'none' ? null : gc.power
check('an upgrade arrives with a clock on it', prizeClock !== null && prizeClock.remaining > 0, gc.power.kind)
check(
  'and knows what it started with, so a bar can measure it',
  prizeClock !== null && prizeClock.duration >= prizeClock.remaining,
)

// A one-shot left unfired runs out rather than being carried for ever.
const gc2 = newGame()
intoPlay(gc2)
grant(gc2, { kind: 'gramophone', remaining: 0.4, duration: 12 })
step(gc2, 0.6, idle)
check('a one-shot that is never fired goes off the boil', gc2.power.kind === 'none', gc2.power.kind)

// --- the cow has more to say -------------------------------------------------

// 36. A moo for every round cleared, and a longer one on the way up.
check('the cow moos at a cleared round', COW.roundLine === 'Moo', COW.roundLine)
check('and moos at length when it is taken', COW.line === 'Moooooooooo', COW.line)

// --- eggs a throw ---------------------------------------------------------------

// 37. The extra eggs every eight rounds were tried and taken out again; one
//     more every ten rounds is what replaced them (see 55).
const gpe = newGame()
enterRound(gpe, 17)
while (gpe.phase.kind !== 'playing') update(gpe, DT, idle)
gpe.lasers = []
update(gpe, DT, firing)
check('a round-17 pull throws two eggs', gpe.shots.length === 2, `${gpe.shots.length}`)
check('straight up', gpe.shots.every((shot) => shot.vx === 0))

// --- eggs shoot lasers down -----------------------------------------------------

// 38. An egg and a laser that meet cancel out.
const gel = newGame()
intoPlay(gel)
gel.ufos = []
gel.boss = null
gel.obstacles = []
gel.ufos = [{ column: 0, row: 0, x: 10, y: 60, state: { kind: 'flying' }, wobblePhase: 0 }]
gel.shots = [egg(400, 300)]
gel.lasers = [{ x: 403, y: 290, vx: 0, vy: LASER.baseSpeed }]
update(gel, DT, idle)
check('an egg that meets a laser takes it out', gel.lasers.length === 0, `${gel.lasers.length} left`)
check('and is spent doing it', gel.shots.length === 0, `${gel.shots.length} left`)

// With time stopped a laser still hangs there to be shot down.
const gelz = newGame()
intoPlay(gelz)
gelz.freeze = { x: 0, remaining: 3 }
gelz.shots = [egg(400, 300)]
gelz.lasers = [{ x: 403, y: 290, vx: 0, vy: LASER.baseSpeed }]
update(gelz, DT, idle)
check('a frozen laser can be shot down too', gelz.lasers.length === 0 && gelz.shots.length === 0)

// --- toys are left as they are ---------------------------------------------

// 39. Two more kinds, and no damage marks to carry.
const kindsSeen = new Set<string>()
for (let i = 0; i < 60; i++) for (const toy of placeObstacles()) kindsSeen.add(toy.kind)
check('bicycles turn up among the toys', kindsSeen.has('bicycle'))
check('and tractors', kindsSeen.has('tractor'))
check('a round still gets four toys, all different', new Set(placeObstacles().map((t) => t.kind)).size === OBSTACLE.count)
check('toys carry no damage marks', placeObstacles().every((t) => !('scuffs' in t)))

// --- the cow's burp ------------------------------------------------------------

// 40. Firing it lets go the whole cloud at once, and spends the upgrade.
const gburp = newGame()
intoPlay(gburp)
gburp.desertions = []
gburp.lasers = []
const burpFleet = gburp.ufos.length
grant(gburp, { kind: 'burp', remaining: 12, duration: 12 })
update(gburp, DT, firing)
check('the burp lets go a cloud of bubbles', gburp.bubbles.length === BURP.bubbles, `${gburp.bubbles.length}`)
check('and the cow says so', gburp.burpLine !== null)
check('and it is a single shot', gburp.power.kind === 'none', gburp.power.kind)
check('nothing the hen throws is involved', gburp.shots.length === 0, `${gburp.shots.length}`)
// The slowest bubble aimed at the far top corner needs about five and a half
// seconds to clear the view.
step(gburp, 6, idle)
check('the bubbles take out saucers', gburp.ufos.length < burpFleet, `${burpFleet} -> ${gburp.ufos.length}`)
check('which scores', gburp.score > 0, `score ${gburp.score}`)
check('and they are gone once they have crossed the screen', gburp.bubbles.length === 0, `${gburp.bubbles.length} left`)

// On a boss round each bubble that lands costs the mothership a hit point.
const gburpBoss = newGame()
enterRound(gburpBoss, 10)
while (gburpBoss.phase.kind !== 'playing') update(gburpBoss, DT, idle)
gburpBoss.boss!.x = 20
grant(gburpBoss, { kind: 'burp', remaining: 12, duration: 12 })
update(gburpBoss, DT, firing)
const bossHpBefore = gburpBoss.boss!.hitPoints
step(gburpBoss, 1.5, idle)
check(
  'bubbles wear the mothership down',
  gburpBoss.boss === null || gburpBoss.boss.state.kind !== 'flying' || gburpBoss.boss.hitPoints < bossHpBefore,
  `${gburpBoss.boss?.hitPoints} of ${bossHpBefore}`,
)

// --- the wingman ---------------------------------------------------------------

// 41. She walks, she throws, and nothing touches her.
const gwm = newGame()
intoPlay(gwm)
gwm.lasers = []
grant(gwm, { kind: 'wingman', x: 500, direction: 1, cooldown: 0, remaining: WINGMAN.duration, duration: WINGMAN.duration })
// Counted across the window: a toy or a saucer overhead eats her eggs as fast
// as she throws them, so any single frame may show none in the air.
const herEggs = new Set<Shot>()
for (let i = 0; i < 30; i++) {
  update(gwm, DT, idle)
  for (const shot of gwm.shots) if (shot.wingman) herEggs.add(shot)
}
const wing = gwm.power
check('the wingman is on the board', wing.kind === 'wingman')
check('and walks by herself', wing.kind === 'wingman' && wing.x !== 500, wing.kind === 'wingman' ? `${wing.x}` : '')
check('and throws without the fire key', herEggs.size >= 2, `${herEggs.size} eggs`)

// Her eggs do not use up the hen's.
const gwm2 = newGame()
intoPlay(gwm2)
gwm2.lasers = []
gwm2.ufos = [{ column: 0, row: 0, x: 10, y: 60, state: { kind: 'flying' }, wobblePhase: 0 }]
gwm2.desertions = []
gwm2.obstacles = []
grant(gwm2, { kind: 'wingman', x: 600, direction: 1, cooldown: 0, remaining: WINGMAN.duration, duration: WINGMAN.duration })
step(gwm2, 1.2, firing)
const ownEggs = gwm2.shots.filter((s) => !s.wingman).length
check('the hen keeps her own three eggs', ownEggs > 0 && ownEggs <= EGG.maxInFlight, `${ownEggs} of hers`)

// A laser that reaches her is simply absorbed.
const gwm3 = newGame()
intoPlay(gwm3)
gwm3.hen.x = 40
gwm3.hen.invulnerable = 0
grant(gwm3, { kind: 'wingman', x: 600, direction: 1, cooldown: 99, remaining: WINGMAN.duration, duration: WINGMAN.duration })
gwm3.lasers = [{ x: 600 + 20, y: HEN_TOP - 4, vx: 0, vy: LASER.baseSpeed }]
update(gwm3, 0.05, idle)
check('a laser on the wingman is absorbed', gwm3.lasers.length === 0, `${gwm3.lasers.length} left`)
check('and costs nobody a life', gwm3.hen.lives === HEN.lives, `lives ${gwm3.hen.lives}`)
check('and she is still there', gwm3.power.kind === 'wingman', gwm3.power.kind)

// Her eggs cannot collect a Rambo egg, which would replace her.
const gwm4 = newGame()
intoPlay(gwm4)
gwm4.pickupTimer = 0.05
step(gwm4, 0.2, idle)
const prize4 = gwm4.pickup!
grant(gwm4, { kind: 'wingman', x: 600, direction: 1, cooldown: 99, remaining: WINGMAN.duration, duration: WINGMAN.duration })
gwm4.shots = [{ ...egg(prize4.x + POWER.width / 2 - 6, prize4.y + POWER.height / 2), wingman: true }]
update(gwm4, DT, idle)
check('her eggs leave the Rambo egg for the hen', gwm4.pickup !== null && gwm4.power.kind === 'wingman')

// And she goes when her clock does.
step(gwm, WINGMAN.duration, idle)
check('the wingman leaves when the upgrade runs out', gwm.power.kind !== 'wingman', gwm.power.kind)

// --- the radioactive fox ---------------------------------------------------

// 43. A front-rank saucer drops one now and then.
const gfx = newGame()
gfx.hen.lives = 99
intoPlay(gfx)
gfx.foxTimer = 0.01
let foxesThrown = 0
update(gfx, DT, idle, { onFoxThrown: () => foxesThrown++ })
check('a saucer drops a radioactive fox', gfx.foxes.length === 1 && foxesThrown === 1, `${gfx.foxes.length}`)
check(
  'and another is on its way, slowly in round 1',
  gfx.foxTimer !== null &&
    gfx.foxTimer >= FOX.firstInterval * (1 - FOX.jitter) - 0.1 &&
    gfx.foxTimer <= FOX.firstInterval * (1 + FOX.jitter),
  `${gfx.foxTimer}`,
)
const foxStartY = gfx.foxes[0]!.y
step(gfx, 0.5, idle)
check('the fox falls', gfx.foxes[0]!.y > foxStartY)

// A round with no timer of its own gets one from startRound; a boss round none.
const gfr = newGame()
startRound(gfr, 3)
check('a fleet round schedules foxes', gfr.foxTimer !== null)
startRound(gfr, 4)
check('a mothership round has none', gfr.foxTimer === null)

// Eggs go straight through it.
const gfe = newGame()
intoPlay(gfe)
gfe.ufos = []
gfe.boss = null
gfe.obstacles = []
gfe.ufos = [{ column: 0, row: 0, x: 10, y: 60, state: { kind: 'flying' }, wobblePhase: 0 }]
gfe.foxes = [{ x: 400, y: 280, vx: 0, rotation: 0, landed: false, wait: 0, chaser: false, chase: 0 }]
gfe.shots = [egg(410, 290)]
update(gfe, DT, idle)
check('an egg goes straight through a fox', gfe.foxes.length === 1 && gfe.shots.length === 1)

// It lands, sits a while, then runs off the side away from the hen.
const gfl = newGame()
gfl.hen.lives = 99
intoPlay(gfl)
gfl.hen.x = 700
gfl.obstacles = []
gfl.foxes = [{ x: 150, y: 300, vx: 0, rotation: 1, landed: false, wait: 0, chaser: false, chase: 0 }]
// From 300 it is about 1.7s to the ground.
step(gfl, 1.75, idle)
const ranFox = gfl.foxes[0]!
check('a fox lands on its feet', ranFox.landed && ranFox.rotation === 0)
check('and sits there', ranFox.vx === 0 && ranFox.wait > 0, `vx ${ranFox.vx}, wait ${ranFox.wait.toFixed(2)}`)
const satAt = ranFox.x
step(gfl, foxWait(1) * 0.8, idle)
check('without moving', ranFox.x === satAt && ranFox.vx === 0)
step(gfl, foxWait(1) * 0.3, idle)
check('then runs away from the hen', ranFox.vx < 0, `${ranFox.vx}`)
step(gfl, 2, idle)
check('and is gone once it gets there', gfl.foxes.length === 0, `${gfl.foxes.length}`)

// Away from her even when that is the far wall.
const gfa = newGame()
gfa.hen.lives = 99
intoPlay(gfa)
gfa.hen.x = 60
gfa.foxes = [{ x: 250, y: HEN_TOP + HEN.height - FOX.height, vx: 0, rotation: 0, landed: true, wait: 0.01, chaser: false, chase: 0 }]
update(gfa, DT, idle)
check('a fox nearer the left wall still runs right when the hen is on its left', gfa.foxes[0]!.vx > 0, `${gfa.foxes[0]!.vx}`)

// It sits longer as the rounds go up: a second early on, ten later.
check('a fox sits one second in round 1', foxWait(1) === FOX.minWait, `${foxWait(1)}`)
check('longer in round 10', foxWait(10) > foxWait(5) && foxWait(5) > foxWait(1), `${foxWait(5).toFixed(1)}, ${foxWait(10).toFixed(1)}`)
check('and never more than ten', foxWait(19) === FOX.maxWait && foxWait(40) === FOX.maxWait)

// More foxes as the rounds go up, never more than four in one.
const averageGap = (round: number): number => {
  let total = 0
  for (let i = 0; i < 200; i++) {
    const g = newGame()
    startRound(g, round)
    total += g.foxTimer ?? 0
  }
  return total / 200
}
const gapEarly = averageGap(1)
const gapMid = averageGap(9)
const gapLate = averageGap(21)
check('foxes come more often as the rounds go up', gapEarly > gapMid && gapMid > gapLate, `${gapEarly.toFixed(1)}s, ${gapMid.toFixed(1)}s, ${gapLate.toFixed(1)}s`)
check('rarely in the first rounds', gapEarly > 20, `${gapEarly.toFixed(1)}s`)

const gfc = newGame()
gfc.hen.lives = 999
enterRound(gfc, 21)
while (gfc.phase.kind !== 'playing') update(gfc, DT, idle)
gfc.hen.invulnerable = 999
gfc.foxTimer = 0.01
let foxesInRound = 0
for (let i = 0; i < 8; i++) {
  gfc.foxTimer = gfc.foxTimer === null ? null : 0.01
  update(gfc, DT, idle, { onFoxThrown: () => foxesInRound++ })
}
check('never more than four foxes in a round', foxesInRound === FOX.maxPerRound && gfc.foxTimer === null, `${foxesInRound}`)
startRound(gfc, 23)
check('and the count starts again next round', gfc.foxesThrown === 0 && gfc.foxTimer !== null)

// Touching the hen costs her a life.
const gfh = newGame()
intoPlay(gfh)
gfh.lasers = []
gfh.hen.invulnerable = 0
gfh.hen.x = 400
const livesBeforeFox = gfh.hen.lives
gfh.foxes = [{ x: 405, y: HEN_TOP + 4, vx: 0, rotation: 0, landed: false, wait: 0, chaser: false, chase: 0 }]
update(gfh, DT, idle)
check('a fox touching the hen costs a life', gfh.hen.lives === livesBeforeFox - 1, `${livesBeforeFox} -> ${gfh.hen.lives}`)
check('and one life only', gfh.hen.lives === livesBeforeFox - 1)
check('and it is gone with the lasers', gfh.foxes.length === 0)

// Toys do not stop it; the shield does.
const gft = newGame()
intoPlay(gft)
const foxToy = gft.obstacles[0]!
gft.foxes = [{ x: foxToy.x + 4, y: foxToy.y + 2, vx: 0, rotation: 0, landed: false, wait: 0, chaser: false, chase: 0 }]
update(gft, DT, idle)
check('a toy does not stop a fox', gft.foxes.length === 1)

const gfs = newGame()
intoPlay(gfs)
gfs.lasers = []
gfs.hen.invulnerable = 0
gfs.hen.x = 400
gfs.shield = { hits: SHIELD.hits }
const livesShielded = gfs.hen.lives
gfs.foxes = [{ x: 405, y: HEN_TOP + 4, vx: 0, rotation: 0, landed: false, wait: 0, chaser: false, chase: 0 }]
update(gfs, DT, idle)
check('the shield keeps a fox off her', gfs.hen.lives === livesShielded)
check('for one hit, and a moment to get past', gfs.shield?.hits === SHIELD.hits - 1 && gfs.hen.invulnerable > 0)

const gfz = newGame()
intoPlay(gfz)
gfz.lasers = []
gfz.hen.invulnerable = 0
gfz.hen.x = 400
gfz.freeze = { x: 0, remaining: 3 }
const livesFrozen = gfz.hen.lives
gfz.foxes = [{ x: 405, y: HEN_TOP + 4, vx: 0, rotation: 0, landed: false, wait: 0, chaser: false, chase: 0 }]
update(gfz, DT, idle)
check('a frozen fox cannot hurt her', gfz.hen.lives === livesFrozen)

// The black hole leaves foxes alone: nothing kills one.
const gfb = newGame()
intoPlay(gfb)
gfb.foxes = [{ x: 400, y: 200, vx: 0, rotation: 0, landed: false, wait: 0, chaser: false, chase: 0 }]
grant(gfb, { kind: 'blackHole', remaining: 12, duration: 12 })
gfb.shotCooldown = 0
update(gfb, DT, firing)
check('the black hole does not take a fox', gfb.foxes.length === 1)

// --- losing a life -----------------------------------------------------------

// 44. Feathers fly.
const gfe2 = newGame()
intoPlay(gfe2)
gfe2.hen.invulnerable = 0
gfe2.lasers = [{ x: gfe2.hen.x + HEN.width / 2, y: HEN_TOP + 10, vx: 0, vy: 0 }]
update(gfe2, DT, idle)
check('losing a life knocks feathers off the hen', gfe2.feathers.length === FEATHERS.count, `${gfe2.feathers.length}`)
const featherY = Math.min(...gfe2.feathers.map((f) => f.y))
step(gfe2, 0.9, idle)
const lowest = Math.max(...gfe2.feathers.map((f) => f.y))
check('they drift down', lowest > featherY, `${featherY.toFixed(0)} -> ${lowest.toFixed(0)}`)
step(gfe2, FEATHERS.life, idle)
check('and are gone once they have faded', gfe2.feathers.length === 0, `${gfe2.feathers.length}`)

// The last life's feathers still fall during the abduction.
const gfe3 = newGame()
intoPlay(gfe3)
gfe3.hen.lives = 1
gfe3.hen.invulnerable = 0
gfe3.lasers = [{ x: gfe3.hen.x + HEN.width / 2, y: HEN_TOP + 10, vx: 0, vy: 0 }]
update(gfe3, DT, idle)
const lastFeather = gfe3.feathers[0]!
const lastFeatherAge = lastFeather.age
update(gfe3, DT, idle)
check('the last hen\'s feathers fall through the abduction', gfe3.phase.kind === 'abduction' && lastFeather.age > lastFeatherAge)

// --- the cow faces the field -------------------------------------------------

// 45. So the burp comes out of the right-hand end.
const gcow = newGame()
intoPlay(gcow)
grant(gcow, { kind: 'burp', remaining: 12, duration: 12 })
update(gcow, DT, firing)
check(
  'the cow burps from its right-hand end',
  gcow.bubbles.length > 0 && gcow.bubbles.every((b) => b.x > COW.x + COW.width / 2),
)

// --- the alien doll ----------------------------------------------------------

// 46. A seventh toy.
const toysSeen = new Set<string>()
for (let i = 0; i < 80; i++) for (const t of placeObstacles()) toysSeen.add(t.kind)
check('alien dolls turn up among the toys', toysSeen.has('alien'))
check('all seven kinds turn up', toysSeen.size === 7, `${toysSeen.size}`)

// --- the mothership's wiper --------------------------------------------------

// 47. It wipes about a fifth of the egg off, and heals that much.
const gwp = newGame()
enterRound(gwp, 10)
while (gwp.phase.kind !== 'playing') update(gwp, DT, idle)
const wboss = gwp.boss!
wboss.hitPoints = wboss.maxHitPoints - 5
wboss.wipeTimer = 0.01
let wipes = 0
update(gwp, DT, idle, { onBossWipe: () => wipes++ })
check('the mothership wipes its canopy', wipes === 1, `${wipes}`)
check('clearing a fifth of the eggs, healing one', wboss.hitPoints === wboss.maxHitPoints - 4, `${wboss.hitPoints} of ${wboss.maxHitPoints}`)
check('and the blade crosses the canopy', wboss.wiping > 0 && wboss.wiping <= WIPER.duration)
check('and it wipes again later', wboss.wipeTimer >= WIPER.minInterval - 0.1 && wboss.wipeTimer <= WIPER.maxInterval)

const wiped = new Set<number>()
for (let i = 0; i < 30; i++) {
  const g = newGame()
  enterRound(g, 10)
  while (g.phase.kind !== 'playing') update(g, DT, idle)
  const b = g.boss!
  b.hitPoints = b.maxHitPoints - 5
  const before = b.splats.slice(0, 5)
  b.wipeTimer = 0.01
  update(g, DT, idle)
  const after = new Set(b.splats.slice(0, 4))
  before.forEach((splat, index) => {
    if (!after.has(splat)) wiped.add(index)
  })
}
check('it wipes random eggs, not just the newest', wiped.size > 1, `${[...wiped].join(',')}`)

const gwp2 = newGame()
enterRound(gwp2, 10)
while (gwp2.phase.kind !== 'playing') update(gwp2, DT, idle)
gwp2.boss!.hitPoints = gwp2.boss!.maxHitPoints - 2
gwp2.boss!.wipeTimer = 0.01
update(gwp2, DT, idle)
check('with only a couple of eggs up there it does not bother', gwp2.boss!.hitPoints === gwp2.boss!.maxHitPoints - 2)

const gwp3 = newGame()
enterRound(gwp3, 10)
while (gwp3.phase.kind !== 'playing') update(gwp3, DT, idle)
gwp3.boss!.wipeTimer = 0.01
update(gwp3, DT, idle)
check('a clean mothership never goes over its hit points', gwp3.boss!.hitPoints === gwp3.boss!.maxHitPoints)

// --- wide lasers ---------------------------------------------------------------

// 48. Later rounds put out double and triple lasers.
const laserPowers = (round: number): Map<number, number> => {
  const seen = new Map<number, number>()
  for (let i = 0; i < 30; i++) {
    const game = newGame()
    game.hen.lives = 999
    enterRound(game, round)
    while (game.phase.kind !== 'playing') update(game, DT, idle)
    game.hen.invulnerable = 999
    const counted = new Set<object>()
    for (let f = 0; f < 600; f++) {
      update(game, DT, idle)
      for (const laser of game.lasers) {
        if (counted.has(laser)) continue
        counted.add(laser)
        const power = laser.power ?? 1
        seen.set(power, (seen.get(power) ?? 0) + 1)
      }
      if (game.phase.kind !== 'playing') break
    }
  }
  return seen
}
const early = laserPowers(1)
check('round 1 lasers are all ordinary', !early.has(2) && !early.has(3), JSON.stringify([...early]))
const late = laserPowers(15)
check('by round 15 some are double', (late.get(2) ?? 0) > 0, JSON.stringify([...late]))
check('and some triple', (late.get(3) ?? 0) > 0, JSON.stringify([...late]))
check('but most are still ordinary', (late.get(1) ?? 0) > (late.get(2) ?? 0) + (late.get(3) ?? 0), JSON.stringify([...late]))

// A triple takes three eggs, narrowing about its middle each time.
const gwl = newGame()
intoPlay(gwl)
gwl.ufos = [{ column: 0, row: 0, x: 10, y: 60, state: { kind: 'flying' }, wobblePhase: 0 }]
gwl.obstacles = []
gwl.lasers = [{ x: 400 - LASER.width * 1.5, y: 290, vx: 0, vy: 0, power: 3 }]
const tripleCentre = 400
let zaps = 0
for (let i = 1; i <= 3; i++) {
  gwl.shots = [egg(400 - EGG.width / 2, 296)]
  update(gwl, DT, idle, { onLaserShotDown: () => zaps++ })
  if (i < 3) {
    const left = gwl.lasers[0]
    const width = LASER.width * (left?.power ?? 1)
    check(
      `egg ${i} into a triple laser narrows it`,
      left !== undefined && (left.power ?? 1) === 3 - i && Math.abs(left.x + width / 2 - tripleCentre) < 0.01,
      JSON.stringify(left),
    )
  }
}
check('and the third egg finishes it', gwl.lasers.length === 0, `${gwl.lasers.length} left`)
check('every egg is spent on it', gwl.shots.length === 0 && zaps === 3, `${zaps} zaps`)

// A wide laser still costs one life, and is as wide as it looks.
const gwh = newGame()
intoPlay(gwh)
gwh.hen.invulnerable = 0
gwh.hen.x = 400
const livesBeforeWide = gwh.hen.lives
// An ordinary laser here would miss her by a pixel; a triple reaches.
gwh.lasers = [{ x: 400 - LASER.width * 3 + 1, y: HEN_TOP + 10, vx: 0, vy: 0, power: 3 }]
update(gwh, DT, idle)
check('a wide laser hits across its whole width', gwh.hen.lives === livesBeforeWide - 1, `${livesBeforeWide} -> ${gwh.hen.lives}`)

// --- the mothership's wide lasers -------------------------------------------

// 49. The mothership fires wide lasers too, from the same rounds as the fleet.
const bossPowers = (round: number): Map<number, number> => {
  const seen = new Map<number, number>()
  for (let i = 0; i < 25; i++) {
    const game = newGame()
    game.hen.lives = 999
    enterRound(game, round)
    while (game.phase.kind !== 'playing') update(game, DT, idle)
    game.hen.invulnerable = 999
    const counted = new Set<object>()
    for (let f = 0; f < 900 && game.boss !== null; f++) {
      update(game, DT, idle)
      for (const laser of game.lasers) {
        if (counted.has(laser)) continue
        counted.add(laser)
        seen.set(laser.power ?? 1, (seen.get(laser.power ?? 1) ?? 0) + 1)
      }
    }
  }
  return seen
}
const bossEarly = bossPowers(2)
check('the round-2 mothership fires only ordinary lasers', !bossEarly.has(2) && !bossEarly.has(3), JSON.stringify([...bossEarly]))
const bossLate = bossPowers(16)
check(
  'a late mothership fires double and triple lasers too',
  (bossLate.get(2) ?? 0) > 0 && (bossLate.get(3) ?? 0) > 0,
  JSON.stringify([...bossLate]),
)

// --- foxes that chase ----------------------------------------------------------

// 50. From the rounds where a fox sits more than five seconds, it chases.
const foxIn = (round: number) => {
  const game = newGame()
  game.hen.lives = 99
  enterRound(game, round)
  while (game.phase.kind !== 'playing') update(game, DT, idle)
  game.foxTimer = 0.01
  update(game, DT, idle)
  return game
}
check('a round-5 fox does not chase', foxIn(5).foxes[0]?.chaser === false, `wait ${foxWait(5).toFixed(1)}s`)
check('a round-11 fox does', foxIn(11).foxes[0]?.chaser === true, `wait ${foxWait(11).toFixed(1)}s`)

// When it gets up it goes for her, slower than she can run...
const gch = newGame()
gch.hen.lives = 99
intoPlay(gch)
gch.hen.invulnerable = 999
gch.hen.x = 600
gch.foxes = [{ x: 100, y: HEN_TOP + HEN.height - FOX.height, vx: 0, rotation: 0, landed: true, wait: 0.01, chaser: true, chase: 0 }]
update(gch, DT, idle)
update(gch, DT, idle)
const chaser = gch.foxes[0]!
check('a chasing fox goes for the hen', chaser.chase > 0 && chaser.vx > 0, `vx ${chaser.vx}`)
check('slower than she runs', Math.abs(chaser.vx) <= FOX.chaseSpeed && FOX.chaseSpeed < HEN.speed)
// ...follows her if she crosses over...
gch.hen.x = 20
update(gch, DT, idle)
check('and turns to follow her', chaser.vx < 0, `vx ${chaser.vx}`)
// ...and gives up, running off the side away from her.
step(gch, FOX.chaseDuration, idle)
check('then gives up the chase', chaser.chase === 0 || !gch.foxes.includes(chaser))
check('and runs off away from her', !gch.foxes.includes(chaser) || chaser.vx > 0, `vx ${chaser.vx}`)

// A hen who got clear during the long sit gets away.
const gesc = newGame()
gesc.hen.lives = 99
intoPlay(gesc)
gesc.hen.invulnerable = 0
gesc.lasers = []
gesc.hen.x = VIEW.width - HEN.width
const livesBeforeChase = gesc.hen.lives
gesc.foxes = [{ x: 40, y: HEN_TOP + HEN.height - FOX.height, vx: 0, rotation: 0, landed: true, wait: 0.01, chaser: true, chase: 0 }]
for (let i = 0; i < Math.round((FOX.chaseDuration + 3) / DT); i++) {
  gesc.lasers = []
  update(gesc, DT, idle)
}
check('a hen at the far wall outlasts the chase', gesc.hen.lives === livesBeforeChase, `${livesBeforeChase} -> ${gesc.hen.lives}`)

// --- more Rambo eggs later on --------------------------------------------------

// 51. None or one until round 20, then a band higher every ten rounds, with
//     the higher count seven times in ten.
const pickupCounts = (round: number): Map<number, number> => {
  const seen = new Map<number, number>()
  for (let i = 0; i < 2000; i++) {
    const n = pickupsFor(round)
    seen.set(n, (seen.get(n) ?? 0) + 1)
  }
  return seen
}
for (const [round, low] of [
  [5, 0],
  [19, 0],
  [20, 1],
  [29, 1],
  [35, 2],
  [47, 3],
] as const) {
  const seen = pickupCounts(round)
  const upper = (seen.get(low + 1) ?? 0) / 2000
  check(
    `round ${round} brings ${low} or ${low + 1} Rambo eggs, mostly ${low + 1}`,
    [...seen.keys()].every((n) => n === low || n === low + 1) && upper > 0.65 && upper < 0.75,
    JSON.stringify([...seen]),
  )
}

// They come one after another in the same round.
const gpk = newGame()
gpk.hen.lives = 999
enterRound(gpk, 35)
gpk.pickupTimer = 0.01
gpk.pickupsLeft = 2
let seenPickups = 0
let wasUp = false
for (let f = 0; f < Math.round(60 / DT) && gpk.phase.kind !== 'over'; f++) {
  gpk.hen.invulnerable = 999
  gpk.lasers = []
  gpk.foxes = []
  update(gpk, DT, idle)
  const up = gpk.pickup !== null
  if (up && !wasUp) seenPickups++
  wasUp = up
  if (gpk.phase.kind !== 'playing' && gpk.phase.kind !== 'intro') break
}
check('a round owed three Rambo eggs shows all three, one at a time', seenPickups === 3, `${seenPickups}`)

// 52. A Rambo egg never turns into the shield any more.
let rolledShield = false
const rolled = new Set<string>()
for (let i = 0; i < 200; i++) {
  const g = newGame()
  intoPlay(g)
  g.pickupTimer = 0.01
  step(g, 0.05, idle)
  const target = g.pickup!
  g.shots = [egg(target.x + POWER.width / 2 - 6, target.y + POWER.height / 2)]
  update(g, DT, idle)
  if (g.shield !== null) rolledShield = true
  rolled.add(g.power.kind)
}
check('a Rambo egg never gives the shield', !rolledShield)
check('and the other nine all still turn up', rolled.size === 9 && !rolled.has('none'), [...rolled].join(','))

// --- dropped shields -----------------------------------------------------------

// 53. Every other deserter drops one.
let deserters = 0
let dropped = 0
for (let i = 0; i < 20; i++) {
  const g = newGame()
  intoPlay(g)
  grant(g, { kind: 'heart', remaining: 12, duration: 12 })
  g.shotCooldown = 0
  const fleet = g.ufos.filter((ufo) => ufo.state.kind === 'flying').length
  update(g, DT, firing)
  step(g, 1.5, idle)
  deserters += fleet
  dropped += g.shieldDrops.length + (g.shield !== null ? 1 : 0)
}
const dropShare = dropped / deserters
check('about one deserter in two drops a shield', dropShare > 0.38 && dropShare < 0.62, `${dropped} of ${deserters}`)

// It falls, lands, lies there four seconds, and is gone.
const gsd = newGame()
intoPlay(gsd)
gsd.hen.x = 700
// No desertions here: each could drop a shield of its own.
gsd.desertions = []
const theDrop = { x: 200, y: 300, landed: false, remaining: SHIELD.groundTime }
gsd.shieldDrops = [theDrop]
step(gsd, 0.5, idle)
check('a dropped shield falls', theDrop.y > 300)
while (!theDrop.landed) update(gsd, DT, idle)
check('and lands on the ground', gsd.shieldDrops.includes(theDrop))
step(gsd, SHIELD.groundTime - 0.3, idle)
check('where it lies for a few seconds', gsd.shieldDrops.includes(theDrop))
step(gsd, 0.5, idle)
check('and then is gone', !gsd.shieldDrops.includes(theDrop))

// The hen gets it by walking over it, or by its falling on her.
const gsw = newGame()
intoPlay(gsw)
gsw.hen.x = 100
gsw.shieldDrops = [{ x: 300, y: HEN_TOP + HEN.height - SHIELD.height, landed: true, remaining: 3 }]
let shieldsGained = 0
for (let i = 0; i < 90; i++) update(gsw, DT, { left: false, right: true, fire: false }, { onShieldGained: () => shieldsGained++ })
check('walking over a dropped shield picks it up', gsw.shield?.hits === SHIELD.hits && gsw.shieldDrops.length === 0 && shieldsGained === 1)

const gsf = newGame()
intoPlay(gsf)
gsf.hen.x = 400
gsf.shieldDrops = [{ x: 405, y: HEN_TOP - 60, landed: false, remaining: SHIELD.groundTime }]
step(gsf, 0.8, idle)
check('a shield falling on her is hers', gsf.shield !== null && gsf.shieldDrops.length === 0)

// A fresh one tops hers back up.
gsf.shield = { hits: 1 }
gsf.shieldDrops = [{ x: 405, y: HEN_TOP, landed: false, remaining: SHIELD.groundTime }]
update(gsf, DT, idle)
check('picking up another tops the shield back up', gsf.shield?.hits === SHIELD.hits)

// 54. Three hits, or one triple laser; time does nothing to it.
const shieldAfter = (powers: (1 | 2 | 3)[]) => {
  const g = newGame()
  intoPlay(g)
  g.hen.x = 400
  g.shield = { hits: SHIELD.hits }
  const lives = g.hen.lives
  for (const power of powers) {
    g.hen.invulnerable = 0
    g.lasers = [{ x: 410, y: HEN_TOP + 6, vx: 0, vy: 0, ...(power === 1 ? {} : { power }) }]
    update(g, DT, idle)
  }
  return { hits: g.shield?.hits ?? 0, livesLost: lives - g.hen.lives }
}
check('two lasers leave one hit', shieldAfter([1, 1]).hits === 1)
check('three take the shield', shieldAfter([1, 1, 1]).hits === 0 && shieldAfter([1, 1, 1]).livesLost === 0)
check('a fourth then costs a life', shieldAfter([1, 1, 1, 1]).livesLost === 1)
check('a double laser counts as two', shieldAfter([2]).hits === 1)
check('a triple takes the whole shield, and not her', shieldAfter([3]).hits === 0 && shieldAfter([3]).livesLost === 0)

const gst = newGame()
intoPlay(gst)
gst.hen.lives = 99
gst.shield = { hits: SHIELD.hits }
for (let i = 0; i < Math.round(30 / DT); i++) {
  gst.lasers = []
  gst.foxes = []
  update(gst, DT, idle)
  if (gst.phase.kind !== 'playing') break
}
check('the shield does not run out with time', gst.shield?.hits === SHIELD.hits)

const gsk = newGame()
intoPlay(gsk)
gsk.shield = { hits: 2 }
grant(gsk, { kind: 'gramophone', remaining: 12, duration: 12 })
step(gsk, 1, idle)
check('the shield carries on beside another upgrade', gsk.shield !== null && gsk.power.kind === 'gramophone')

// --- more eggs later on --------------------------------------------------------

// 55. One more egg a throw for every ten rounds, side by side, straight up.
check(
  'eggs a throw: 1 to round 10, 2 to 20, 3 to 30, 4 after',
  [1, 10, 11, 20, 21, 30, 31, 42].map(eggsPerThrow).join() === '1,1,2,2,3,3,4,4',
  [1, 10, 11, 20, 21, 30, 31, 42].map(eggsPerThrow).join(),
)
const gpt = newGame()
enterRound(gpt, 25)
while (gpt.phase.kind !== 'playing') update(gpt, DT, idle)
gpt.shots = []
gpt.shotCooldown = 0
update(gpt, DT, firing)
const throwXs = gpt.shots.map((shot) => shot.x).sort((a, b) => a - b)
check('a round-25 throw is three eggs', gpt.shots.length === 3, `${gpt.shots.length}`)
check('side by side', throwXs.length === 3 && Math.abs(throwXs[1]! - throwXs[0]! - EGG.spacing) < 0.01)
check('all going straight up', gpt.shots.every((shot) => shot.vx === 0))
for (let i = 0; i < 10; i++) {
  gpt.shotCooldown = 0
  update(gpt, DT, firing)
}
check('and still three throws in flight at most', gpt.shots.filter((s) => !s.wingman).length <= EGG.maxInFlight * 3)

// --- the beam fires no eggs ------------------------------------------------------

// 56. The beam burns by itself; the fire key throws nothing while it lasts.
const gbe = newGame()
intoPlay(gbe)
grant(gbe, { kind: 'beam', remaining: 5, duration: 5 })
gbe.shots = []
for (let i = 0; i < 30; i++) {
  gbe.shotCooldown = 0
  update(gbe, DT, firing)
}
check('no eggs are thrown while the beam burns', gbe.shots.length === 0, `${gbe.shots.length} eggs`)

// 57. One black hole at a time.
const gbo = newGame()
intoPlay(gbo)
gbo.vortex = { x: 300, y: 200, age: 0.5 }
grant(gbo, { kind: 'blackHole', remaining: 12, duration: 12 })
gbo.shotCooldown = 0
update(gbo, DT, firing)
check('a black hole cannot be fired while one is open', gbo.power.kind === 'blackHole' && gbo.vortex.x === 300)

// --- the end -------------------------------------------------------------------

// 58. Round 42 is the last.
const gend = newGame()
enterRound(gend, 42)
gend.boss = null
gend.ufos = []
gend.phase = { kind: 'playing' }
let won = 0
let gameOverWon: boolean | null = null
const endEvents = { onVictory: () => won++, onGameOver: (_s: number, _r: number, w: boolean) => void (gameOverWon = w) }
update(gend, DT, idle, endEvents)
step(gend, 2, idle, endEvents)
check('clearing round 42 ends the invasion', phaseKind(gend) === 'victory' && won === 1, phaseKind(gend))
step(gend, VICTORY.duration, idle, endEvents)
check('and the ending finishes as a won game', phaseKind(gend) === 'over' && gameOverWon === true)

const g41 = newGame()
enterRound(g41, 41)
g41.ufos = []
g41.phase = { kind: 'playing' }
update(g41, DT, idle)
step(g41, 2, idle)
check('round 41 still leads on to round 42', g41.round === 42 && phaseKind(g41) !== 'victory', `${g41.round} ${phaseKind(g41)}`)

check('the song has the lyrics asked for', SONG_LINES.map((line) => line.text).join(' ') === 'They came for the cow, and we said moo moo moo. Moo moo moo we said, and they run moooway!')
check('every line fits its two bars', SONG_LINES.every((line) => line.notes.reduce((sum, note) => sum + note.eighths, 0) <= 16))
check('and each line is up while it is sung', SONG_LINES.every((line) => lineAt(line.start) === line && lineAt(line.start + 15) === line))

// --- what the sound hangs off -------------------------------------------------

// 42. Every noise the game makes comes from an event; check each one fires.
// Each check gets fresh counts, so one run's noises cannot pass another's.
let heard: Record<string, number> = {}
const listen = new Proxy(
  {},
  {
    get: (_target, name: string) => () => {
      heard[name] = (heard[name] ?? 0) + 1
    },
  },
)

heard = {}
const gsnd = newGame()
intoPlay(gsnd)
step(gsnd, 6, firing, listen)
check('a throw is announced', (heard.onShot ?? 0) > 0, `${heard.onShot}`)
check('a fleet laser is announced', (heard.onLaserFired ?? 0) > 0, `${heard.onLaserFired}`)
check('a splat is announced', (heard.onUfoSplattered ?? 0) > 0, `${heard.onUfoSplattered}`)

heard = {}
const gsnd2 = newGame()
intoPlay(gsnd2)
grant(gsnd2, { kind: 'superEgg', remaining: 12, duration: 12 })
step(gsnd2, 1.5, firing, listen)
check('the super egg announces its splat', heard.onSuperSplat === 1, `${heard.onSuperSplat}`)

heard = {}
const gsnd3 = newGame()
intoPlay(gsnd3)
grant(gsnd3, { kind: 'burp', remaining: 12, duration: 12 })
step(gsnd3, 2, firing, listen)
check('the burp is announced once', heard.onBurp === 1, `${heard.onBurp}`)
check('and what it pops goes off', (heard.onExplosion ?? 0) > 0, `${heard.onExplosion}`)

heard = {}
const gsnd4 = newGame()
intoPlay(gsnd4)
gsnd4.shots = [egg(400, 300)]
gsnd4.lasers = [{ x: 403, y: 290, vx: 0, vy: LASER.baseSpeed }]
update(gsnd4, DT, idle, listen)
check('an egg meeting a laser is announced', heard.onLaserShotDown === 1, `${heard.onLaserShotDown}`)

heard = {}
const gsnd5 = newGame()
intoPlay(gsnd5)
const kickToy = gsnd5.obstacles[0]!
gsnd5.shots = [egg(kickToy.x + OBSTACLE.width / 2 - 6, kickToy.y + OBSTACLE.height - 4)]
update(gsnd5, DT, idle, listen)
check('a kicked toy is announced', heard.onToyKicked === 1, `${heard.onToyKicked}`)

heard = {}
const gsnd6 = createGame()
intoPlay(gsnd6)
gsnd6.freezeTimer = 0.01
step(gsnd6, 0.1, idle, listen)
check('the freeze is announced', heard.onFreeze === 1, `${heard.onFreeze}`)

// Telemetry. It must send nothing unless the switch, the agent URL and the
// player's consent are all there, never throw, and send what the dashboards
// expect when it does.
{
  type Fields = Record<string, string | number | boolean>
  const SRC = 'https://example.invalid/agent.js'
  const rig = (enabled: boolean, agentSrc: string | undefined, stored: boolean | null = null) => {
    const sent: Fields[] = []
    const calls: string[] = []
    const scripts: { src: string; onload: (() => void) | null }[] = []
    let saved = stored
    let clock = 0
    const doc = {
      createElement: () => ({ src: '', onload: null }),
      head: { appendChild: (el: (typeof scripts)[number]) => void scripts.push(el) },
    } as unknown as Document
    const t = createTelemetry({
      enabled,
      agentSrc,
      target: {
        document: doc,
        dynatrace: { sendEvent: (f) => void sent.push(f) },
        dtrum: { enable: () => void calls.push('enable'), disable: () => void calls.push('disable') },
      },
      store: { load: () => saved, save: (v) => void (saved = v) },
      now: () => clock,
    })
    return {
      t,
      sent,
      calls,
      scripts,
      saved: () => saved,
      agentArrives: () => scripts.forEach((s) => s.onload?.()),
      tick: (ms: number) => void (clock += ms),
    }
  }
  const play = (r: ReturnType<typeof rig>) => {
    r.t.gameStarted()
    r.t.powerGained('beam')
    r.tick(61_400)
    r.t.gameOver(1234, 5, true)
  }

  const off = rig(false, SRC, true)
  off.t.start()
  off.t.setConsent(true)
  play(off)
  check(
    'telemetry switched off loads nothing and sends nothing',
    off.scripts.length === 0 && off.sent.length === 0 && off.calls.length === 0,
  )

  const noSrc = rig(true, undefined, true)
  noSrc.t.start()
  play(noSrc)
  check('telemetry with no agent URL loads nothing and sends nothing', noSrc.scripts.length === 0 && noSrc.sent.length === 0)

  const unasked = rig(true, SRC)
  unasked.t.start()
  unasked.agentArrives()
  play(unasked)
  check('the agent loads before the player has answered', unasked.scripts.map((s) => s.src).join() === SRC)
  check(
    'nothing is enabled or sent before the player has answered',
    unasked.t.consent() === null && unasked.calls.length === 0 && unasked.sent.length === 0,
  )

  const declined = rig(true, SRC)
  declined.t.start()
  declined.agentArrives()
  declined.t.setConsent(false)
  play(declined)
  check(
    'a player who declines is never enabled and sends nothing',
    declined.calls.join() === 'disable' && declined.sent.length === 0 && declined.saved() === false,
  )

  const early = rig(true, SRC)
  early.t.start()
  early.t.setConsent(true)
  check('consent given before the agent arrives waits for it', early.calls.length === 0)
  early.agentArrives()
  check('and is passed on when it does', early.calls.join() === 'enable' && early.saved() === true)

  const returning = rig(true, SRC, true)
  returning.t.start()
  returning.agentArrives()
  check('a returning player who agreed is enabled without being asked again', returning.calls.join() === 'enable')
  play(returning)
  const over = returning.sent[2]
  check(
    'telemetry reports a game start, the upgrade and the game over',
    returning.sent.map((f) => f['event_properties.game_event']).join() === 'game_started,power_gained,game_over',
  )
  check('telemetry names the upgrade', returning.sent[1]?.['event_properties.power'] === 'beam')
  check(
    'a game over carries score, round, mute and length',
    over?.['event_properties.score'] === 1234 &&
      over['event_properties.round'] === 5 &&
      over['event_properties.muted'] === true &&
      over['event_properties.seconds'] === 61,
    JSON.stringify(over),
  )
  check(
    'every telemetry field is under event_properties.',
    returning.sent.every((f) => Object.keys(f).every((k) => k.startsWith('event_properties.'))),
  )

  returning.t.setConsent(false)
  const before = returning.sent.length
  play(returning)
  check(
    'taking consent back disables the agent and stops the events',
    returning.calls.join() === 'enable,disable' && returning.sent.length === before && returning.saved() === false,
  )

  let threw = false
  try {
    const broken = createTelemetry({
      enabled: true,
      agentSrc: SRC,
      target: {
        dynatrace: { sendEvent: () => { throw new Error('agent broke') } },
        dtrum: { enable: () => { throw new Error('agent broke') } },
      },
      store: { load: () => true, save: () => { throw new Error('storage blocked') } },
      now: () => 0,
    })
    broken.setConsent(true)
    broken.gameStarted()
    telemetry.start()
    telemetry.setConsent(true)
    telemetry.gameStarted()
    telemetry.gameOver(0, 1, false)
  } catch {
    threw = true
  }
  check('telemetry never throws: broken agent, blocked storage or no agent at all', !threw)
}

// Throwing rather than calling process.exit keeps this runnable without pulling
// in @types/node just for one line; an uncaught error is a non-zero exit too.
if (failures > 0) throw new Error(`${failures} check(s) failed`)
console.log('\nALL CHECKS PASSED')
