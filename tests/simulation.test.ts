import { createGame, update, HEN_TOP } from '../src/game.ts'
import type { InputState } from '../src/input.ts'
import { UFO, VIEW } from '../src/config.ts'
import type { GameState, Ufo } from '../src/types.ts'

const DT = 1 / 60
const idle: InputState = { left: false, right: false, fire: false }

function step(game: GameState, seconds: number, input: InputState, events = {}) {
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) update(game, DT, input, events)
}

/** Drops an egg right on a saucer's canopy and lets the next frame resolve it,
 *  so the splatter goes through the real collision path rather than being
 *  assigned straight into the state. */
function throwEggAt(game: GameState, ufo: Ufo) {
  game.eggs = [{ x: ufo.x + UFO.width / 2 - 6, y: ufo.y + UFO.height / 2, spin: 0, rotation: 0 }]
  update(game, DT, idle)
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
const firing: InputState = { left: false, right: false, fire: true }
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

// 9. Round advances after a clear and gets harder.
const g4 = createGame()
step(g4, 2, idle)
g4.ufos = []
step(g4, 2, idle)
check('clearing the sector advances the round', g4.round === 2, `round ${g4.round}`)
check('round 2 has at least as many saucers', g4.ufos.length >= startUfos, `${g4.ufos.length}`)

// 10. Large dt cannot tunnel a laser through the hen.
const g5 = createGame()
step(g5, 2, idle)
g5.hen.invulnerable = 0
g5.lasers = [{ x: g5.hen.x + 10, y: HEN_TOP - 4 }]
update(g5, 0.05, idle)
check('a laser on the hen costs a life', g5.hen.lives === 2, `lives ${g5.hen.lives}`)

// Throwing rather than calling process.exit keeps this runnable without pulling
// in @types/node just for one line; an uncaught error is a non-zero exit too.
if (failures > 0) throw new Error(`${failures} check(s) failed`)
console.log('\nALL CHECKS PASSED')
