# showcase.json (A)

The project's facts, for any portfolio to use. Start from `showcase init <path> --dry-run`, then fix the draft by hand. The full contract is [the schema](../../schema/showcase.schema.json), and `showcase check` validates against it. Fields starting with `x-` are free for your own use. Importance and ordering belong to the portfolio, not here (see `portfolio`).

- `pitch` is one sentence. If a portfolio card needs more, write a `description` (required, up to 240 characters) that adds how it works or what sets it apart, and never restates the pitch.
- `kind` is what visitors get, not the stack. A web app with an optional desktop companion is still `web-app` if the hosted site is the product. `local-web-app` is a browser UI backed by a process on the user's machine; it looks like any web app, so set it by hand.
- `stage` is `product`, `prototype` or `proof of concept`.
- `live` is read from showcase.json only. A site that is up still fails the `live` check until showcase.json says where it is.
- `ceiling` is the highest tier reachable. `check` stops suggesting more, and a portfolio goal never exceeds it. Use it instead of forcing a tier, and say why.
- `media`: `hero` (a still), `motion` (a looping WebP or GIF), `video`, and `capture`, the command that regenerates them. See `media`.
- `demo.local` is the one command that runs it with sample data. `demo.strategy` is the route to S, by kind (see `demo`).
- `demo.externals` lists everything a demo cannot reach (a model, an account, hardware, a service, another app), the `seam` where a stand-in plugs in without changing the code, and the `standIn` used: `canned`, `replay`, `simulated`, `bring-your-own`, `real` or `omitted`. List an external even when the answer is `bring-your-own` (an optional companion app, a user's own account). Use `[]` when there is nothing. Each `note` is shown to visitors, so make it say plainly what is not real.
