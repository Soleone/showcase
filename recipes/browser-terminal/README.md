# Browser terminal recipe

The S-tier route for a CLI: a static page that boots a Node.js sandbox ([WebContainers](https://webcontainers.io)) in the visitor's browser and opens a real shell, with the project's own code and sample data mounted.

```sh
node recipes/browser-terminal/build.js recipes/browser-terminal/logdig --out dist/logdig --serve
```

A recipe folder holds `terminal.json`:

- `mount`: target path in the sandbox → `{ from, include }`. `from` may use `~` and `$VARS`; `include` limits the top-level entries copied.
- `env`: values may use `~` (the sandbox home) and `$PATH`.
- `setup`: commands run before the shell opens, e.g. seeding sample data dated relative to today.
- `title`, `pitch`, `repo`, `welcome`, `hints` (buttons that type a command), `disclosure`, `theme` (CSS variables).

The output is static: `index.html`, `files.json`, `terminal.json` and a `vercel.json` with the COOP/COEP headers the sandbox needs.

Sandbox quirks found so far:

- Mounted files are not executable; `chmod +x` them in `setup`.
- Extensionless ES modules exit silently, so command shims are CommonJS that `import()` the real entry point.
- A top-level `for await` fails to parse; read streams with events.
- Model calls: point the project at a stand-in (logdig's `piCommand`) that returns canned output, so nothing leaves the browser.

WebContainers is free for personal and open-source use; check the StackBlitz license before using it commercially.
