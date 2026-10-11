import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { collect, resolvePath, targetTier } from "../src/collect.js";
import { fixture, manifest, polishedFiles } from "./helpers.js";

const okFetch = async () => ({ ok: true, status: 200 });

test("collect grades each project, copies local media and writes feed.json", async () => {
  const projects = await fixture({
    "demo/README.md": polishedFiles["README.md"],
    "demo/docs/hero.png": "png",
    "demo/docs/loop.webp": polishedFiles["docs/loop.webp"],
    "demo/package.json": polishedFiles["package.json"],
    "demo/showcase.json": { ...manifest, media: { ...manifest.media, video: "https://example.com/demo.mp4" } },
    "plain/README.md": "# Plain\n\nPlain keeps a small list of things that matter to you.\n\n## Install\n\nRun it.\n",
  });
  const out = path.join(await fixture(), "site");
  const config = path.join(projects, "portfolio.json");
  await writeFile(config, JSON.stringify({
    projects: [
      { id: "local:demo", priority: "high", stage: "product", path: "$PROJECTS/demo" },
      { id: "local:plain", priority: "low", path: "plain" },
      { id: "github:me/remote", title: "remote", priority: null, path: null, repo: "https://github.com/me/remote" },
    ],
  }));

  const { feed, reports, warnings } = await collect(config, { out, fetch: okFetch, env: { PROJECTS: projects } });
  const [demo, plain, remote] = feed.projects;
  assert.deepEqual(demo.media, { hero: "media/demo/hero.png", motion: "media/demo/motion.webp", video: "https://example.com/demo.mp4" });
  assert.equal((await stat(path.join(out, "media/demo/motion.webp"))).isFile(), true);
  assert.deepEqual({ tier: demo.tier, target: demo.target, gap: demo.gap, source: demo.source }, { tier: "A", target: "S", gap: ["live"], source: "showcase.json" });
  assert.deepEqual({ title: plain.title, tier: plain.tier, target: plain.target, gap: plain.gap, source: plain.source }, { title: "Plain", tier: "D", target: "C", gap: ["readme.substance"], source: "draft" });
  assert.deepEqual(remote, { id: "github:me/remote", priority: null, stage: null, title: "remote", repo: "https://github.com/me/remote", tier: null, target: null, gap: [], source: null });
  assert.equal(reports.length, 2);
  assert.deepEqual(warnings, ["github:me/remote: no local path, listed without a grade"]);
  assert.deepEqual(JSON.parse(await readFile(path.join(out, "feed.json"), "utf8")), feed);
});

test("collect rejects an invalid config", async () => {
  const root = await fixture({ "portfolio.json": { projects: [{ priority: "urgent" }] } });
  await assert.rejects(collect(path.join(root, "portfolio.json"), { out: root }), /id: required[\s\S]*priority: must be one of/);
  const twice = await fixture({ "portfolio.json": { projects: [{ id: "a" }, { id: "a" }] } });
  await assert.rejects(collect(path.join(twice, "portfolio.json"), { out: twice }), /duplicate id a/);
});

test("priority sets the target tier and a ceiling caps it", () => {
  assert.equal(targetTier("high"), "S");
  assert.equal(targetTier("mid"), "A");
  assert.equal(targetTier("high", "A"), "A");
  assert.equal(targetTier("low", "A"), "C");
  assert.equal(targetTier(null), null);
});

test("paths expand ~ and $VARS and resolve from the config folder", () => {
  assert.equal(resolvePath("${SRC}/a", "/cfg", { SRC: "/src" }), "/src/a");
  assert.equal(resolvePath("rel/b", "/cfg", {}), "/cfg/rel/b");
  assert.throws(() => resolvePath("$NOPE/c", "/cfg", {}), /\$NOPE not set/);
});
