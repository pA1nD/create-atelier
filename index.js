#!/usr/bin/env node
/* create-atelier — scaffold a new Atelier instance.
 *
 *   npm create @pa1nd/atelier <dir> [-- --kit <collection>] [--chrome <name>] [--add <name>]…
 *   npx @pa1nd/create-atelier <dir> [--kit <collection>] [--chrome <name>] [--add <name>]…
 *
 * It writes a *tiny* instance — only what the instance needs: a package.json
 * that depends on @pa1nd/atelier (the shell arrives from npm — nothing is
 * vendored), a config, and a .gitignore. Then it prints the commands to run it.
 *
 * Starter modules come from a COLLECTION — a git repo whose top-level folders
 * are modules, the one shape atelier shares (`atelier package` produces them).
 * Scaffolding with one does exactly what `atelier add` would do: the repo is
 * cloned (in full — its history is what `atelier update` merges against) into
 * the instance's `_collections/`, and modules are copied out of that mirror
 * with install provenance. So a scaffolded instance is SUBSCRIBED from day
 * one: `npx atelier update` and `npx atelier add <collection>` just work.
 *
 * --kit pulls every module of the collection (its chrome auto-detected as
 * defaultChrome); --chrome / --add cherry-pick single modules by name from it
 * (default collection: github.com/pA1nD/atelier-modules).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const ATELIER_RANGE = '^0.16.0'   // the shell version this scaffolder targets (0.16: installPath, channel/outbox)
const KIT_OWNER = 'pA1nD'
const DEFAULT_KIT = 'pA1nD/atelier-modules'

function fail(msg) {
  console.error(`create-atelier: ${msg}`)
  process.exit(1)
}

const [target, ...flags] = process.argv.slice(2)
if (!target || target.startsWith('-')) {
  fail(`usage: npm create @pa1nd/atelier <dir> [-- --kit <collection>] [--chrome <name>] [--add <name>]…
  e.g.  npm create @pa1nd/atelier my-studio
        npm create @pa1nd/atelier my-studio -- --kit atelier-modules
        npm create @pa1nd/atelier my-studio -- --chrome atelier-chrome --add dock
  --kit pulls every module of a collection — a git repo of module folders, what
  \`atelier package\` produces. A bare name means github.com/${KIT_OWNER}/<name>;
  also: owner/repo, github:owner/repo, any git url (git+ssh://… for private
  collections, over your own git auth), a local path, or a .bundle file.
  --chrome / --add name single modules of that collection (default: ${DEFAULT_KIT}).`)
}

let chromeName = null
let kitSpec = null
const addNames = []
for (let i = 0; i < flags.length; i++) {
  if (flags[i] === '--chrome') {
    if (chromeName) fail('only one --chrome (an instance has one default chrome)')
    chromeName = flags[++i] || fail('--chrome needs a module name')
  } else if (flags[i] === '--add') {
    addNames.push(flags[++i] || fail('--add needs a module name'))
  } else if (flags[i] === '--kit') {
    if (kitSpec) fail('only one --kit')
    kitSpec = flags[++i] || fail('--kit needs a collection (name, owner/repo, git url, path)')
  } else {
    fail(`unknown option: ${flags[i]}`)
  }
}
const isBareName = (s) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s)
for (const n of [chromeName, ...addNames].filter(Boolean)) {
  if (!isBareName(n)) {
    fail(`--chrome/--add take module NAMES from the collection ("${n}" looks like a source).
  Point --kit at the collection instead:  --kit <owner/repo | git url | path>`)
  }
}

const dir = path.resolve(process.cwd(), target)
const name = path.basename(dir)
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
  fail(`"${name}" isn't a usable folder/package name (use letters, digits, -, _, .)`)
}
if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
  fail(`refusing to scaffold into a non-empty directory: ${dir}`)
}

/* ---- the collection (--kit / --chrome / --add) --------------------------------
 * Cloned BEFORE anything is written, so a bad source fails with the target
 * directory untouched. Always a FULL git clone: the clone becomes the
 * instance's mirror under _collections/, and its history is the merge base
 * `atelier update` reasons from.
 * -------------------------------------------------------------------------------- */
const isGitUrl = (s) => /^(git\+ssh:\/\/|git\+https:\/\/|ssh:\/\/|git@|file:\/\/)/.test(s) || /^https?:\/\//.test(s)
const isPathSpec = (s) => /^(\.{1,2}\/|~\/|\/)/.test(s) || s.endsWith('.bundle')

function cloneUrlFor(spec) {
  let s = spec
  if (s.startsWith('github:')) s = s.slice(7)
  if (isPathSpec(s)) {
    if (s === '~' || s.startsWith('~/')) s = path.join(process.env.HOME || '', s.slice(2))
    return path.resolve(process.cwd(), s)
  }
  if (isGitUrl(s)) return s.replace(/^git\+/, '')
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) return `https://github.com/${s}.git`     // owner/repo
  if (isBareName(s)) return `https://github.com/${KIT_OWNER}/${s}.git`       // bare kit name
  fail(`"${spec}" isn't a collection source (name, owner/repo, github:owner/repo, git url, path, .bundle)`)
}

const wantModules = !!(kitSpec || chromeName || addNames.length)
const collectionUrl = wantModules ? cloneUrlFor(kitSpec || DEFAULT_KIT) : null
const collectionName = wantModules
  ? path.basename(collectionUrl).replace(/\.git$/, '').replace(/\.bundle$/, '')
  : null

// A module folder, by the shell's own discovery rule: frontend.jsx or backend.js.
const moduleDirs = (root) => fs.readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^[a-zA-Z0-9]/.test(d.name))
  .map((d) => d.name)
  .filter((n) => fs.existsSync(path.join(root, n, 'frontend.jsx')) || fs.existsSync(path.join(root, n, 'backend.js')))

const readPkg = (dir) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { return {} }
}
// A chrome declares itself in its own frontend.jsx meta — that's the marker.
const isChromeModule = (dir) => {
  try { return /isChrome\s*:\s*true/.test(fs.readFileSync(path.join(dir, 'frontend.jsx'), 'utf8')) } catch { return false }
}

let clone = null, cloneHead = null, selected = []
if (wantModules) {
  clone = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'create-atelier-')), 'repo')
  try {
    execFileSync('git', ['clone', '-q', collectionUrl, clone],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  } catch (e) {
    const detail = (e.stderr || '').toString().trim().split('\n').slice(-2).join('\n  ')
    fail(`could not clone ${collectionUrl} — for private collections check your git access (ssh key / credential helper)\n  ${detail}`)
  }
  cloneHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: clone, encoding: 'utf8' }).trim()
  const offered = moduleDirs(clone)
  if (!offered.length) fail(`${collectionUrl} is not a collection — its top level has no module folders`)
  // --chrome/--add cherry-pick by name; --kit alone means the whole collection
  const named = [...new Set([chromeName, ...addNames].filter(Boolean))]
  const picks = named.length ? named : offered
  for (const id of picks) {
    if (!offered.includes(id)) fail(`no module "${id}" in that collection — it offers: ${offered.join(', ')}`)
    selected.push({ id, src: path.join(clone, id), isChrome: id === chromeName })
  }
  // --kit with no explicit --chrome: a single chrome in the kit becomes the default
  if (!chromeName) {
    const chromes = selected.filter((s) => isChromeModule(s.src))
    if (chromes.length === 1) chromes[0].isChrome = true
    // 0 or several: leave defaultChrome unset — the shell's election handles it
  }
}
const chrome = selected.find((s) => s.isChrome)

/* ---- write the instance --------------------------------------------------------- */
const write = (rel, content) => {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

// package.json — @pa1nd/atelier is a DEPENDENCY (the shell runs itself from
// node_modules); `atelier` is its bin, so the scripts just call it.
write('package.json', JSON.stringify({
  name,
  private: true,
  type: 'module',
  scripts: {
    dev: 'atelier',
    'dev:module': 'atelier',
  },
  dependencies: {
    '@pa1nd/atelier': ATELIER_RANGE,
  },
}, null, 2) + '\n')

// atelier.config.json — the instance's source of truth. Minimal; every key is
// optional. (Subscriptions need no config: the mirror under _collections/ IS
// the registry — its origin lives in its own .git/config.)
write('atelier.config.json', JSON.stringify({
  label: name,
  port: 1844,
  ...(chrome ? { defaultChrome: chrome.id } : {}),
}, null, 2) + '\n')

// _collections holds nested git repos (mirrors + authored collections) — noise
// inside the instance's own git history; each collection is its own repo.
write('.gitignore', 'node_modules\ndata\n_collections\n.DS_Store\n')

// The clone becomes the instance's mirror: the scaffolded instance is
// subscribed — `atelier add <collection>` / `atelier update` work from day one.
if (clone) {
  fs.cpSync(clone, path.join(dir, '_collections', collectionName), { recursive: true })
}

/* ---- install the selected modules out of the mirror ------------------------------
 * Same semantics as `atelier add`: filtered copy (a cut's data/ is
 * first-install content; node_modules/.git/.env* never travel), npm install
 * in place when the module declares dependencies, and an `.atelier`
 * provenance file (collection + mirror commit — the merge base a future
 * `atelier update` reasons from).
 * ------------------------------------------------------------------------------------ */
const runNpm = (args, opts = {}) => process.env.npm_execpath
  ? execFileSync(process.execPath, [process.env.npm_execpath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  : execFileSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
const binOk = (b) => { try { execFileSync('/bin/sh', ['-c', `command -v ${b}`], { stdio: 'ignore' }); return true } catch { return false } }

for (const s of selected) {
  const dest = path.join(dir, s.id)
  fs.cpSync(s.src, dest, {
    recursive: true,
    filter: (p) => {
      const rel = path.relative(s.src, p)
      if (!rel) return true
      const top = rel.split(path.sep)[0]
      return !['node_modules', '.git', '.atelier'].includes(top) && !top.startsWith('.env')
    },
  })
  fs.writeFileSync(path.join(dest, '.atelier'), JSON.stringify({
    collection: collectionName, module: s.id, commit: cloneHead, installedAt: new Date().toISOString(),
  }, null, 2) + '\n')
  const pkg = readPkg(dest)
  if (pkg.dependencies && Object.keys(pkg.dependencies).length) {
    console.log(`  installing ${s.id} dependencies…`)
    try {
      runNpm(['install', '--no-fund', '--no-audit', '--loglevel=error'], { cwd: dest })
    } catch {
      console.warn(`  ⚠ npm install failed in ${s.id}/ — run it there manually before \`npm run dev\``)
    }
  }
  // Report the module's declared system needs (its package.json `atelier`
  // field) — check-only; `npx atelier add … --yes` can run install hints.
  const a = pkg.atelier
  if (a && typeof a === 'object') {
    const missing = []
    if (Array.isArray(a.os) && a.os.length && !a.os.includes(process.platform)) missing.push(`targets os [${a.os.join(', ')}] — this machine is ${process.platform}`)
    for (const [b, hint] of Object.entries(a.bins && typeof a.bins === 'object' ? a.bins : {})) if (/^[A-Za-z0-9._-]+$/.test(b) && !binOk(b)) missing.push(`missing ${b}${hint ? `  →  ${hint}` : ''}`)
    for (const k of (Array.isArray(a.env) ? a.env : [])) if (!process.env[k]) missing.push(`missing env ${k}`)
    if (a.note) console.log(`  ${s.id} · note: ${a.note}`)
    if (missing.length) { console.log(`  ! ${s.id} will run degraded until:`); for (const m of missing) console.log(`    · ${m}`) }
  }
}

const major = Number(process.versions.node.split('.')[0])
const warn = Number.isFinite(major) && major < 24
  ? `\n⚠  Atelier needs Node ≥24 to run — you have ${process.versions.node}. Upgrade before \`npm run dev\`.\n`
  : ''

const started = selected.length
  ? `\n  subscribed: ${collectionName}   (later: npx atelier update · npx atelier add ${collectionName})
  starter modules: ${selected.map((s) => s.id + (s.isChrome ? ' (default chrome)' : '')).join(', ')}`
  : ''

console.log(`
✓ scaffolded Atelier instance → ${name}${started}${warn}

  cd ${target}
  npm install
  npm run dev

${chrome
  ? `Then open http://localhost:1844 — your modules render inside ${chrome.id}.`
  : `Then open http://localhost:1844 — you'll get the "add a chrome" screen; add a chrome to start rendering.`}
`)
