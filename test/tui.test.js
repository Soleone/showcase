import assert from "node:assert/strict";
import { mkdir as mkdirp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { addProject, createConfig, findConfig, sortRows } from "../src/manage.js";
import { createApp, parseKeys, wrap } from "../src/tui.js";
import { fixture, manifest, polishedFiles } from "./helpers.js";

const okFetch = async () => ({ ok: true, status: 200 });
const size = { width: 100, height: 30 };
const text = (app) => app.render(size).lines.join("\n");
const json = async (file) => JSON.parse(await readFile(file, "utf8"));

async function setup() {
  const root = await fixture({
    "demo/README.md": polishedFiles["README.md"],
    "demo/docs/hero.png": "png",
    "demo/docs/loop.webp": polishedFiles["docs/loop.webp"],
    "demo/package.json": polishedFiles["package.json"],
    "demo/showcase.json": { ...manifest, stage: "product" },
    "plain/README.md": "# Plain\n\nPlain keeps a small list of things that matter to you.\n",
  });
  const configFile = path.join(root, "portfolio.json");
  await writeFile(configFile, JSON.stringify({
    projects: [
      { id: "local:demo", priority: "high", path: "demo" },
      { id: "local:plain", priority: null, path: "plain" },
      { id: "github:me/remote", title: "remote", path: null },
    ],
  }, null, 2));
  const app = createApp({ configFile, offline: true, fetch: okFetch });
  await app.load();
  await app.idle();
  return { app, root, configFile, manifestFile: path.join(root, "demo/showcase.json") };
}

const press = async (app, ...inputs) => { for (const input of inputs) await app.key(input); await app.idle(); };

test("parseKeys splits escape sequences and keeps pasted text whole", () => {
  assert.deepEqual(parseKeys("\x1b[A\x1b[3~\r\x7f"), [{ name: "up" }, { name: "delete" }, { name: "enter" }, { name: "backspace" }]);
  assert.deepEqual(parseKeys("héllo wörld"), [{ name: "char", text: "héllo wörld" }]);
});

test("wrap breaks after a space and covers every character", () => {
  const ranges = wrap("one two three four", 9);
  assert.deepEqual(ranges.map(([start, end]) => "one two three four".slice(start, end)), ["one two ", "three ", "four"]);
  assert.deepEqual(wrap("", 10), [[0, 0]]);
});

test("the list shows every project with its tier, goal and gap", async () => {
  const { app } = await setup();
  const screen = text(app);
  assert.match(screen, /TIER\s+GOAL\s+PRIO\s+STAGE\s+PROJECT\s+KIND\s+GAP/);
  assert.match(screen, /\n A\s+S\s+high\s+product\s+Demo\s+cli\s+live/);
  assert.match(screen, /\n D\s+-\s+-\s+-\s+plain\s+other\s+next C: readme.substance/);
  assert.match(screen, /\n -\s+-\s+-\s+-\s+remote\s+no local path/);
});

test("changing priority writes the config and moves the goal", async () => {
  const { app, configFile } = await setup();
  await press(app, "\x1b[B", "\r", "j", "\x1b[C");
  assert.equal((await json(configFile)).projects[1].priority, "high");
  assert.match(text(app), /◂ high ▸/);
  await press(app, "\x1b");
  assert.match(text(app), /\n D\s+S\s+high\s+-\s+plain/);
});

test("the project screen says where the goal comes from, and that a ceiling only lowers it", async () => {
  const { app, configFile, manifestFile } = await setup();
  await press(app, "\r");
  assert.match(text(app), /goal S: high priority\n/);
  await writeFile(manifestFile, JSON.stringify({ ...manifest, stage: "product", ceiling: "A" }));
  await press(app, "\x1b", "r", "\r");
  assert.match(text(app), /goal A: high priority would aim for S, capped by ceiling A/);
  const config = await json(configFile);
  config.projects[0].priority = "mid";
  await writeFile(configFile, JSON.stringify(config));
  await writeFile(manifestFile, JSON.stringify({ ...manifest, stage: "product", ceiling: "S" }));
  await press(app, "\x1b", "r", "\r");
  assert.match(text(app), /goal A: mid priority, ceiling S does not lower it/);
});

test("editing a showcase.json field saves it, and the schema rejects what it forbids", async () => {
  const { app, manifestFile } = await setup();
  await press(app, "\r");
  for (let i = 0; i < 3; i += 1) await press(app, "j");
  await press(app, "\r");
  assert.match(text(app), /pitch\s+\d+\/160/);
  await press(app, "\x15", "x".repeat(170), "\r");
  assert.match(text(app), /170 characters, max 160/);
  assert.equal((await json(manifestFile)).pitch, manifest.pitch);
  await press(app, "\x15", "Notes, made readable.", "\r");
  assert.equal((await json(manifestFile)).pitch, "Notes, made readable.");
  assert.match(text(app), /Saved pitch to showcase.json/);
});

test("clearing a required field is refused and an optional list round-trips", async () => {
  const { app, manifestFile } = await setup();
  await press(app, "\r");
  for (let i = 0; i < 2; i += 1) await press(app, "j");
  await press(app, "\r", "\x15", "\r");
  assert.match(text(app), /title: required/);
  await press(app, "\x1b");
  assert.equal((await json(manifestFile)).title, "Demo");

  for (let i = 0; i < 6; i += 1) await press(app, "j");
  await press(app, "\r", "Node.js,  SQLite", "\r");
  const saved = await json(manifestFile);
  assert.deepEqual(saved.tech, ["Node.js", "SQLite"]);
  assert.deepEqual(Object.keys(saved).slice(0, 7), ["title", "pitch", "description", "kind", "stage", "tech", "media"]);
});

test("J and K reorder the portfolio on disk", async () => {
  const { app, configFile } = await setup();
  await press(app, "J");
  assert.match(text(app), /Press s until it says portfolio.json order/);
  await press(app, "s", "s", "s");
  assert.match(text(app), /by portfolio.json order/);
  await press(app, "J");
  assert.deepEqual((await json(configFile)).projects.map((entry) => entry.id), ["local:plain", "local:demo", "github:me/remote"]);
  assert.equal(app.state.cursor, 1);
  await press(app, "K", "K");
  assert.deepEqual((await json(configFile)).projects.map((entry) => entry.id), ["local:demo", "local:plain", "github:me/remote"]);
});

test("m picks a project up, the arrows move it in portfolio.json, enter drops it and escape puts it back", async () => {
  const { app, configFile } = await setup();
  const ids = async () => (await json(configFile)).projects.map((entry) => entry.id);
  await press(app, "m");
  assert.match(text(app), /by portfolio.json order/);
  assert.match(text(app), /Moving Demo/);
  await press(app, "j", "j");
  assert.deepEqual(await ids(), ["local:plain", "github:me/remote", "local:demo"]);
  assert.equal(app.state.cursor, 2);
  await press(app, "g");
  assert.deepEqual(await ids(), ["local:demo", "local:plain", "github:me/remote"]);
  await press(app, "G", "\r");
  assert.deepEqual(await ids(), ["local:plain", "github:me/remote", "local:demo"]);
  assert.match(text(app), /Dropped Demo at position 3/);
  assert.doesNotMatch(text(app), /Moving Demo/);
  await press(app, "m", "k", "k", "\x1b");
  assert.deepEqual(await ids(), ["local:plain", "github:me/remote", "local:demo"]);
  assert.match(text(app), /Put back where it was/);
});

test("a project without showcase.json can get a draft", async () => {
  const { app, root } = await setup();
  await press(app, "j", "\r");
  assert.match(text(app), /none yet. Press n/);
  await press(app, "n");
  assert.equal((await json(path.join(root, "plain/showcase.json"))).title, "Plain");
  assert.match(text(app), /\n kind\*?\s/);
});

test("the editor puts the cursor inside the wrapped text", async () => {
  const { app } = await setup();
  await press(app, "\r");
  for (let i = 0; i < 4; i += 1) await press(app, "j");
  await press(app, "\r", "\x1b[H");
  const { cursor, lines } = app.render(size);
  assert.match(lines[cursor.row], /^ {3}Reads your session logs/);
  assert.equal(cursor.col, 3);
});

test("the list can be drawn while projects are still loading", async () => {
  const { configFile } = await setup();
  const frames = [];
  const app = createApp({ configFile, offline: true, onChange: () => frames.push(text(app)) });
  await app.load();
  await app.idle();
  assert.match(frames[0], /loading/);
  assert.ok(frames.length > 3);
});

test("keys that arrive in one chunk are separate presses outside the editor but one paste inside it", async () => {
  const { app, manifestFile } = await setup();
  await press(app, "\rjjj\r");
  assert.equal(app.state.field, 3);
  assert.ok(app.state.edit);
  await press(app, "\x15jj kk\r");
  assert.equal((await json(manifestFile)).pitch, "jj kk");
});

test("editing one value leaves the rest of the file exactly as it was", async () => {
  const { app, root, manifestFile } = await setup();
  const original = `{\n  "title": "Demo",   "pitch": "Old \\"pitch\\", with commas",\n  "description": "Reads logs.",\n  "kind": "cli",\n  "tech": ["Node.js", "SQLite"],\n  "media": { "hero": "docs/hero.png" }\n}\n`;
  await writeFile(manifestFile, original);
  await press(app, "r");
  await press(app, "\rjjj\r", "\x15New pitch\r");
  assert.equal(await readFile(manifestFile, "utf8"), original.replace(/"Old .*?commas"/, '"New pitch"'));

  const config = await readFile(path.join(root, "portfolio.json"), "utf8");
  await press(app, "k", "k", "k", "\x1b[C");
  assert.notEqual(await readFile(path.join(root, "portfolio.json"), "utf8"), config);
});

test("findConfig prefers the env var, then the nearest config upwards, then the user-level one", async () => {
  const root = await fixture({ "work/portfolio.json": { projects: [] }, "work/deep/er/.keep": "" });
  const env = { XDG_CONFIG_HOME: path.join(root, "xdg") };
  const near = await findConfig({ cwd: path.join(root, "work/deep/er"), env });
  assert.deepEqual(near, { file: path.join(root, "work/portfolio.json"), exists: true });
  const set = await findConfig({ cwd: root, env: { ...env, SHOWCASE_CONFIG: "elsewhere.json" } });
  assert.deepEqual(set, { file: path.join(root, "elsewhere.json"), exists: false });
  const fallback = await findConfig({ cwd: path.join(root, "xdg"), env });
  assert.deepEqual(fallback, { file: path.join(root, "xdg/showcase/portfolio.json"), exists: false });
});

test("createConfig registers the project in this folder, or the projects inside it", async () => {
  const single = await fixture({ "package.json": { name: "solo" }, "README.md": "# Solo\n" });
  const file = path.join(await fixture(), "showcase/portfolio.json");
  assert.equal(await createConfig(file, single), 1);
  assert.deepEqual((await json(file)).projects.map((entry) => entry.id), [`local:${path.basename(single).toLowerCase()}`]);

  const many = await fixture({ "a/README.md": "# A\n", "b/package.json": {}, "node_modules/x/package.json": {}, ".hidden/README.md": "", "notes/todo.txt": "" });
  const other = path.join(many, "portfolio.json");
  assert.equal(await createConfig(other, many), 2);
  assert.deepEqual((await json(other)).projects.map((entry) => [entry.id, entry.path]), [["local:a", "a"], ["local:b", "b"]]);
});

test("a and d add and remove projects without touching their files", async () => {
  const { app, root, configFile } = await setup();
  const extra = await fixture({ "README.md": "# Extra\n" });
  await press(app, "a");
  assert.match(text(app), /Add a project/);
  await press(app, "\r");
  assert.match(app.state.edit.error, /Type the path/);
  await press(app, "/nowhere/at/all", "\r");
  assert.match(app.state.edit.error, /is not a folder/);
  await press(app, "\x15");
  await press(app, extra, "\r");
  assert.match(text(app), /Added local:showcase-test-/);
  assert.equal((await json(configFile)).projects.length, 4);
  assert.equal(app.state.rows[app.state.cursor].root, extra);

  await press(app, "a", extra, "\r");
  assert.match(text(app), /already points there/);
  await press(app, "\x1b");

  await press(app, "d");
  assert.match(text(app), /Remove .* from the portfolio\?/);
  await press(app, "y");
  assert.equal((await json(configFile)).projects.length, 3);
  assert.equal((await stat(path.join(extra, "README.md"))).isFile(), true);
  await press(app, "d", "n");
  assert.equal((await json(configFile)).projects.length, 3);
});

test("an empty portfolio explains how to add a project", async () => {
  const root = await fixture({ "portfolio.json": { projects: [] } });
  const app = createApp({ configFile: path.join(root, "portfolio.json"), cwd: root, offline: true });
  await app.load();
  assert.match(text(app), /No projects in this portfolio yet/);
  await press(app, "j", "x");
  await press(app, "a", ".", "\r");
  assert.equal(app.state.rows.length, 1);
});

test("started inside an unregistered project, it offers to add it; a subfolder counts too", async () => {
  const { configFile } = await setup();
  const project = await fixture({ "package.json": { name: "fresh" }, "src/deep/.keep": "" });
  const app = createApp({ configFile, cwd: path.join(project, "src/deep"), offline: true, fetch: okFetch });
  await app.load();
  await app.offerHere();
  assert.match(text(app), /Add .* to the portfolio\? y\/n/);
  await press(app, "y");
  assert.equal(app.state.rows[app.state.cursor].root, project);
  assert.equal((await json(configFile)).projects.at(-1).path, project);

  const again = createApp({ configFile, cwd: project, offline: true });
  await again.load();
  await again.offerHere();
  assert.equal(again.state.confirm, null);
});

test("no offer when the project is declined, already listed, or holds the portfolio itself", async () => {
  const { configFile, root } = await setup();
  const listed = createApp({ configFile, cwd: path.join(root, "demo"), offline: true });
  await listed.load();
  await listed.offerHere();
  assert.equal(listed.state.confirm, null);

  const holder = await fixture({ "package.json": {}, "portfolio.json": { projects: [] } });
  const own = createApp({ configFile: path.join(holder, "portfolio.json"), cwd: holder, offline: true });
  await own.load();
  await own.offerHere();
  assert.equal(own.state.confirm, null);

  const project = await fixture({ ".git/HEAD": "" });
  const declined = createApp({ configFile, cwd: project, offline: true });
  await declined.load();
  await declined.offerHere();
  await press(declined, "n");
  assert.equal((await json(configFile)).projects.length, 3);
});

test("a portfolio.json that is some other project's data is not mistaken for the portfolio", async () => {
  const root = await fixture({ "site/portfolio.json": { items: ["a", "b"] }, "site/src/.keep": "" });
  const env = { XDG_CONFIG_HOME: path.join(root, "xdg") };
  assert.equal((await findConfig({ cwd: path.join(root, "site/src"), env })).file, path.join(root, "xdg/showcase/portfolio.json"));
});

test("the portfolio title and repo only show for a project without a showcase.json", async () => {
  const { app } = await setup();
  await press(app, "\r");
  assert.equal((text(app).match(/ repo /g) ?? []).length, 1, "repo appears once, from showcase.json");
  await press(app, "\x1b", "j", "j", "\r");
  assert.match(text(app), /\n title\b[^\n]*remote/);
  assert.match(text(app), /\n repo\b/);
});

test("stage is a choice in showcase.json, cycled like priority", async () => {
  const { app, manifestFile } = await setup();
  await press(app, "\r");
  for (let i = 0; i < 6; i += 1) await press(app, "j");
  assert.match(text(app), /◂ product ▸/);
  await press(app, "\x1b[C");
  assert.equal((await json(manifestFile)).stage, "prototype");
  await press(app, "\x1b[C", "\x1b[C");
  assert.equal((await json(manifestFile)).stage, undefined, "past the last choice it is unset again");
});

test("sorting is only a view: it never changes the portfolio and the cursor follows the project", () => {
  const row = (id, priority, tier, target) => ({ id, entry: { id, priority }, report: tier && { tier }, target });
  const rows = [row("low-b", "low", "B", "C"), row("none-s", null, "S", null), row("high-d", "high", "D", "S"), row("mid-a", "mid", "A", "S"), row("remote", null, null, null)];
  const ids = (mode) => sortRows(rows, mode).map((r) => r.id);
  assert.deepEqual(ids("priority"), ["high-d", "mid-a", "low-b", "none-s", "remote"]);
  assert.deepEqual(ids("tier"), ["none-s", "mid-a", "low-b", "high-d", "remote"]);
  assert.deepEqual(ids("gap"), ["high-d", "mid-a", "none-s", "low-b", "remote"]);
  assert.deepEqual(ids("order"), rows.map((r) => r.id));
  assert.deepEqual(rows.map((r) => r.id), ["low-b", "none-s", "high-d", "mid-a", "remote"]);
});

test("s cycles the sort and the selected project stays selected", async () => {
  const { app, configFile } = await setup();
  const before = JSON.stringify(await json(configFile));
  await press(app, "j");
  assert.equal(app.state.rows[app.state.cursor].id, "local:plain");
  await press(app, "s");
  assert.match(text(app), /by tier, best first/);
  assert.equal(app.state.rows[app.state.cursor].id, "local:plain");
  await press(app, "s");
  assert.match(text(app), /by gap to target, biggest first/);
  assert.equal(JSON.stringify(await json(configFile)), before);
});

test("a symlink to a project already in the portfolio is ignored, and cannot be added again", async () => {
  const { app, root, configFile } = await setup();
  await symlink(path.join(root, "demo"), path.join(root, "old-demo"));
  const config = await json(configFile);
  config.projects.unshift({ id: "local:old-demo", priority: null, path: "old-demo" });
  await writeFile(configFile, JSON.stringify(config));
  await app.load();
  await app.idle();
  assert.deepEqual(app.state.rows.map((row) => row.id).sort(), ["github:me/remote", "local:demo", "local:plain"]);
  assert.match(text(app), /Ignoring local:old-demo \(same folder as local:demo\)/);
  await symlink(path.join(root, "plain"), path.join(root, "plain-link"));
  assert.deepEqual(await addProject(configFile, path.join(root, "plain-link")), { error: "local:plain already points there" });
});

async function reviewSetup() {
  const root = await fixture({
    "src/products/alpha/package.json": "{}",
    "src/products/alpha/README.md": "# Alpha\n\nAlpha keeps small notes in one place for people who like order.\n",
    "src/products/beta/package.json": "{}",
    "src/tries/loose/package.json": "{}",
  });
  const configFile = path.join(root, "portfolio.json");
  await writeFile(configFile, JSON.stringify({ projects: [] }));
  const env = { ...process.env, XDG_CACHE_HOME: path.join(root, "cache") };
  const app = createApp({ configFile, offline: true, fetch: okFetch, env, scanOptions: { github: false } });
  await app.load();
  await app.idle();
  return { app, root, configFile, src: path.join(root, "src") };
}

test("tab opens the review screen, which asks where to look first and then scans", async () => {
  const { app, configFile, src } = await reviewSetup();
  await press(app, "\t");
  assert.match(text(app), /Folders to scan for projects/);
  await press(app, "\x15", src, "\r");
  assert.deepEqual((await json(configFile)).roots, [src]);
  const screen = text(app);
  assert.match(screen, /Needs review 3\s+In the portfolio 0\s+Ignored 0\s+All projects 3/);
  assert.match(screen, /SCORE\s+PROJECT\s+SOURCE\s+ACTIVE\s+SIGNALS/);
  assert.match(screen, /products\/alpha\s+local\s+today\s+README/);
  assert.match(screen, /Found 3 projects, 3 to review/);
});

test("i and 1-3 include with a priority, x ignores, u undoes, and the portfolio list follows", async () => {
  const { app, configFile, src } = await reviewSetup();
  await press(app, "\t", "\x15", src, "\r");
  const ids = () => app.state.review.all.filter((candidate) => candidate.status === "review").map((candidate) => candidate.id);
  assert.equal(ids()[0], "local:products/alpha", "the one with a README comes first");
  await press(app, "1");
  let config = await json(configFile);
  assert.deepEqual(config.projects.map(({ id, priority, path: where }) => [id, priority, where]), [["local:products/alpha", "high", "src/products/alpha"]]);
  assert.match(text(app), /Added local:products\/alpha with high priority/);
  await press(app, "x");
  assert.deepEqual((await json(configFile)).ignored, ["local:products/beta"]);
  await press(app, "i");
  assert.deepEqual((await json(configFile)).projects.map((entry) => [entry.id, entry.priority]), [["local:products/alpha", "high"], ["local:tries/loose", null]]);
  assert.match(text(app), /Needs review 0/);
  assert.match(text(app), /Nothing left to review/);

  await press(app, "u");
  assert.deepEqual((await json(configFile)).projects.map((entry) => entry.id), ["local:products/alpha"]);
  assert.equal(app.state.review.all.find((candidate) => candidate.id === "local:tries/loose").status, "review");
  await press(app, "u", "u");
  config = await json(configFile);
  assert.equal(config.projects.length, 0);
  assert.equal("ignored" in config, false);
  assert.match(text(app), /Needs review 3/);
  await press(app, "u");
  assert.match(text(app), /Nothing to undo/);

  await press(app, "i", "\t");
  assert.equal(app.state.screen, "list");
  assert.match(text(app), /1 project/);
  assert.match(text(app), /products\/alpha\s+other/);
});

test("the filters show what was decided, an ignored project can be included, and a portfolio project cannot be ignored here", async () => {
  const { app, configFile, src } = await reviewSetup();
  await press(app, "\t", "\x15", src, "\r");
  await press(app, "i", "x");
  await press(app, "f");
  assert.match(text(app), /In the portfolio 1/);
  assert.match(text(app), /products\/alpha\s+local\s+today\s+in portfolio/);
  await press(app, "x");
  assert.match(text(app), /In the portfolio already/);
  await press(app, "f");
  assert.match(text(app), /products\/beta/);
  await press(app, "x");
  assert.equal("ignored" in (await json(configFile)), false, "x on an ignored project brings it back");
  await press(app, "f", "f");
  assert.equal(app.state.review.filter, "review");
  await press(app, "f", "f", "f");
  assert.equal(app.state.review.filter, "all");
  assert.match(text(app), /products\/alpha\s+local\s+today\s+in portfolio/);
  assert.match(text(app), /products\/beta\s+local\s+today\s+active/);
});

test("a second visit shows the saved scan at once, and r scans again", async () => {
  const { app, src } = await reviewSetup();
  await press(app, "\t", "\x15", src, "\r");
  await press(app, "\t");
  await mkdirp(path.join(src, "products/gamma"));
  await writeFile(path.join(src, "products/gamma/package.json"), "{}");
  await press(app, "\t");
  assert.match(text(app), /Needs review 3/);
  await press(app, "r");
  assert.match(text(app), /Needs review 4/);
});
