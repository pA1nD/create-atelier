# create-atelier

Scaffold a new [Atelier](https://github.com/pA1nD/atelier) instance in one command.

```sh
npm create @pa1nd/atelier my-studio
cd my-studio
npm install
npm run dev            # → http://localhost:1844
```

It writes a **tiny** instance — only what the instance needs: a `package.json`
that depends on
[`@pa1nd/atelier`](https://www.npmjs.com/package/@pa1nd/atelier), an
`atelier.config.json`, and a `.gitignore`. Nothing is vendored: the
shell arrives from npm and runs itself from `node_modules`, so you update it with
`npm update @pa1nd/atelier`.

By default no modules and no chrome are scaffolded — on first run you'll see
Atelier's "add a chrome" screen; add a chrome to start rendering.

## Starter collections

Atelier shares exactly one shape: a **collection** — a git repo whose top-level
folders are modules, what `atelier package` produces. Pull a whole one at
scaffold time:

```sh
npm create @pa1nd/atelier my-studio -- --kit atelier-modules
```

Every module in the collection lands in the instance, and its chrome is
detected and set as `defaultChrome`: the first `npm run dev` renders themed,
modules included. A bare name means `pA1nD/<name>` —
[`atelier-modules`](https://github.com/pA1nD/atelier-modules) is the first one —
and any collection works: `owner/repo`, `github:owner/repo`, any git url
(`git+ssh://…` reaches **private** collections over your own git auth), a local
path, or a `.bundle` file.

Scaffolding with a collection does exactly what `atelier add` would do: the
repo is cloned in full into the instance's `_collections/` and modules are
copied out of that mirror with install provenance — so the new instance is
**subscribed from day one**. When the collection gains new modules or cuts:

```sh
npx atelier add atelier-modules      # install what's new
npx atelier update                   # upgrade what you have (merge-aware)
```

## Cherry-picking

`--chrome` / `--add` name single modules of the collection instead of taking
all of it:

```sh
npm create @pa1nd/atelier my-studio -- --chrome atelier-chrome --add dock
npm create @pa1nd/atelier my-studio -- --kit bigcorp/tools --add crm
```

- `--chrome <name>` — install that module and set it as the instance's
  `defaultChrome`.
- `--add <name>` — install that module (repeatable).

Names always refer to modules *of the collection* (the `--kit` one if given,
else `pA1nD/atelier-modules`) — there is no other source; if you want a module,
its author packages it into a collection (`atelier package` — one command).

Either way each module lands as a **plain folder** in the instance — the folder
name is the module id, and the instance owns it from there (edit it freely;
`atelier update` 3-way-merges your edits when new cuts arrive). A module that
declares its own `dependencies` (chromes usually) gets them installed in place
during the scaffold.

Requires **git**, and **Node ≥24** to *run* the instance (Atelier's
requirement); the scaffolder itself runs on Node ≥18.

MIT © pa1nd
