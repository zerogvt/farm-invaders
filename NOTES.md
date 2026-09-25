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

