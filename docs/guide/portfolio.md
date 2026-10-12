# The portfolio

A portfolio picks its projects in `portfolio.json` ([schema](../../schema/portfolio.schema.json)), in the order it shows them. showcase owns how demoable each project is; the portfolio owns which projects and how much it cares.

```json
{
  "roots": ["$HOME/code"],
  "ignored": ["local:old/scratch"],
  "projects": [
    { "id": "local:notecli", "priority": "high", "path": "$HOME/code/notecli" },
    { "id": "github:you/old-library", "title": "old-library", "priority": "low", "repo": "https://github.com/you/old-library" }
  ]
}
```

`roots` are the folders to scan for projects to review and `ignored` are ids someone decided against. Both are optional. Choosing is the person's job: decide which projects are in, never include or ignore on your own judgment unless asked.

## Finding the file

Every portfolio command uses, in order: `--config <file>`, `$SHOWCASE_CONFIG`, the nearest `portfolio.json` from the current folder upwards, then `~/.config/showcase/portfolio.json`.

## Commands an agent should use

```sh
showcase list --json                                  # the projects, in portfolio order, with stage
showcase add ~/code/notecli --priority high           # --id to pick the id (default local:<folder>)
showcase add --repo https://github.com/you/old --id github:you/old   # no local folder
showcase set local:notecli --priority mid             # high, mid, low, or none
showcase set local:notecli --stage prototype          # saved in its showcase.json
showcase remove local:notecli                         # its files stay
showcase collect --out public/showcase                # writes feed.json and copies local media and brand files
showcase discover --root ~/code --json --status review   # scan folders and GitHub; the candidates not yet decided
showcase ignore local:old/scratch                     # decided against: it leaves the review queue
showcase unignore local:old/scratch                   # back in the queue
```

`discover` lists each candidate with its `id`, `path`, `repo`, `score` and the `reasons` behind it, and a `status` of `review`, `included` or `ignored`. To include one, `showcase add <path> --id <id>` (or `--repo <url> --id <id>` for a GitHub project with no folder); adding an ignored project un-ignores it. `--no-github` scans folders only.

Edit portfolio.json through these, not by hand, so the diff stays one line. Do not run `showcase manage`: it is a full-screen interface for a person. Agents use `list`, `add`, `set` and `remove`.

## Priority sets the goal

Priority sets a project's target tier: high is S, mid is A, low is C, capped by the project's `ceiling`. `collect` writes `feed.json` with one entry per project: its showcase.json facts (or a draft from the README when it has none, marked `source: "draft"`), `tier`, `target` and `gap`, the required checks still failing up to the target. Projects without a local path are listed ungraded. Local media is copied to `media/<slug>/` and brand files to `brand/<slug>/`, and the feed points at the copies.

To find what to work on, read `list --json` and run `showcase check <paths> --matrix` over the local projects; the largest gap to target is the next job.

## After a change

- Media or showcase.json changed: run `showcase collect` again, commit the new feed and redeploy the site (the person's step if it publishes).
- A project moved and left a symlink behind: two entries for the same folder count as one, and `add` refuses a path already covered.
- A wide lead card reads better with its image beside the text than as a tall two-row card, which stretches to its neighbours and leaves empty space.
