# showcase

Read PLAN.md first: it has the decisions, what is done and what is next. Before taking a project up a tier, run `showcase guide`.

This repo is shareable: keep notes about a maintainer's own projects, hosting or portfolio site out of it. The maintainer's are in `$DATA/primers/*showcase*` when `$DATA` is set; read the newest one before working on their projects.

- No runtime dependencies. Node 22+, ESM, `node:` imports, tests with `node --test` (`npm test`).
- The schema in `schema/showcase.schema.json` is the single source of truth; `src/schema.js` validates the subset of JSON Schema it uses. Extend the validator rather than duplicating rules.
- Try changes against real projects with `showcase check <paths> --matrix` and `showcase init <path> --dry-run` (the primer lists the maintainer's). Never write into another project's repo unless asked.
- The agent-facing instructions are `showcase guide`, printed from `docs/guide/*.md`; `src/guide.js` lists the topics. When a lesson changes how the work is done, update the topic. `skills/showcase/SKILL.md` is only a pointer to `showcase guide`: keep instructions out of it. Check the plugin still loads with `claude plugin validate . --strict`.
- showcase defines outcomes and how they are measured. The tools that produce them live in their own packages ([showcase-terminal](https://github.com/Soleone/showcase-terminal), [showcase-capture](https://github.com/Soleone/showcase-capture)); the guide may name them as examples but never requires them. They depend on `showcase.json`, never on this package.
