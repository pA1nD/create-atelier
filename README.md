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

No modules and no chrome are scaffolded — those are yours to add. On first run
you'll see Atelier's "add a chrome" screen; add a chrome to start rendering.

Requires **Node ≥24** to *run* the instance (Atelier's requirement); the
scaffolder itself runs on Node ≥18.

MIT © pa1nd
