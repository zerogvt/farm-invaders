import { defineConfig } from 'vite'

// GitHub Pages serves a project site from /<repo>/, so every built asset URL
// needs that prefix. Cloudflare serves the game from the root of its own
// domain, so its builds (which set WORKERS_CI or CF_PAGES) use '/'.
// Vite runs this file in Node; declared here rather than pulling in @types/node.
declare const process: { env: Record<string, string | undefined> }
const onCloudflare = Boolean(process.env.WORKERS_CI || process.env.CF_PAGES)

export default defineConfig({
  base: onCloudflare ? '/' : '/farm-invaders/',
  build: { target: 'es2022' },
})
