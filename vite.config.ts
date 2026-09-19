import { defineConfig } from 'vite'

// GitHub Pages serves a project site from /<repo>/, so every built asset URL
// needs that prefix. Change this to '/' if you ever put the game on a custom
// domain or a user/organisation Pages site.
export default defineConfig({
  base: '/lolinvaders/',
  build: { target: 'es2022' },
})
