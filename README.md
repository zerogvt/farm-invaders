# LOL Invaders

Space Invaders, except the invaders are flying saucers with enormous windscreens
and the defender is a chicken in a space helmet, armed with eggs.

An egg does not shoot a saucer down. One that connects bursts across the canopy
and blinds the pilot: the saucer drops out of the formation, hangs there reeling
for a moment, then banks over and limps off whichever side of the screen is
nearer. It scores when it is gone. Toys scattered across the floor absorb
anything that hits them — the hen's eggs and the saucers' lasers alike — until
they fall apart.

**The toys are not nailed down.** An egg comes from below, so it punts the toy it
hits up into the fleet, and anything a loose toy ploughs into goes up. Every
wreck costs the toy a hit point, so a punted teddy bear is worth three or four
saucers and no more. Lasers only damage a toy; they never move one, because a
toy pushed downwards is cover turning into a hazard the hen cannot dodge.

**Every second round is a mothership** rather than a fleet. It takes one egg per
round number to see off, and the banner says so before the round starts. It
answers with a volley of two directions fewer than the round number, fired at
half the rate it once was — it is also the only thing out there that shoots at
an angle, since rank-and-file saucers only ever fire straight down.

**A tenth of every fleet deserts.** Somewhere in each round, one saucer in ten
decides it has had enough, says **make ❤️ not war** and flies home. They leave
unscored: talking somebody out of a fight is not the same as winning it.

**Every 2000 points is another hen**, awarded for each threshold crossed rather
than one per payout, so a single screen-clearing upgrade can hand back two.

**On about one round in three, Einstein turns up**, says **time freeze mate**,
and stops the board. The hen and everything she has already thrown carry on;
saucers, the mothership, lasers, loose toys and the clock on a Rambo egg all
stop where they are for five seconds. An egg that lands while time is stopped
does not start a retreat — there is nothing to retreat — so whatever it hits
simply goes up and scores on the spot.

**Watch the corners for a Rambo egg.** On roughly two rounds in five one turns up
in a top corner, sits there for ten seconds, and upgrades the hen's eggs if she
can hit it before it leaves. Which upgrade is not up to her:

| Upgrade | What it does |
| --- | --- |
| Multishot | Every shot becomes a fan of 5–20 eggs, for six seconds. |
| Super egg | One shot. It bursts at mid-screen and clears the sky outright. |
| Beam | A continuous beam for six seconds. It burns whatever it touches, and needs one second on the mothership per egg the mothership would have cost. |
| Shield | Ten seconds during which lasers simply do not land. |
| Exploding heart | One shot. The whole fleet deserts. The mothership declines — *"no xmas truce. This aint 1914. I'm da central command!"* — and the hen gets a super egg for her trouble. |
| Gravity waves | Five seconds of expanding rings. Anything a ring washes over loses attitude control, tumbles off at random, and detonates against whatever it blunders into, itself included. |
| Black hole | One shot. Three egg-radii across, swallowing everything inside twice that as it climbs. |
| Gramophone | One shot. It drifts up playing, and three seconds later the entire fleet goes up with it. |

Every upgrade announces itself over the playfield, because which one you have is
not something you chose.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173/lolinvaders/
npm test         # headless simulation checks
npm run build    # typecheck + production build into dist/
```

Controls: `←` `→` or `A`/`D` to move, `Space` to throw an egg.

## How it is put together

No game engine and no image files. Plain TypeScript, Canvas 2D, and Vite.

| File | What lives there |
| --- | --- |
| `src/config.ts` | Every tunable number. Balancing happens here and nowhere else. |
| `src/game.ts` | The whole simulation: marching, splattering, retreats, the mothership, upgrades, collisions, rounds. Touches no DOM, which is why it can be tested headlessly. |
| `src/sprites.ts` | Every sprite, drawn with canvas paths at startup. The only file that knows what anything looks like. |
| `src/render.ts` | Draws a frame from game state. Never mutates it. |
| `src/ui.ts` | Title card, round banner and game-over panel, as real DOM so buttons and the initials field are keyboard-operable. |
| `src/scores.ts` | High scores in `localStorage`. |
| `src/input.ts` | Keyboard state. |
| `src/main.ts` | Canvas setup and the frame loop. |

### Design decisions worth knowing

**A splattered saucer leaves the formation outright.** It stops taking march
steps, steers itself, and is skipped by the wall-bounce bounds, the front-line
firing check and the invasion check. That last part matters more than it looks:
a retreating saucer crossing the side wall would otherwise bounce and drop the
entire formation on the hen's head, and one sinking past the line on its way out
would end the run. There is a test for each.

**It scores when it leaves, not when it is hit.** The retreat is the reward
animation, and paying out at impact would make the last second of it dead time.
The cost is that a round is not cleared until the final saucer is fully out of
the view, which is about a second of watching it go.

**A second egg into a splattered saucer is wasted.** It bursts on a windscreen
that is already covered and the saucer is unaffected. With only three eggs
allowed in flight, that is the entire cost the retreat delay imposes, and
removing it would make the delay purely cosmetic.

**The mothership is its own field, not a saucer with a flag.** `state.boss` sits
beside `state.ufos` rather than inside it, because almost nothing a saucer does
applies to it: it does not march, does not hold a column, does not die to one
egg, and steers itself. Threading a `boss: true` through the formation code
would have meant a special case in every function that walks `ufos`. What it
does share is the retreat, so it reuses `UfoState` for that and nothing else.

**One second of beam equals one egg.** The beam takes the mothership down at one
hit point per second, so the rule "as many seconds as it would have taken eggs"
is arithmetic rather than a second mechanic to keep in step with the first. The
beam passes straight through the toys: they are the player's cover, and watching
it evaporate under their own upgrade reads as a bug however it is explained.

**The super egg spares the toys and the mothership's hit points alike.** It
clears every saucer and whatever the mothership has left, which makes it wildly
strong on a boss round — that is the point of a one-in-sixteen pickup. It leaves
the obstacles standing, because the best thing in the game should not also be the
thing that strips your cover.

**An upgrade survives the round it was won in.** Timers keep running across the
round break rather than being reset by `startRound`, so a shield picked up in the
last second of a round is not confiscated for clearing it.

**The freeze exempts the hen, not the player.** `update` runs the hen, her
shots, her waves and her beam every frame and skips the rest of the board's
ticks while `state.freeze` is set. Advancing lasers had to be split out of
advancing her shots for that, which is the only structural cost of the whole
feature.

**A stopped laser cannot hurt anybody.** Collisions between lasers and the hen
are skipped for the duration. A frozen laser is a stationary object, and walking
into one costing a life would make a gift into a hazard — including the case
where time stops with one already sitting on her.

**Stopped time is not a free mothership.** Eggs still take it one hit point at a
time. It cannot shoot back for five seconds, which is reward enough.

**One state for every way off the board.** `UfoState` has a single `leaving`
variant with a `reason`, rather than separate `splattered` and `deserting`
kinds. The two share every movement rule — hang in place, turn for the nearer
wall, accelerate — and differ only in the sprite, the speech bubble, whether
they sink, and whether they score. Two variants would have meant two copies of
the exit code drifting apart.

**Only the mothership shoots at an angle.** Rank-and-file lasers all travel
straight down. Lasers still carry a velocity rather than a fixed fall, because
the mothership's fanned volleys need it, but nothing else uses it.

**Deserters and hearts pay nothing.** Score is for saucers the player actually
drove off. Everything that leaves of its own accord — a scheduled desertion, or
a whole fleet talked out of it by a heart — leaves unscored, which is the price
of the heart being the most spectacular thing in the game.

**Three upgrades take the mothership outright** (super egg, black hole,
gramophone), two grind it down (the beam at one hit point per second, gravity
waves at one per wave), the heart is refused, and multishot and the shield do
what they always do. That spread is deliberate: a boss round should sometimes be
stolen by a lucky pickup, but two of the eight have to be earned and two are no
help at all.

**Difficulty scales on four axes, not one.** Each round adds rows (to five),
fires lasers more often and faster, allows more of them on screen at once, and
starts the formation lower. On top of that the formation accelerates as its
ranks thin within a round, so the last saucer is the frightening one. The fleet
is six columns by two ranks in round 1, narrower and shallower than it once was,
which is the single biggest lever on how hard the early rounds feel.

**Toys are destructible on purpose, and now spendable too.** They absorb four
shots and then break. An indestructible shield would turn every round after the
third into camping behind one, which is exactly the failure the original's
erodable bunkers avoid — and now that a toy can be launched into the fleet,
those four hit points are also the player's decision about whether cover is
worth more standing still or in the air.

**A wrecked saucer costs the loose toy a hit point.** Without that, one egg into
a toy would sweep a whole column and the toy would still be climbing. With it, a
kick is worth three or four saucers, the toy's hit points stay the currency they
always were, and punting cover into the fleet is a trade rather than a free
win.

**Toy placement is constrained, not freely random.** The usable width is divided
into one lane per toy and each toy is jittered inside its own lane. They can
therefore never overlap at the start of a round, never touch the walls, and
never line up into a barrier that seals off a column. Once they are loose they
are free to go anywhere, including through each other — four toys are too few
for toy-on-toy collisions to be worth the frame time.

**Sprites are drawn in code rather than loaded.** Cruder than hand-drawn art, but
identical on every platform, nothing to license, and clean and egg-covered
canopies can share one hull. Swapping to emoji or PNGs means rewriting
`src/sprites.ts` and nothing else.

### Known limits

- **Desktop keyboard only.** There are no touch controls, so the game is not
  playable on a phone. Adding them means a second input source writing the same
  three fields in `src/input.ts`.
- **No sound.**
- **High scores are per-browser.** They live in `localStorage`, are not shared
  between players or devices, and vanish when site data is cleared.
- **Einstein cannot be missed, or sought.** The visit is on a timer, not a
  pickup: there is nothing to shoot and nothing to steer towards, so a round
  either gets one or does not.
- **Upgrades are not chosen.** Which of the four a Rambo egg grants is random and
  cannot be influenced. That is deliberate — being able to plan around it would
  spoil the joke — but it does mean a run can be decided by a coin flip.
- **The obstacles are still nursery toys.** They are carried over from the
  previous theme, so a cradle and a teddy bear are what shields the hen from
  orbital laser fire — and, now, what she fires back. Replacing them is confined
  to the four toy painters in `src/sprites.ts` and the `ToyKind` union.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to
`main`. It assumes **this directory is the repository root**. Two things must be
true before it works:

1. The repository is named `lolinvaders`, so that `base` in `vite.config.ts`
   matches the URL GitHub Pages serves from (`/lolinvaders/`). If the repository
   has a different name, change `base` to match it.
2. Pages is enabled with **Settings → Pages → Source → GitHub Actions**.
