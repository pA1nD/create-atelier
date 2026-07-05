#!/usr/bin/env node
/* create-atelier — scaffold a new Atelier instance.
 *
 *   npm create @pa1nd/atelier <dir> [-- --chrome <spec>] [--add <spec>]…
 *   npx @pa1nd/create-atelier <dir> [--chrome <spec>] [--add <spec>]…
 *
 * It writes a *tiny* instance: a package.json that depends on @pa1nd/atelier
 * (the shell arrives from npm — nothing is vendored), a config, a .gitignore,
 * and a README. Then it prints the commands to run it.
 *
 * Starter kits & modules: --kit pulls a whole kit repo of modules (chrome
 * included, auto-detected); --chrome downloads one chrome module and sets it
 * as the instance's defaultChrome; --add (repeatable) downloads any other
 * module. A bare name resolves against the kit repo (default:
 * github.com/pA1nD/atelier-modules); any other <spec> is handed to
 * `npm pack` — a registry name, a git url, a tarball url, or a local folder.
 * Each lands as a plain folder in the instance (the folder name is the
 * module id); nothing is vendored into the scaffolder itself.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const ATELIER_RANGE = '^0.12.0'   // the shell version this scaffolder targets (0.12: atelier add + declared-needs checks)

function fail(msg) {
  console.error(`create-atelier: ${msg}`)
  process.exit(1)
}

const [target, ...flags] = process.argv.slice(2)
if (!target || target.startsWith('-')) {
  fail(`usage: npm create @pa1nd/atelier <dir> [-- --kit <kit>] [--chrome <spec>] [--add <spec>]…
  e.g.  npm create @pa1nd/atelier my-studio
        npm create @pa1nd/atelier my-studio -- --kit atelier-modules
        npm create @pa1nd/atelier my-studio -- --chrome atelier-chrome --add dock
  --kit pulls every module of a kit repo (a bare kit name means pA1nD/<kit>).
  a bare <spec> names one folder of the kit repo (default pA1nD/atelier-modules);
  anything else (registry name, git url, tarball url, local folder) is fetched via npm.`)
}

let chromeSpec = null
let kitSpec = null
const addSpecs = []
for (let i = 0; i < flags.length; i++) {
  if (flags[i] === '--chrome') {
    if (chromeSpec) fail('only one --chrome (an instance has one default chrome)')
    chromeSpec = flags[++i] || fail('--chrome needs a <spec>')
  } else if (flags[i] === '--add') {
    addSpecs.push(flags[++i] || fail('--add needs a <spec>'))
  } else if (flags[i] === '--kit') {
    if (kitSpec) fail('only one --kit')
    kitSpec = flags[++i] || fail('--kit needs a kit name (e.g. atelier-modules) or owner/repo')
  } else {
    fail(`unknown option: ${flags[i]}`)
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

/* ---- starter kits & modules (--kit / --chrome / --add) ----------------------
 * Fetched BEFORE anything is written, so a bad spec fails with the target
 * directory untouched.
 *
 * A KIT is a github repo of module folders (the first one:
 * github.com/pA1nD/atelier-modules). --kit pulls EVERY module folder in it —
 * same rule as the shell's discovery: a folder with a frontend.jsx or a
 * backend.js — and auto-detects its chrome for `defaultChrome`. A bare --kit
 * name expands to pA1nD/<name>; `owner/repo` names any other kit.
 *
 * A bare --chrome/--add name is a single folder of the kit repo (the default
 * kit when no --kit is given). Any other spec goes to `npm pack` (registry /
 * git / tarball / folder), extracted in a temp dir. Either way the module is
 * later copied into the instance under its name with the scope stripped —
 * the folder name is the module id.
 */
const KIT_OWNER = 'pA1nD'
const DEFAULT_KIT_REPO = 'pA1nD/atelier-modules'
const kitRepo = kitSpec ? (kitSpec.includes('/') ? kitSpec : `${KIT_OWNER}/${kitSpec}`) : null
const bareNameRepo = kitRepo || DEFAULT_KIT_REPO
const isBareName = (s) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s)

const runNpm = (args, opts = {}) => process.env.npm_execpath
  ? execFileSync(process.execPath, [process.env.npm_execpath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  : execFileSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })

const readPkg = (dir) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { return {} }
}
const hasDeps = (dir) => {
  const pkg = readPkg(dir)
  return !!(pkg.dependencies && Object.keys(pkg.dependencies).length)
}
// A chrome declares itself in its own frontend.jsx meta — that's the marker.
const isChromeModule = (dir) => {
  try { return /isChrome\s*:\s*true/.test(fs.readFileSync(path.join(dir, 'frontend.jsx'), 'utf8')) } catch { return false }
}

const repoRoots = new Map()   // repo → extracted tarball root, downloaded once
async function fetchRepoRoot(repo) {
  if (repoRoots.has(repo)) return repoRoots.get(repo)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-atelier-repo-'))
  const url = `https://codeload.github.com/${repo}/tar.gz/HEAD`
  const res = await fetch(url).catch((e) => fail(`could not reach github.com for ${repo}: ${e.message}`))
  if (!res.ok) fail(`could not download github.com/${repo} (HTTP ${res.status}) — is it a public repo?`)
  fs.writeFileSync(path.join(tmp, 'repo.tgz'), Buffer.from(await res.arrayBuffer()))
  const out = path.join(tmp, 'repo')
  fs.mkdirSync(out)
  execFileSync('tar', ['-xzf', path.join(tmp, 'repo.tgz'), '-C', out])
  const root = path.join(out, fs.readdirSync(out)[0])   // single "<repo>-<ref>" top dir
  repoRoots.set(repo, root)
  return root
}

// A module folder, by the shell's own discovery rule: frontend.jsx or backend.js.
const repoModuleDirs = (root) => fs.readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^[a-zA-Z0-9]/.test(d.name))
  .map((d) => d.name)
  .filter((n) => fs.existsSync(path.join(root, n, 'frontend.jsx')) || fs.existsSync(path.join(root, n, 'backend.js')))

async function fetchFromRepo(repo, name) {
  const root = await fetchRepoRoot(repo)
  const src = path.join(root, name)
  if (!fs.existsSync(src)) {
    fail(`no module "${name}" in github.com/${repo} — available: ${repoModuleDirs(root).join(', ') || '(none)'}`)
  }
  return { spec: name, src, id: name, hasDeps: hasDeps(src) }
}

async function fetchModule(spec) {
  if (isBareName(spec)) return fetchFromRepo(bareNameRepo, spec)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'create-atelier-'))
  let tgz
  try {
    tgz = runNpm(['pack', spec, '--pack-destination', tmp]).trim().split('\n').pop()
  } catch (e) {
    const detail = (e.stderr || e.message || '').toString().trim().split('\n').slice(-3).join('\n  ')
    fail(`could not fetch "${spec}" — not something npm can pack (registry name, git url, tarball url, or folder)\n  ${detail}`)
  }
  const src = path.join(tmp, 'extracted')
  fs.mkdirSync(src)
  execFileSync('tar', ['-xzf', path.join(tmp, tgz), '-C', src, '--strip-components', '1'])
  const id = (readPkg(src).name || tgz.replace(/\.tgz$/, '')).split('/').pop()
  return { spec, src, id, hasDeps: hasDeps(src) }
}

const starters = []
if (chromeSpec) starters.push({ ...(await fetchModule(chromeSpec)), isChrome: true })
for (const s of addSpecs) starters.push(await fetchModule(s))

// --kit: pull every module folder in the kit repo. Explicitly-named starters
// win a name collision; the kit's chrome becomes the default chrome unless
// --chrome named one.
if (kitRepo) {
  const root = await fetchRepoRoot(kitRepo)
  const kitIds = repoModuleDirs(root)
  if (!kitIds.length) fail(`kit github.com/${kitRepo} contains no modules (folders with a frontend.jsx or backend.js)`)
  const taken = new Set(starters.map((s) => s.id))
  for (const id of kitIds) {
    if (taken.has(id)) continue
    const src = path.join(root, id)
    starters.push({ spec: `${kitRepo}#${id}`, src, id, hasDeps: hasDeps(src), fromKit: true })
  }
  if (!chromeSpec) {
    const kitChromes = starters.filter((s) => s.fromKit && isChromeModule(s.src))
    if (kitChromes.length === 1) kitChromes[0].isChrome = true
    // 0 or several: leave defaultChrome unset — the shell's election handles it
  }
}

const ids = starters.map((s) => s.id)
if (new Set(ids).size !== ids.length) {
  fail(`two starter modules resolve to the same folder name: ${ids.join(', ')}`)
}
const chrome = starters.find((s) => s.isChrome)

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

// atelier.config.json — the instance's source of truth. Minimal; every key is optional.
write('atelier.config.json', JSON.stringify({
  label: name,
  port: 1844,
  ...(chrome ? { defaultChrome: chrome.id } : {}),
  // the kit repo doubles as the instance's marketplace: `npx atelier add <name>`
  // resolves bare module names against it (tooling-only — the server ignores it)
  ...(kitRepo ? { marketplaces: [kitRepo] } : {}),
}, null, 2) + '\n')

write('.gitignore', 'node_modules\ndata\n.DS_Store\n')

// Starter modules land as plain folders — the instance owns them from here on.
// A module with its own dependencies (chromes usually) gets them installed in
// place; if that fails the scaffold still stands, so warn instead of dying.
const binOk = (b) => { try { execFileSync('/bin/sh', ['-c', `command -v ${b}`], { stdio: 'ignore' }); return true } catch { return false } }
for (const s of starters) {
  fs.cpSync(s.src, path.join(dir, s.id), { recursive: true })
  if (s.hasDeps) {
    console.log(`  installing ${s.id} dependencies…`)
    try {
      runNpm(['install', '--no-fund', '--no-audit', '--loglevel=error'], { cwd: path.join(dir, s.id) })
    } catch {
      console.warn(`  ⚠ npm install failed in ${s.id}/ — run it there manually before \`npm run dev\``)
    }
  }
  // Report the module's declared system needs (its package.json `atelier`
  // field) — check-only; `npx atelier add <name> --yes` can run install hints.
  const a = readPkg(path.join(dir, s.id)).atelier
  if (a && typeof a === 'object') {
    const missing = []
    if (Array.isArray(a.os) && a.os.length && !a.os.includes(process.platform)) missing.push(`targets os [${a.os.join(', ')}] — this machine is ${process.platform}`)
    for (const [b, hint] of Object.entries(a.bins && typeof a.bins === 'object' ? a.bins : {})) if (/^[A-Za-z0-9._-]+$/.test(b) && !binOk(b)) missing.push(`missing ${b}${hint ? `  →  ${hint}` : ''}`)
    for (const k of (Array.isArray(a.env) ? a.env : [])) if (!process.env[k]) missing.push(`missing env ${k}`)
    if (a.note) console.log(`  ${s.id} · note: ${a.note}`)
    if (missing.length) { console.log(`  ! ${s.id} will run degraded until:`); for (const m of missing) console.log(`    · ${m}`) }
  }
}

write('README.md', `# ${name}

An [Atelier](https://theatelier.dev) instance — \`npm install && npm run dev\` → http://localhost:1844.
Docs: https://theatelier.dev/docs
`)

const major = Number(process.versions.node.split('.')[0])
const warn = Number.isFinite(major) && major < 24
  ? `\n⚠  Atelier needs Node ≥24 to run — you have ${process.versions.node}. Upgrade before \`npm run dev\`.\n`
  : ''

const started = starters.length
  ? `\n  starter modules: ${starters.map((s) => s.id + (s.isChrome ? ' (default chrome)' : '')).join(', ')}`
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
