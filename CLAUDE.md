# showcase

Read PLAN.md first: it has the decisions, the flagship projects and the next milestone.

- No runtime dependencies. Node 22+, ESM, `node:` imports, tests with `node --test` (`npm test`).
- The schema in `schema/showcase.schema.json` is the single source of truth; `src/schema.js` validates the subset of JSON Schema it uses. Extend the validator rather than duplicating rules.
- Try changes against the real flagships with `showcase check ~/src/products/{vibestep,logdig,better-youtube,podcaster,tasks}` and `showcase init <path> --dry-run`. Never write into another project's repo unless asked.
