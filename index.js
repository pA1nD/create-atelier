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
 * Starter modules: --chrome downloads a chrome module and sets it as the
 * instance's defaultChrome; --add (repeatable) downloads any other module.
 * A <spec> is anything `npm pack` accepts — a registry name, a git url, a
 * tarball url, or a local folder. Each lands as a plain folder in the
 * instance (the folder name is the module id); nothing is vendored into the
 * scaffolder itself.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const ATELIER_RANGE = '^0.10.0'   // the shell version this scaffolder targets

function fail(msg) {
  console.error(`create-atelier: ${msg}`)
  process.exit(1)
}

const [target, ...flags] = process.argv.slice(2)
if (!target || target.startsWith('-')) {
  fail(`usage: npm create @pa1nd/atelier <dir> [-- --chrome <spec>] [--add <spec>]…
  e.g.  npm create @pa1nd/atelier my-studio
        npm create @pa1nd/atelier my-studio -- --chrome @pa1nd/atelier-chrome --add github:someone/kanban
  <spec> is anything npm can fetch: a registry name, git url, tarball url, or local folder.`)
}

let chromeSpec = null
const addSpecs = []
for (let i = 0; i < flags.length; i++) {
  if (flags[i] === '--chrome') {
    if (chromeSpec) fail('only one --chrome (an instance has one default chrome)')
    chromeSpec = flags[++i] || fail('--chrome needs a <spec>')
  } else if (flags[i] === '--add') {
    addSpecs.push(flags[++i] || fail('--add needs a <spec>'))
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

/* ---- starter modules (--chrome / --add) ------------------------------------
 * Fetched BEFORE anything is written, so a bad spec fails with the target
 * directory untouched. `npm pack` resolves the spec (registry / git / tarball /
 * folder) to a tarball in a temp dir; it's extracted there and later copied
 * into the instance under the package's name with the scope stripped — the
 * folder name is the module id.
 */
const runNpm = (args, opts = {}) => process.env.npm_execpath
  ? execFileSync(process.execPath, [process.env.npm_execpath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  : execFileSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })

function fetchModule(spec) {
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
  let pkg = {}
  try { pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')) } catch {}
  const id = (pkg.name || tgz.replace(/\.tgz$/, '')).split('/').pop()
  return { spec, src, id, hasDeps: !!(pkg.dependencies && Object.keys(pkg.dependencies).length) }
}

const starters = []
if (chromeSpec) starters.push({ ...fetchModule(chromeSpec), isChrome: true })
for (const s of addSpecs) starters.push(fetchModule(s))
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
}, null, 2) + '\n')

write('.gitignore', 'node_modules\ndata\n.DS_Store\n')

// Starter modules land as plain folders — the instance owns them from here on.
// A module with its own dependencies (chromes usually) gets them installed in
// place; if that fails the scaffold still stands, so warn instead of dying.
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
}

write('README.md', `# ${name}

An [Atelier](https://github.com/pA1nD/atelier) instance — a single runtime that
hosts small feature modules around one shared chrome (theme).

## Run

\`\`\`sh
npm install
npm run dev            # → http://localhost:1844
\`\`\`

${chrome ? `The chrome \`${chrome.id}/\` came with the scaffold and is set as the
\`defaultChrome\` in \`atelier.config.json\`. A chrome owns all the visuals
(rail, fonts, colors, \`@atelier/kit\`); your modules render inside it.` : `Atelier ships **no chrome**, so the first screen says *"add a chrome"* — that's
expected. A chrome owns all the visuals (rail, fonts, colors, \`@atelier/kit\`);
add one and your modules render inside it.`}

## Add a module

A module is just a folder with a \`frontend.jsx\`:

\`\`\`jsx
// hello/frontend.jsx
export default function Module() {
  return <div className="p-8">hello</div>
}
\`\`\`

Save it — it appears in the rail. See the
[module docs](https://github.com/pA1nD/atelier/blob/main/docs/MODULES.md) for the
full contract (\`ctx\`, the real-time WebSocket, \`@atelier/kit\`, workspaces).

## Update the shell

\`\`\`sh
npm update @pa1nd/atelier
\`\`\`
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
