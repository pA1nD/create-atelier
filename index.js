#!/usr/bin/env node
/* create-atelier — scaffold a new Atelier instance.
 *
 *   npm create @pa1nd/atelier <dir>     (npm runs this package's bin)
 *   npx @pa1nd/create-atelier <dir>
 *
 * It writes a *tiny* instance: a package.json that depends on @pa1nd/atelier
 * (the shell arrives from npm — nothing is vendored), a config, a .gitignore,
 * and a README. No modules, no chrome — those are yours to add. Then it prints
 * the three commands to run it.
 */
import fs from 'node:fs'
import path from 'node:path'

const ATELIER_RANGE = '^0.10.0'   // the shell version this scaffolder targets

function fail(msg) {
  console.error(`create-atelier: ${msg}`)
  process.exit(1)
}

const target = process.argv[2]
if (!target || target.startsWith('-')) {
  fail('usage: npm create @pa1nd/atelier <dir>   (e.g. npm create @pa1nd/atelier my-studio)')
}

const dir = path.resolve(process.cwd(), target)
const name = path.basename(dir)
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
  fail(`"${name}" isn't a usable folder/package name (use letters, digits, -, _, .)`)
}
if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
  fail(`refusing to scaffold into a non-empty directory: ${dir}`)
}

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
}, null, 2) + '\n')

write('.gitignore', 'node_modules\ndata\n.DS_Store\n')

write('README.md', `# ${name}

An [Atelier](https://github.com/pA1nD/atelier) instance — a single runtime that
hosts small feature modules around one shared chrome (theme).

## Run

\`\`\`sh
npm install
npm run dev            # → http://localhost:1844
\`\`\`

Atelier ships **no chrome**, so the first screen says *"add a chrome"* — that's
expected. A chrome owns all the visuals (rail, fonts, colors, \`@atelier/kit\`);
add one and your modules render inside it.

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

console.log(`
✓ scaffolded Atelier instance → ${name}${warn}

  cd ${target}
  npm install
  npm run dev

Then open http://localhost:1844 — you'll get the "add a chrome" screen; add a chrome to start rendering.
`)
