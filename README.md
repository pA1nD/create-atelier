# create-atelier

Scaffold a new [Atelier](https://github.com/pA1nD/atelier) instance in one command.

```sh
npm create @pa1nd/atelier my-studio
cd my-studio
npm install
npm run dev            # → http://localhost:1844
```

It writes a **tiny** instance — a `package.json` that depends on
[`@pa1nd/atelier`](https://www.npmjs.com/package/@pa1nd/atelier), an
`atelier.config.json`, a `.gitignore`, and a `README`. Nothing is vendored: the
shell arrives from npm and runs itself from `node_modules`, so you update it with
`npm update @pa1nd/atelier`.

By default no modules and no chrome are scaffolded — on first run you'll see
Atelier's "add a chrome" screen; add a chrome to start rendering.

## Starter kits

A **kit** is a github repo of module folders. Pull a whole one at scaffold time:

```sh
npm create @pa1nd/atelier my-studio -- --kit atelier-modules
```

Every module the kit lists (its `.atelier/marketplace.json` manifest, or simply
every folder) lands in the instance, and the kit's chrome is detected and set as
`defaultChrome` — the first `npm run dev` renders themed, modules included. A
bare kit name means `pA1nD/<kit>` —
[`atelier-modules`](https://github.com/pA1nD/atelier-modules) is the first kit —
and `owner/repo` names any other public repo shaped the same way.

## Starter modules

Or cherry-pick:

```sh
npm create @pa1nd/atelier my-studio -- --chrome <spec> --add <spec>
```

- `--chrome <spec>` — download a chrome module and set it as the instance's
  `defaultChrome`.
- `--add <spec>` — download any other module (repeatable).

A bare `<spec>` (`atelier-chrome`, `dock`) names one folder of the kit repo
(the `--kit` one if given, else `pA1nD/atelier-modules`). Anything else is
fetched via `npm pack`: a registry name (`@scope/some-chrome`), a git url
(`github:user/repo`), a tarball url, or a local folder.

Either way each module lands as a **plain folder** in the instance — the folder
name is the module id, and the instance owns it from there (edit it, delete it —
no lockstep with the source). A module that declares its own `dependencies`
(chromes usually) gets them installed in place during the scaffold.

Requires **Node ≥24** to *run* the instance (Atelier's requirement); the
scaffolder itself runs on Node ≥18.

MIT © pa1nd
