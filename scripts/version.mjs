// Writes public/version.json, which the About card shows, so you can check
// which commit is live. The version is package.json's major.minor plus the
// number of commits on HEAD (0.1.120, 0.1.121, ...), so every commit bumps it
// with nothing to edit by hand. Runs as part of `npm run build` and
// `npm run dev`; Cloudflare Pages runs the build, so the deployed file names
// the commit it was built from. Ported from the syllable game.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '..', '..')

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** Commits on HEAD. A shallow clone (as CI may make) is deepened first, since it would count 1. */
function commitCount() {
  if (git('rev-parse', '--is-shallow-repository') === 'true') git('fetch', '--unshallow', '--quiet')
  if (git('rev-parse', '--is-shallow-repository') !== 'false') return null
  const count = Number(git('rev-list', '--count', 'HEAD'))
  return Number.isInteger(count) && count > 0 ? count : null
}

const [major = '0', minor = '0'] = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version.split('.')
const count = commitCount()
// Cloudflare Pages sets CF_PAGES_COMMIT_SHA; git answers everywhere else.
const commit = process.env.CF_PAGES_COMMIT_SHA || git('rev-parse', 'HEAD')
const info = {
  version: count === null ? null : `${major}.${minor}.${count}`,
  commit: commit ? commit.slice(0, 7) : null,
  committed: git('log', '-1', '--format=%cI'),
  // Uncommitted changes: only ever true on a developer's machine.
  dirty: Boolean(git('status', '--porcelain')),
  built: new Date().toISOString(),
}
writeFileSync(resolve(root, 'public', 'version.json'), JSON.stringify(info, null, 2) + '\n')
console.log(`version.json: ${info.version ?? '?'} (${info.commit ?? 'no commit'}${info.dirty ? ', dirty' : ''})`)
