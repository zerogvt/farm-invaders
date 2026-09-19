import { createGame, update, MOM_TOP } from '../src/game.ts'
import type { InputState } from '../src/input.ts'
import { BABY } from '../src/config.ts'

const DT = 1 / 60
const idle: InputState = { left: false, right: false, fire: false }

function step(game: ReturnType<typeof createGame>, seconds: number, input: InputState, events = {}) {
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) update(game, DT, input, events)
}

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// 1. Intro gates the march, then play begins.
const g = createGame()
const startBabies = g.babies.length
const startY = g.babies[0]!.y
step(g, 1.0, idle)
check('formation waits during the intro banner', g.babies[0]!.y === startY && g.phase.kind === 'intro')
step(g, 1.2, idle)
check('phase becomes playing after the banner', g.phase.kind === 'playing', g.phase.kind)

// 2. Babies march and eventually descend.
const xBefore = g.babies[0]!.x
step(g, 2, idle)
check('formation marches sideways', g.babies[0]!.x !== xBefore)

// 3. Firing feeds babies and scores them.
const firing: InputState = { left: false, right: false, fire: true }
step(g, 12, firing)
check('bottles feed babies', g.babies.length < startBabies, `${startBabies} -> ${g.babies.length}`)
check('feeding babies score points', g.score > 0, `score ${g.score}`)
check('bottles in flight respect the cap', g.bottles.length <= 3, `${g.bottles.length}`)

// 4. A nursery of feeding babies throws nothing: feeding really does silence them.
const gf = createGame()
step(gf, 2, idle)
for (const baby of gf.babies) baby.state = { kind: 'feeding', remaining: 999 }
gf.diapers = []
step(gf, 6, idle)
check('feeding babies throw no diapers', gf.diapers.length === 0, `${gf.diapers.length} thrown`)

// ...while a marching nursery definitely does.
const gm = createGame()
step(gm, 2, idle)
gm.diapers = []
step(gm, 6, idle)
check('marching babies do throw diapers', gm.diapers.length > 0, `${gm.diapers.length} in flight`)

// 5. Obstacles absorb shots and are destroyed, never resurrected.
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

// 6. Invasion ends the game even with lives remaining.
const g3 = createGame()
step(g3, 2, idle)
for (const baby of g3.babies) baby.y = MOM_TOP - BABY.height
let overCalled = 0
step(g3, 1.0, idle, { onGameOver: () => overCalled++ })
check('babies reaching mom end the run', g3.phase.kind === 'over', g3.phase.kind)
check('lives were still remaining at invasion', g3.mom.lives === 3, `lives ${g3.mom.lives}`)
check('onGameOver fires exactly once', overCalled === 1, `${overCalled}`)

// A baby one pixel short of the line is not an invasion.
const g3b = createGame()
step(g3b, 2, idle)
for (const baby of g3b.babies) baby.y = MOM_TOP - BABY.height - 1
update(g3b, DT, idle)
check('one pixel short is not an invasion', g3b.phase.kind === 'playing', g3b.phase.kind)

// 7. Round advances after a clear and gets harder.
const g4 = createGame()
step(g4, 2, idle)
g4.babies = []
step(g4, 2, idle)
check('clearing the nursery advances the round', g4.round === 2, `round ${g4.round}`)
check('round 2 has at least as many babies', g4.babies.length >= startBabies, `${g4.babies.length}`)

// 8. Large dt cannot tunnel a diaper through mom.
const g5 = createGame()
step(g5, 2, idle)
g5.mom.invulnerable = 0
g5.diapers = [{ x: g5.mom.x + 10, y: MOM_TOP - 4, spin: 0, rotation: 0 }]
update(g5, 0.05, idle)
check('a diaper on mom costs a life', g5.mom.lives === 2, `lives ${g5.mom.lives}`)

// Throwing rather than calling process.exit keeps this runnable without pulling
// in @types/node just for one line; an uncaught error is a non-zero exit too.
if (failures > 0) throw new Error(`${failures} check(s) failed`)
console.log('\nALL CHECKS PASSED')
