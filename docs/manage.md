# showcase manage

```sh
showcase manage
```

No setup. It opens, in this order: the path you pass (for this run only), `$SHOWCASE_CONFIG`, the nearest `portfolio.json` from the current folder upwards, then `~/.config/showcase/portfolio.json`. If there is none of those, it creates that last one from the project in the current folder (or the projects directly inside it), asks which folders hold your projects and goes straight to the review.

## Decide which projects belong

`tab` switches between the portfolio and the **review**: every project showcase can find, strongest evidence first. It scans the folders in `roots` (asked the first time, never guessed: the prompt starts empty, lists the folders in your home directory that hold projects to pick by number, and takes any path you type; saved to portfolio.json as typed, so `$SRC` stays `$SRC`) and your GitHub repositories through `gh` when it is installed and logged in. Without `gh` it scans folders only and says so. A project is a folder in a root, or a folder inside one (`$SRC/category/project`); a folder with a package.json, Cargo.toml or similar is one itself.

Each row has a score, whether it is local, on GitHub or both, when it was last active and the evidence behind the score (README, live URL, stars, recent commits). The score only sets the order. It never decides. Keys:

- `i` includes the project in the portfolio, `1` `2` `3` include it with high, mid or low priority.
- `x` ignores it, so it never comes back for review. On an ignored project `x` brings it back. `u` undoes your last decisions, one at a time.
- `f` cycles Needs review, In the portfolio, Ignored and All projects. `r` scans again, `R` changes the folders, `tab` or `esc` goes back to the portfolio, where the new projects are graded.

The scan is kept in `~/.cache/showcase/` (safe to delete) and shown at once next time. Decisions are saved to portfolio.json as you make them: included projects in `projects`, ignored ones as ids in `ignored`.

## The portfolio

It is a full-screen list of every project with its tier, the goal its priority sets and what is still missing (`--offline` skips the live URL request). Keys:

- `enter` opens a project, which also says where its goal comes from (the priority; a `ceiling` can only lower it), where `enter` edits a text field, `←` `→` change a choice, and `n` drafts a missing showcase.json from the README.
- `s` cycles the sort: priority then tier (the start), tier, gap to the goal, or the order in portfolio.json. Sorting is only a view and the selection stays on the same project.
- `a` adds a project by path, `d` removes one from the portfolio (its files stay), `m` picks a project up: the arrows move it (`pgup`/`pgdn` jump 10, `g`/`G` go to the top or bottom), `enter` or `m` drops it, `esc` puts it back, and every step is saved to portfolio.json. `J` `K` move one step in the portfolio.json order sort. Portfolio sites can use that order to rank projects that share a priority and tier.
- `r` refreshes, `q` quits.

Fields come from the two schemas, so the limits you see while typing (`n/160`) are the validator's. Every edit is written right away. Changing an existing value touches only that value, so the diff is one line (adding or clearing a field rewrites the file in the same order): the config for priority and path (plus title and repo, but only for a project without a showcase.json, whose own facts always win), the project's own showcase.json for its facts. Nested `media` and `demo` stay hand-edited.
