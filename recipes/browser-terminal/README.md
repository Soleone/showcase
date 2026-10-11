# Browser terminal recipe

The S-tier route for a CLI: a static page that boots a Node.js sandbox ([WebContainers](https://webcontainers.io)) in the visitor's browser and opens a real shell, with the project's own code and sample data mounted.

```sh
showcase terminal --serve                       # builds demo/browser into dist/browser, serves it on 127.0.0.1:4321
showcase terminal path/to/recipe --out dist/demo
```

Keep the recipe folder in the project itself (`demo/browser/` by default), so the project owns its sample data and stand-ins. Relative paths in it resolve from the recipe folder. It holds `terminal.json`:

- `project`: the project folder. Title, pitch and repo come from its `showcase.json`, and the page's disclosure line is written from `demo.externals` (each stand-in's `note`).
- `mount`: target path in the sandbox → `{ from, include }`. `from` may use `~` and `$VARS`; `include` limits the top-level entries copied. Binary files (images, loops) are mounted too.
- `env`: values may use `~` (the sandbox home, always `/home/demo`) and `$PATH` (costs one extra process at boot; write the PATH out instead).
- `setup`: commands run before the shell opens, e.g. seeding sample data dated relative to today.
- `welcome`, `hints` (buttons that type a command), `seed` (a browser module that adds files computed at visit time, such as dates relative to today), and overrides for `title`, `pitch`, `repo`, `disclosure`, `defaultTheme` (a name from `themes.json`, default `gilt`).

The output is static: `index.html`, `files.json`, `terminal.json`, `themes.json`, `fonts/` and a `vercel.json` with the COOP/COEP headers the sandbox needs.

The terminal font is JetBrainsMono Nerd Font Mono, self-hosted as WOFF2 (about 600 KB per weight) so CLI icons render. `fonts/build.sh` rebuilds it from a pinned Nerd Fonts release, keeping the Basic Multilingual Plane and dropping the Material Design plane.

Sandbox quirks found so far:

- Mounted files are not executable; `chmod` them from a setup script (one process is faster than several setup commands).
- Extensionless ES modules exit silently, so command shims are CommonJS that `import()` the real entry point.
- A top-level `for await` fails to parse; read streams with events.
- Model calls: point the project at a stand-in (a setting that names the model command) that returns canned output, so nothing leaves the browser.

WebContainers is free for personal and open-source use; check the StackBlitz license before using it commercially.

The page has a theme picker (23 palettes, remembered in the visitor's browser). A theme colors the page and the terminal's 16 ANSI colors together, so whatever the CLI prints follows it. `themes.json` holds the resolved colors of each palette, derived from omarchy `colors.toml` files.
