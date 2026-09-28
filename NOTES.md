# Working notes

Things that are not obvious from the code, the README or the commit log. The
README covers *why the game is built the way it is*; this covers *how to work on
it*.

## Where the project stands — 20 September 2026

- Branch `main`, tracking `origin/main` at
  <https://github.com/zerogvt/farm-invaders.git>. All twelve commits are pushed
  and the two refs are level. The branch was called `ufos-and-chickens` for as
  long as there was no remote to open a pull request against; it was renamed to
  `main` when the repository was created.
- **A push to `main` is a deploy.** `.github/workflows/deploy.yml` runs
  `npm ci`, `npm test` and `npm run build` on every push and publishes `dist/`
  to GitHub Pages, so a red check is a failed deploy rather than a note to
  yourself.
- Renamed on 20 September 2026 from `lolinvaders` / "LOL Invaders". `base` in
  `vite.config.ts` must match the **GitHub repository name**, not the folder
  name — if they diverge, Pages serves `index.html` from one path and its asset
  tags point at another, and the page comes up blank. It is `/farm-invaders/`,
  which matches the repository that was created.
- The high-score key in `src/config.ts` was renamed with everything else. It
  had never been deployed at that point, so no real score was lost.

## Running the checks

`npm test` is one file of plain asserts — no framework, no runner. `npm run
build` typechecks first, so a green build means a green `tsc`.

**Several checks are probabilistic. A single green run means little.** Re-run
before trusting one:

```bash
npx esbuild tests/simulation.test.ts --bundle --platform=node --format=esm \
  --outfile=node_modules/.cache/simulation.test.mjs
for i in $(seq 1 40); do node node_modules/.cache/simulation.test.mjs | grep '^FAIL'; done
```

Three helpers keep the rest deterministic, and new checks should use them:

- `newGame()` — a game with Einstein's time freeze switched off. Almost every
  check measures how far the board gets in N seconds, and a random five-second
  stop measures nothing.
- `enterRound(game, n)` — `startRound` plus the same guard, because `startRound`
  re-rolls the visit.
- `intoPlay(game)` — runs to the first playing frame. Round 1 opens with the
  parley, so counting seconds to clear the intro does not work.

Every flake found so far has had the same shape: **sampling one instant instead
of watching the window.** A laser that reaches the hen clears the whole array on
its way out; a saucer caught by a gravity wave can detonate before the window
closes. Count across the run instead.

## Seeing what it actually looks like

No test can tell you a sprite reads wrong, and several have. Render offscreen
and look at it:

1. Write a harness that imports `src/render` and `src/sprites`, builds a
   `GameState` and calls `render` into a canvas.
2. Bundle it with **`--format=iife`**. ES modules are blocked over `file://`.
3. Stage the harness and its HTML **inside the project directory**. Chromium
   here is a snap and gets a private `/tmp`, so anything written to the
   scratchpad is invisible to it and its screenshot vanishes.
4. Run `chromium-browser --headless --no-sandbox --screenshot=… file://…` with
   the **bash sandbox disabled** — `snap-confine` needs capabilities the sandbox
   strips. Pass `--user-data-dir` inside the project too, and delete it between
   runs or the old bundle gets served from cache.
5. Delete the staging directory afterwards; it is not gitignored.

This is how the following were caught, none of which any test would have found:
exhaust plumes rendering as black holes in the starfield, explosions drawn at
the super egg's radius no matter how small they were, Einstein reading as a
sheep, and a speech bubble punched through the score counter.

## Hearing it

No test hears anything either. The simulation checks confirm that each sound
*event* fires; they cannot say whether the sound is any good. What was measured:
every effect in `src/audio.ts` was rendered through an `OfflineAudioContext` in
headless Chromium and checked for a non-zero peak and no NaNs. Two things about
doing that here:

- **One offline render per page.** Headless Chromium finished the first
  `startRendering()` on a page and never the second, and never finished a
  single long render either. One short page per effect worked, with the odd
  retry.
- **The theme never rendered at all** that way, even at two bars. When it was
  written (23 September 2026) it had not been heard or measured by anyone;
  listen to it in a real browser before trusting it or a change to it.

Loudness is three numbers at the top of `src/audio.ts` (`MASTER_VOLUME`,
`MUSIC_VOLUME`, `SFX_VOLUME`); per-effect peaks are inside each effect.

## Calls that were mine, not the user's

All are argued in the README; all are cheap to reverse if they play badly.

- **One-shot upgrades expire after 12s.** Added so that "show the countdown for
  each upgrade" could be true of all of them. Nothing else wanted it.
- **Halving laser speed was applied to the mothership too**, since both draw on
  the one `LASER` config.
- **A mothership volley is floored at one direction**, because the arithmetic
  reaches zero at round 2 and a boss that cannot shoot is not a boss.
- **Toys are proof against fire.** What now stops the player camping behind one
  is that it blocks her own eggs as readily as the fleet's lasers. If camping
  turns out to be a problem, this is where it comes from.
- **The beam and the super egg spare the toys**, and gravity waves and a thrown
  toy each cost the mothership one hit point rather than destroying it.

Added on 23 September 2026, from one request of eight items:

- **Still four toys a round.** "One more debris item: a bicycle and a tractor"
  was read as two more *kinds*, so each round now draws four of six. Raising
  `OBSTACLE.count` to 5 is the other reading; the lanes adapt, but a fifth toy
  narrows the gaps between them.
- **"No holes" was applied to the toys only.** Their scuff marks and the fade
  that went with them are gone; the `scuffs` field is removed. The mothership
  keeps its egg splats — they are egg on the canopy, not holes, and they are the
  only damage readout it has.
- **The burp is fired, not automatic.** It is a one-shot like the gramophone, on
  the same 12s hold, so the player chooses the moment. Bubbles pop splattered
  and tumbling saucers as well as flying ones, skip deserters, ignore toys and
  lasers, and take one mothership hit point each.
- **The wingman patrols by herself** rather than following the hen, and absorbs
  the lasers that reach her rather than letting them through. She throws one
  egg every 0.3s. Picking up another Rambo egg while
  she is out replaces her, as any upgrade replaces the last.
- **The extra egg every eight rounds was taken out again** the same day, at
  Vasilis's call: with two and three eggs a throw the late rounds were far too
  easy. One egg a throw, three in flight, whatever the round. The multishot
  upgrade was left alone — it is a pickup on a six-second clock, not a
  permanent bonus.
- **The theme is an original composition, synthesised**, rather than a CC0
  track from somewhere. "One with no royalties" is then true by construction,
  there is no file to host, and no licence to keep a copy of. A downloaded
  track is the other reading, if this one does not please.
- **The wingman's eggs are silent** (her hits are not): at one every 0.3s for
  ten seconds they drowned everything else.
- **Sound starts on, and the music plays everywhere**, title screen included,
  from the first click or key press. Muting suspends the whole audio context,
  so the tune pauses rather than carrying on silently.
- **Repeated effects are rate-limited** (`MIN_GAP` in `src/audio.ts`), so a
  gramophone finale popping thirty saucers in one frame is one bang, not thirty
  summed into clipping.
- **Egg-meets-laser applies to ordinary eggs only**, the wingman's included,
  and works during a freeze too. The super egg and the rest of the heavy
  ordnance still pass through everything.

Added on 24 September 2026, with Dynatrace telemetry:

- **The agent is injected from `src/telemetry.ts`**, not written into
  `index.html`, so that the kill switch and removal both stay in one file. The
  cost is that the agent arrives slightly after the page starts loading, so
  Dynatrace's page-load timings for the very start of the load are less
  complete than they would be with the tag first in `<head>`. For a single-page
  canvas game that loads once, that seemed the better trade.
- **Events go through the new RUM experience's `dynatrace.sendEvent`**, which
  accepts only `event_properties.*` fields. A Dynatrace application on RUM
  Classic would need `dynatrace.sendBizEvent` instead — change it in `send()`.
- **The `@dynatrace/rum-javascript-sdk` npm package is not used.** It is a
  no-op-safe wrapper around the same global. The file does that itself in a
  few lines, to avoid adding a dependency.
- **Three events only**: start, upgrade picked, game over. A per-round event
  was left out on purpose, because every event is billed. Mute state rides
  along on `game_over`, so `src/soundToggle.ts` needed no changes.
- **Nothing is live until `DT_RUM_SRC` is set.**

Added on 25 September 2026, the consent prompt (the tenant was switched to
opt-in mode the same day):

- **The prompt is a small card in the bottom left corner**, not a modal. It
  covers the cow's patch of ground until it's answered, and it never blocks
  play. After an answer it becomes a "Stats on / off" pill in the same place,
  because taking consent back should be as easy as giving it.
- **The agent loads before the player answers.** In opt-in mode it sets no
  cookies and captures nothing until it's enabled, and loading it early means
  an "Allow" takes effect at once. If that is too much, delay the script tag
  until consent in `start()`, at the cost of losing the page load for players
  who agree.
- **`dtrum.enable()` / `disable()` are called on every load** according to the
  stored answer, not just once. That's idempotent, and it doesn't rely on the
  agent remembering.
- **The events are also held back in code** without consent, not only by the
  agent, so a tenant accidentally switched out of opt-in mode still gets
  nothing from players who declined or never answered. Page loads and errors,
  though, are the agent's own and would be captured in that case.
- **Its CSS is in `telemetry.ts`**, injected as a `<style>`, so deleting the
  file removes it. The answer lives in `localStorage` under
  `farminvaders.telemetry-consent.v1`.
- Seen in headless Chromium against a stand-in agent: the card when
  unanswered, "Stats on" with `enable()` called for a stored yes, and
  "Stats off" with `disable()` for a stored no. The click path itself is
  covered by the tests, not a browser.

Added on 25 September 2026, from one request of six items:

- **A fox costs one life**, the same as a laser (Vasilis chose that over
  instant game over). It passes through toys and the wingman, eggs go
  through it, and the black hole leaves it alone. The shield and post-hit
  invulnerability are the only protection. Frozen foxes cannot hurt, like
  frozen lasers. They come only on fleet rounds, one every 8–16s (`FOX` in
  `src/config.ts`), from round 1. Tests switch them off in `newGame()` and
  `enterRound()`, as they do Einstein, because a random lost life would break
  every check that counts lives.
- **After landing, the fox runs for the nearer wall** rather than stopping
  where it lands. That was my addition. It makes it a ground hazard for a
  moment, not just a slower laser.
- **The wiper heals** (Vasilis's choice): each cleared egg is a hit point
  back. "About 20%" is `Math.round(showing * 0.2)`, so it does nothing below
  three eggs on the canopy, and the round-2 mothership, with two hit points,
  never wipes. It runs every 5–10s (`WIPER`).
- **The black hole opens at a random spot** in a band of sky (`BLACK_HOLE`)
  and swallows the mothership outright (both Vasilis's choices). What is
  still falling in when it times out at four seconds is swallowed as it
  closes, so a round can never get stuck on a hull circling nothing. It now
  takes the Rambo egg's twelve-second hold, like the other one-shots.
- **The alien doll is a floor toy** (Vasilis's choice), so each round now draws
  four of seven kinds.
- **The cow is mirrored as a whole** in its painter, so its shapes are still
  laid out facing left. The burp mouth and the speech bubble moved to the
  right-hand end with it.
- **The chicken sound replaces the old squawk** on the same `hurt` effect. Like
  the theme, it has not been heard by anyone yet; the three new effects (`fox`,
  `blackHole`, `wipe`) have not either.

Added on 26 September 2026, from one request of five items:

- **Fox pacing** is a straight ramp: 26s between foxes in round 1, falling
  evenly to 7s by round 20, each gap ±30%. There's a cap of 4 a round
  (`FOX.maxPerRound`). The request gave rounds 1–10 as "less often" and
  asked for gradual growth; the numbers are mine.
- **Fox sitting time** ramps from 1s in round 1 to 10s by round 19. It is
  still deadly while it sits. It runs away from the hen's side of it,
  whichever wall that is, not to the nearer wall any more.
- **Wide lasers** start at round 3 (double) and round 6 (triple). The chances
  grow by 2.5% and 1.5% a round, to caps of 25% and 15%, reached around
  rounds 13 and 15. My first cut, 35%/25%, made most lasers wide by round 15,
  which is more than "some". **Only fleet saucers** fire them; the
  mothership's angled volleys stay single. A wide laser still costs one life.
  An egg narrows it about its middle. Toys, the beam and the shield treat it
  like any laser.
- **The opening mothership is scenery.** It is drawn from the parley phase's
  timing in `src/render.ts`, not a `Boss` in the state, so nothing can shoot
  it. The parley is now three beats (arrive and demand, the hen's answer,
  leaving; `parleyDuration()`). The fleet is on screen throughout but silent.
- **The voices are formant synthesis**, not recordings: a buzz through two
  moving bandpass filters, one syllable at a time. The mothership's voice is
  also ring-modulated at 38 Hz. They carry the rhythm and vowels of the line,
  not intelligible words. Each boss syllable was rendered offline and is
  non-silent. The whole line never finished rendering headless, and neither
  voice nor *Mothership March* has been heard by anyone yet.
- **Headless offline renders stall at random, not only on long buffers.** A
  syllable that hung one run rendered on the next. Retry several times before
  suspecting the effect.
- **Music switches on `game.boss`**, so the march plays through a boss
  round's banner and stops when the mothership goes down. The closing scene
  keeps whatever was playing. A switch restarts the new tune from its top.

Added on 26 September 2026, from one request of three items:

- **The mothership rolls wide lasers** on the same odds as the fleet
  (`rollLaserPower`), per laser in a volley. Its angled lasers keep an
  axis-aligned hit box as wide as they are drawn.
- **Chasers are fixed at the drop**: `chaser` is set when a fox is thrown, from
  `foxWait(round) > FOX.chaseAfterWait`. So it is per round, not per fox — every
  fox from round 11 (the first fleet round past 5s) chases, none before.
  The chase is my design, to keep Vasilis's earlier rule that a fox must not be
  a certain loss. The hen cannot pass a fox, so an endless chase always wins.
  It goes at 190 px/s against her 330, follows her, and quits after 3s
  (`FOX.chaseSpeed`, `FOX.chaseDuration`). From one end of the ground to the
  other she outlasts it; from the middle she needs to move early.
- **Rambo eggs per round**: band `max(0, floor(round / 10) - 1)`, plus one with
  chance 0.7. Round 20 is the first round of the 1–2 band, reading "levels
  20–30" that way. Rounds 1–19 now show one 70% of the time, up from 40%: a
  real balance change, and it was asked for. They come one at a time; the next
  is scheduled 3–8s after one is shot or leaves (`pickupsLeft`).
- **The shield is its own field** (`state.shield`), not an upgrade kind, so it
  can run beside another one; `Gained` is what a Rambo egg can turn into.
  Picking up a second shield restarts its clock. The HUD shows it on the right.
- Two old checks read the prize off `power` and would have failed whenever the
  roll was the shield (one in ten); they now accept either.

Added on 26 September 2026, from one request of nine items:

- **A free life every 4000 points**, up from 2000.
- **Shields come from deserters, not Rambo eggs.** Each deserter has a 50%
  chance to drop one, the heart's mass desertion included, so a heart can
  shower the ground with them. A fresh one tops the shield back up to 3.
  `state.shield` is `{ hits }` now; there is no clock.
- **A wide laser into the shield costs its full power in hits and is
  absorbed**, even if the shield had fewer hits left: a triple on a 1-hit
  shield takes the shield and spares the hen. The request said "3 hits (or a
  triple laser)"; what happens to the leftover power was mine to pick.
- **A fox touching a shielded hen costs one hit** and gives her
  `SHIELD.foxGrace` (1s) of invulnerability to get past it. Without the grace a
  sitting fox would drain the whole shield in three frames. My call.
- **Eggs per throw**: `ceil(round / 10)`, capped at 4, side by side
  `EGG.spacing` apart. The in-flight cap counts throws (3), and a whole throw
  has to fit under it. This is the second time extra eggs have been added: the
  first (every 8 rounds) was reverted in PR #3 as far too easy. This one was
  asked for outright, but watch for the same complaint.
- **The beam bug**: `tryShoot` had no branch for the beam, so the fire key
  still threw ordinary eggs while it burned. It now returns early. While there,
  a second black hole can no longer be fired while one is open.
- **The ending**: clearing round 42 (a boss round) leads to a `victory`
  phase, not round 43. `onGameOver` carries a `won` flag, and the panel says
  "The cow is safe". The scene is all in `drawVictory` in `src/render.ts`. The
  song's notes and lyrics live in `src/song.ts`, so the audio and the bubbles
  share one timing. Music is `silence` while the fleet leaves (the sad trombone
  is an effect), then `song`, which keeps looping behind the panel.
- **The song has not been heard.** Three of its four lines render offline with
  sound and no NaNs. The last line, which all three sing at once, never
  finished rendering headless, though it schedules without an exception.

Added on 26 September 2026:

- **A fox breaks the shield outright**, however many hits it had left
  (`hitShield(state, state.shield.hits)`, so the hit sound still plays). The
  1s `SHIELD.foxGrace` stays. Without it, the fox that broke the shield would
  still be touching her on the next frame and cost a life anyway, which would
  make the shield useless against foxes. My call.
- **Motherships drop foxes**, from under their middle, on the same schedule
  and four-a-round cap as the fleet (`foxHatch`), but only while flying: a
  beaten one limping away drops none. Their foxes chase from round 11 like
  any other.

Added on 27 September 2026, from one request of three items:

- **Foxes never chase any more.** The chase from 26 September is gone, along
  with the brighter glow that warned of it, at Vasilis's call. Every fox
  sits, then runs off the side away from the hen.
- **Fruit** crosses the top of the screen at `FRUIT.y`, one at a time: first
  5–12s into a round, then 9–20s after one leaves or is shot. Value goes with
  the kind (`FRUIT.kinds`): 100 to 2000, weighted so about 92% are at most
  1000. Tying value to kind, rather than rolling a free number, was my call,
  so players can learn which to go for. Ordinary eggs hit it, the wingman's
  included; the heavy ordnance passes through, as everywhere else. It freezes
  with the fleet. Tests switch fruit off in `newGame()` and `enterRound()`,
  because an egg hitting a passing fruit would upset checks aimed at things
  up there.
- **The ending no longer stops.** The `victory` phase gains `announced`. After
  `VICTORY.duration` it fires `onGameOver(…, true)` once and stays in
  `victory`, and `main.ts` keeps updating the game while the panel is up,
  so the dance and the looping song carry on until restart. This could not
  be driven end to end in headless Chromium: its virtual clock hardly runs the
  animation loop, so a scripted playthrough never got past round 42's
  banner. The simulation side is tested.
- **Telemetry sends only `game_started` and `game_over`** now; `power_gained`
  was removed at Vasilis's request, along with its `power` property.

Added on 27 September 2026, from one request of seven items:

- **Nobody is killed.** Every hit on a saucer goes through `hitUfo`, which
  sends it off `splattered` (an egg) or `damaged` (anything else: a toy, the
  gramophone, two tumbling saucers bumping). It limps off and scores when it
  is gone. The only thing that still goes bang is a toy breaking up. The black
  hole is the one exception to "nothing disappears", since the same request
  asked it to swallow everything; the README calls it a wormhole that sends
  them home. A deserter it swallows scores nothing, as before.
- **Bubbles capture**: a saucer in the fight that a burp bubble touches becomes
  `bubbled` and rides the bubble's velocity off the screen.
- **Fruit drops** from 12% of hit saucers (`hitUfo` and bubble captures), falls,
  lies 5s, and is collected by touch like a shield. The request was "stay on the
  ground for a while like the foxes"; collecting by touch was my reading,
  since eggs only fly upwards.
- **One egg a throw again.** The per-decade extra eggs are gone, the second
  time extra eggs have been taken out. I read "Hen always shoots 1 egg at the
  beginning of each round" as restating that. Upgrades still carry over the
  round break; if it meant they should reset every round, that is a one-line
  change in `startRound`.
- **The black hole takes everything but the hen, her wingman and the cow**:
  saucers, the mothership, toys, foxes, fruit, shield drops and the Rambo egg
  become `debris` and spiral in; lasers, eggs in flight and bubbles are
  cleared. The HUD's letters and the stars within 360px are pulled in
  *by the renderer only* (`pulled`/`swirled` in `render.ts`) and fade back over
  `BLACK_HOLE.hudReturn` once it closes. The cow's clinging to the screen edge
  is drawing only too; the cow has no state.
- **Einstein** visits one round in six, down from three.
- **Dizzy hen**: a hit sets `hen.dizzy` (1.1s), during which she cannot move or
  throw. It sits inside the 1.6s immunity, so she is never hit while she is
  down. At game over she stays lying down through the abduction.

Added on 27 September 2026, phone support:

- **Touch steering**: `createInput(window, canvas)` listens to touch and pen
  pointer events on the canvas, not the mouse. The first finger sets
  `input.targetX` (playfield pixels, via `toPlayfieldX`) and `fire`; a second
  finger is ignored; lifting clears both. `moveHen` heads for `targetX` at the
  hen's normal speed and stops on it. The keyboard, if used, wins. The
  3-in-flight egg cap keeps auto-fire from being an advantage.
- **Page**: `touch-action: none` and friends on `#game` (no scroll, zoom,
  double-tap zoom, selection, long-press menu); `overscroll-behavior: none` on
  the body; `dvh` sizing so a phone's address bar is left out.
- **Portrait**: `(orientation: portrait) and (pointer: coarse)` hides the game and
  shows "Turn your phone sideways to play" (`#rotate` in `index.html`).
- **Short screens**: `(max-height: 520px)` tightens the panels, and they scroll
  if they still overflow.
- **Touch instructions**: shown on the title screen on coarse-pointer devices.
- **Canvas sharpness** is capped at 2x on coarse-pointer devices (3x elsewhere).
- Audio also unlocks on `touchend`, for older iPhones.
- **How it was checked**: headless Chromium can be made to report a touch screen
  with `--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1
  --touch-events=enabled`. That showed the touch title text, the portrait hint
  and the landscape layout at 844×390, and synthetic touch pointer events drove
  `createInput` correctly. Steering in the running game could not be seen,
  because the virtual clock barely advances the loop. It is covered by the
  simulation tests. **Not yet tried on a real phone.**

Added on 28 September 2026, from one request of two items:

- **The hen hangs on in the black hole**, like the cow. Her feet stay where
  they are, and she leans towards the hole (her angle to it, amplified 1.6x
  and capped at about 70°), stretched and shaking. It's drawing only, like the
  cow's: she still moves and throws. Both use one grip curve (`holdingOn` in
  `src/render.ts`). She says "Bawk! Hold on!" unless she is within 230px of
  the left wall, where the cow's bubble is. The wording, and leaving out the
  wingman and a dizzy hen, were my calls.
- **The swirl takes 30% longer**: `BLACK_HOLE.slowdown` (1.3) divides the fall,
  the orbit, the debris tumble, the hole's spinning arms and the HUD letters
  being drawn in. The path is the same, only slower. `maxDuration` went from
  4s to 5.2s with it, so the hole isn't cut short. The time a hole blocks the
  round goes up by the same 30%.

Added on 28 September 2026, the screen-time limit:

- **The clock is the frame clock**, milliseconds since the page loaded
  (`requestAnimationFrame`'s timestamp), so a reload is the only reset, as
  asked. Title screen, game-over panel and a backgrounded tab all count; it
  measures time on the page, not time spent playing, since that's what screen
  time is. My call. On some platforms that clock stops while the computer
  sleeps, so a closed laptop does not use the time up.
- **The numbers** are `BEDTIME` in `src/config.ts`: 30 minutes, the countdown
  from 10, red for the last minute (the red was my addition).
- **The countdown is on the canvas**, under `ROUND n`, not a DOM element. The
  canvas is drawn behind the title and game-over panels as well, so it shows
  on every screen. On a mothership round the eggs-left line moves down a row
  to make room.
- **Bedtime is a screen in `main.ts`** (`screen = 'bedtime'`), not a game phase.
  The simulation stops being updated and the panels and banner are hidden, so
  there is nothing left to press. Only the sound button and the stats pill
  remain. A high score being entered at that moment is lost. No telemetry
  event is sent for it.
- **The alien is a saucer's pilot**, sitting in a parked saucer on the hill,
  since there is no standalone alien sprite (the alien doll is a toy). The
  scene is `renderBedtime` in `src/render.ts`, on the ending's `drawNight`.
- **The lines and the lullaby are mine**, in `src/lullaby.ts`: three spoken
  goodnights, then four sung lines, about 38s a loop. The spoken ones go
  through the singing voice as quick falling notes with nothing under them.
  Like the other voices, none of it has been heard by anyone yet. The scene
  was checked in headless Chromium, in stills of each part of the loop.
- **No test hook to shorten the limit** in the page (a URL parameter would be
  a way round it for anyone who found it). To see bedtime locally, lower
  `BEDTIME.limit` in `config.ts` for the session.
- The fruit drop-rate check was flaky (about one run in a thousand fell
  outside its bounds by chance); it now samples 120 games instead of 40.
