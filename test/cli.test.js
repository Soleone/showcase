import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fixture, polishedFiles } from "./helpers.js";

const bin = fileURLToPath(new URL("../bin/showcase.js", import.meta.url));
const run = (...args) => promisify(execFile)(process.execPath, [bin, ...args], { env: { ...process.env, NO_COLOR: "1" } })
  .catch((error) => error);

test("check --json reports each project", async () => {
  const [polished, empty] = await Promise.all([fixture(polishedFiles), fixture({})]);
  const { stdout } = await run("check", polished, empty, "--json", "--offline");
  assert.deepEqual(JSON.parse(stdout).map((report) => report.tier), ["B", "D"]);
});

test("check prints a summary for several projects and details for one", async () => {
  const [polished, empty] = await Promise.all([fixture(polishedFiles), fixture({})]);
  const summary = await run("check", polished, empty, "--offline");
  assert.match(summary.stdout, /^TIER\s+PROJECT/);
  assert.match(summary.stdout, /\nD\s+showcase-test-\S+\s+other\s+C needs readme, readme.substance, readme.usage/);
  const single = await run("check", polished, "--offline");
  assert.match(single.stdout, /To reach A:/);
});

test("check --matrix lines up every check against every project", async () => {
  const [polished, empty] = await Promise.all([fixture(polishedFiles), fixture({})]);
  const { stdout } = await run("check", polished, empty, "--matrix", "--offline");
  assert.match(stdout, /^\s+CHECK\s+showcase-te…\s+showcase-te…/);
  assert.match(stdout, /\n\s+tier\s+B\s+D\n/);
  assert.match(stdout, /\nB  readme.hero\s+✓\s+✗\n/);
  assert.match(stdout, /\nA  media.capture\*\s+·\s+·\n/);
});

test("check --min fails when a project is below the tier", async () => {
  const root = await fixture(polishedFiles);
  assert.equal((await run("check", root, "--offline", "--min", "B")).code, undefined);
  assert.equal((await run("check", root, "--offline", "--min", "A")).code, 1);
  assert.equal((await run("check", root, "--min", "Z")).code, 2);
});

test("init drafts showcase.json and refuses to overwrite it", async () => {
  const root = await fixture(polishedFiles);
  const first = await run("init", root);
  assert.match(first.stdout, /Wrote/);
  const written = JSON.parse(await readFile(path.join(root, "showcase.json"), "utf8"));
  assert.deepEqual({ title: written.title, pitch: written.pitch, kind: written.kind, media: written.media }, {
    title: "Demo",
    pitch: "Demo turns a messy folder of notes into a tidy daily journal that you can actually read.",
    kind: "cli",
    media: { hero: "docs/hero.png" },
  });
  const second = await run("init", root);
  assert.equal(second.code, 2);
  assert.match(second.stderr, /already exists/);
});

test("unknown commands fail with a hint", async () => {
  const result = await run("deploy");
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unknown command 'deploy'/);
});

test("init shortens a long lead to its first sentence", async () => {
  const lead = `Demo is a tool. ${"It does many things for many people in many places. ".repeat(4)}`;
  const root = await fixture({ "README.md": `# Demo\n\n${lead}\n` });
  const { stdout } = await run("init", root, "--dry-run");
  assert.match(stdout, /^Draft for /);
  assert.equal(JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.indexOf("\n}") + 2)).pitch, "Demo is a tool.");
  assert.match(stdout, /description: required/);
});

test("add, list and remove edit the portfolio without the UI; collect finds it by itself", async () => {
  const root = await fixture({ "proj/README.md": "# Proj\n", "portfolio.json": { projects: [] } });
  const config = path.join(root, "portfolio.json");
  const added = await run("add", path.join(root, "proj"), "--config", config, "--priority", "high", "--type", "product", "--id", "local:p");
  assert.match(added.stdout, /Added local:p/);
  assert.equal((await run("add", path.join(root, "proj"), "--config", config)).code, 2);
  assert.equal((await run("add", root, "--config", config, "--priority", "urgent")).code, 2);
  assert.deepEqual(JSON.parse((await run("list", "--json", "--config", config)).stdout).map((p) => [p.id, p.priority, p.type]), [["local:p", "high", "product"]]);
  assert.match((await run("list", "--config", config)).stdout, /^local:p\s+high\s+/);
  assert.match((await run("set", "local:p", "--config", config, "--priority", "low", "--type", "prototype")).stdout, /Updated local:p/);
  assert.equal((await run("set", "local:p", "--config", config, "--priority", "urgent")).code, 2);
  assert.equal((await run("set", "local:p", "--config", config)).code, 2);
  await run("set", "local:p", "--config", config, "--priority", "high", "--type", "product");
  const remote = await run("add", "--repo", "https://github.com/me/old", "--id", "github:me/old", "--priority", "low", "--config", config);
  assert.match(remote.stdout, /Added github:me\/old/);
  assert.equal((await run("add", "--repo", "https://github.com/me/old", "--id", "github:me/other", "--config", config)).code, 2);
  assert.equal((await run("add", "--repo", "https://github.com/me/new", "--config", config)).code, 2);
  assert.deepEqual(JSON.parse((await run("list", "--json", "--config", config)).stdout).at(-1), { id: "github:me/old", priority: "low", path: null, repo: "https://github.com/me/old" });
  await run("remove", "github:me/old", "--config", config);
  const out = path.join(root, "site");
  await run("collect", "--config", config, "--out", out, "--offline");
  assert.equal(JSON.parse(await readFile(path.join(out, "feed.json"), "utf8")).projects[0].priority, "high");
  assert.match((await run("remove", "local:nope", "--config", config)).stderr, /not in/);
  await run("remove", "local:p", "--config", config);
  assert.deepEqual(JSON.parse(await readFile(config, "utf8")).projects, []);
});
