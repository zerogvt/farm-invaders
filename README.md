# LOL Invaders

Space Invaders, except the invaders are flying saucers with enormous windscreens
and the defender is a chicken in a space helmet, armed with eggs.

An egg does not shoot a saucer down. One that connects bursts across the canopy
and blinds the pilot: the saucer drops out of the formation, hangs there reeling
for a moment, then banks over and limps off whichever side of the screen is
nearer. It scores when it is gone. Toys scattered across the floor absorb
anything that hits them — the hen's eggs and the saucers' lasers alike — until
they fall apart.

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
| `src/game.ts` | The whole simulation: marching, splattering, retreats, collisions, rounds. Touches no DOM, which is why it can be tested headlessly. |
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

**Difficulty scales on four axes, not one.** Each round adds rows (to six),
fires lasers more often and faster, allows more of them on screen at once, and
starts the formation lower. On top of that the formation accelerates as its
ranks thin within a round, so the last saucer is the frightening one.

**Toys are destructible on purpose.** They absorb four shots and then break. An
indestructible shield would turn every round after the third into camping behind
one, which is exactly the failure the original's erodable bunkers avoid.

**Toy placement is constrained, not freely random.** The usable width is divided
into one lane per toy and each toy is jittered inside its own lane. They can
therefore never overlap, never touch the walls, and never line up into a barrier
that seals off a column.

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
- **The obstacles are still nursery toys.** They are carried over unchanged from
  the previous theme, so a cradle and a teddy bear are what shields the hen from
  orbital laser fire. Replacing them is confined to the four toy painters in
  `src/sprites.ts` and the `ToyKind` union.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to
`main`. It assumes **this directory is the repository root**. Two things must be
true before it works:

1. The repository is named `lolinvaders`, so that `base` in `vite.config.ts`
   matches the URL GitHub Pages serves from (`/lolinvaders/`). If the repository
   has a different name, change `base` to match it.
2. Pages is enabled with **Settings → Pages → Source → GitHub Actions**.
