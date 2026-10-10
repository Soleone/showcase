# showcase

Read PLAN.md first: it has the decisions, what is done and what is next. Before taking a project up a tier, read docs/playbook.md.

This repo is shareable: keep notes about a maintainer's own projects, hosting or portfolio site out of it. The maintainer's are in `$DATA/primers/*showcase*` when `$DATA` is set; read the newest one before working on their projects.

- No runtime dependencies. Node 22+, ESM, `node:` imports, tests with `node --test` (`npm test`).
- The schema in `schema/showcase.schema.json` is the single source of truth; `src/schema.js` validates the subset of JSON Schema it uses. Extend the validator rather than duplicating rules.
- Try changes against real projects with `showcase check <paths> --matrix` and `showcase init <path> --dry-run` (the primer lists the maintainer's). Never write into another project's repo unless asked.
- Recording tools (agent-browser, FFmpeg) are required only by `src/capture.js`, exported as `@soleone/showcase/capture`. Everything else must work without them.
