# LOL Invaders

Space Invaders, except the invaders are crying babies throwing dirty diapers and
the defender is their mother, armed with bottles.

A hit does not kill. A bottle that connects starts the baby **feeding**: it goes
quiet, stops throwing, keeps marching with the formation, and disappears about a
second later. Toys scattered across the floor absorb anything that hits them —
mom's bottles and the babies' diapers alike — until they fall apart.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173/lolinvaders/
npm test         # headless simulation checks
npm run build    # typecheck + production build into dist/
```

Controls: `←` `→` or `A`/`D` to move, `Space` to throw a bottle.

## How it is put together

No game engine and no image files. Plain TypeScript, Canvas 2D, and Vite.

| File | What lives there |
| --- | --- |
| `src/config.ts` | Every tunable number. Balancing happens here and nowhere else. |
| `src/game.ts` | The whole simulation: marching, feeding, collisions, rounds. Touches no DOM, which is why it can be tested headlessly. |
| `src/sprites.ts` | Every sprite, drawn with canvas paths at startup. The only file that knows what anything looks like. |
| `src/render.ts` | Draws a frame from game state. Never mutates it. |
| `src/ui.ts` | Title card, round banner and game-over panel, as real DOM so buttons and the initials field are keyboard-operable. |
| `src/scores.ts` | High scores in `localStorage`. |
| `src/input.ts` | Keyboard state. |
| `src/main.ts` | Canvas setup and the frame loop. |

### Design decisions worth knowing

**Difficulty scales on four axes, not one.** Each round adds rows (to six), throws
diapers more often and faster, allows more of them on screen at once, and starts
the formation lower. On top of that the formation accelerates as its ranks thin
within a round, so the last baby is the frightening one.

**Toys are destructible on purpose.** They absorb four shots and then break. An
indestructible shield would turn every round after the third into camping behind
one, which is exactly the failure the original's erodable bunkers avoid.

**Toy placement is constrained, not freely random.** The usable width is divided
into one lane per toy and each toy is jittered inside its own lane. They can
therefore never overlap, never touch the walls, and never line up into a barrier
that seals off a column.

**A second bottle into a feeding baby is wasted.** It is absorbed and the baby is
unaffected. With only three bottles allowed in flight, that is the entire cost the
feeding delay imposes, and removing it would make the delay purely cosmetic.

**Sprites are drawn in code rather than loaded.** Cruder than hand-drawn art, but
identical on every platform, nothing to license, and crying and feeding faces can
share one body. Swapping to emoji or PNGs means rewriting `src/sprites.ts` and
nothing else.

### Known limits

- **Desktop keyboard only.** There are no touch controls, so the game is not
  playable on a phone. Adding them means a second input source writing the same
  three fields in `src/input.ts`.
- **No sound.**
- **High scores are per-browser.** They live in `localStorage`, are not shared
  between players or devices, and vanish when site data is cleared.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to
`main`. It assumes **this directory is the repository root**. Two things must be
true before it works:

1. The repository is named `lolinvaders`, so that `base` in `vite.config.ts`
   matches the URL GitHub Pages serves from (`/lolinvaders/`). If the repository
   has a different name, change `base` to match it.
2. Pages is enabled with **Settings → Pages → Source → GitHub Actions**.
