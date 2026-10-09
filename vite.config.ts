import { defineConfig } from 'vite'

// Cloudflare Pages serves the game from the root of farm-invaders.pages.dev,
// so built asset URLs need no path prefix.
export default defineConfig({
  base: '/',
  build: { target: 'es2022' },
})
