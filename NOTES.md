# Working notes

Things that are not obvious from the code, the README or the commit log. The
README covers *why the game is built the way it is*; this covers *how to work on
it*.

## Where the project stands — 20 September 2026

- Branch `ufos-and-chickens`, eight commits ahead of `main`.
- **No git remote. Nothing has ever been pushed.** The branch exists because
  committing straight to `main` is disallowed; it is waiting on a remote and a
  pull request, both of which need explicit say-so.
- Renamed on 20 September 2026 from `lolinvaders` / "LOL Invaders". `base` in
  `vite.config.ts` must match the **GitHub repository name**, not the folder
  name — if they diverge, Pages serves `index.html` from one path and its asset
  tags point at another, and the page comes up blank.
- The high-score key in `src/config.ts` was renamed with everything else. It had
  never been deployed, so no real score was lost.

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

## Calls that were mine, not the user's

All are argued in the README; all are cheap to reverse if they play badly.

- **One-shot upgrades expire after 12s.** Added so that "show the countdown for
  each upgrade" could be true of all eight. Nothing else wanted it.
- **Halving laser speed was applied to the mothership too**, since both draw on
  the one `LASER` config.
- **A mothership volley is floored at one direction**, because the arithmetic
  reaches zero at round 2 and a boss that cannot shoot is not a boss.
- **Toys are proof against fire.** What now stops the player camping behind one
  is that it blocks her own eggs as readily as the fleet's lasers. If camping
  turns out to be a problem, this is where it comes from.
- **The beam and the super egg spare the toys**, and gravity waves and a thrown
  toy each cost the mothership one hit point rather than destroying it.
