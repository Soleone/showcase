import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { evaluate } from "../src/checks.js";
import { loadProject } from "../src/project.js";
import { fixture, manifest, polishedFiles, webp } from "./helpers.js";

const okFetch = async () => ({ ok: true, status: 200 });
const grade = async (files, options = {}) => evaluate(await loadProject(await fixture(files)), { fetch: okFetch, ...options });
const status = (report, id) => report.checks.find((check) => check.id === id).status;

test("an empty project is D and needs a README", async () => {
  const report = await grade({});
  assert.equal(report.tier, "D");
  assert.equal(report.next, "C");
  assert.deepEqual(report.nextSteps.map((step) => step.id), ["readme", "readme.substance", "readme.usage"]);
});

test("a plain README that explains how to run it is C", async () => {
  const report = await grade({ "README.md": `# Thing\n\nShort.\n\n## Install\n\n${"word ".repeat(100)}` });
  assert.equal(report.tier, "C");
  assert.equal(status(report, "readme.pitch"), "fail");
  assert.equal(status(report, "readme.hero"), "fail");
});

test("a polished README is B, and A needs the manifest and a local demo", async () => {
  const report = await grade(polishedFiles);
  assert.equal(report.tier, "B");
  assert.deepEqual(report.nextSteps.map((step) => step.id), ["manifest", "media.motion", "demo.local", "demo.externals", "media.capture"]);
});

test("a valid manifest with motion and a local demo is A, without the advisory capture", async () => {
  const report = await grade({ ...polishedFiles, "showcase.json": manifest });
  assert.equal(report.tier, "A");
  assert.equal(status(report, "media.capture"), "fail");
  assert.deepEqual(report.nextSteps.map((step) => step.id), ["live"]);
  assert.match(report.nextSteps[0].hint, /in-browser terminal/);
});

test("a reachable live URL is S", async () => {
  const report = await grade({ ...polishedFiles, "showcase.json": { ...manifest, live: "https://demo.example.com" } });
  assert.equal(report.tier, "S");
  assert.equal(report.next, null);
});

test("an unreachable or unverified live URL stays A", async () => {
  const files = { ...polishedFiles, "showcase.json": { ...manifest, live: "https://demo.example.com" } };
  const down = await grade(files, { fetch: async () => ({ ok: false, status: 502 }) });
  assert.equal(down.tier, "A");
  assert.match(down.nextSteps[0].detail, /returned 502/);
  const offline = await grade(files, { offline: true });
  assert.equal(offline.tier, "A");
  assert.equal(status(offline, "live"), "skip");
});

test("a still WebP is not motion", async () => {
  const report = await grade({ ...polishedFiles, "docs/loop.webp": webp({ animated: false }), "showcase.json": manifest });
  assert.equal(status(report, "media.motion"), "fail");
});

test("a ceiling stops the next steps", async () => {
  const report = await grade({ ...polishedFiles, "showcase.json": { ...manifest, ceiling: "A" } });
  assert.equal(report.tier, "A");
  assert.equal(report.next, null);
  assert.deepEqual(report.nextSteps, []);
});

test("manifest media must exist and the manifest must validate", async () => {
  const missing = await grade({ ...polishedFiles, "showcase.json": { ...manifest, media: { hero: "nope.png" } } });
  assert.match(missing.checks.find((check) => check.id === "manifest").detail, /media not found: nope.png/);
  const invalid = await grade({ ...polishedFiles, "showcase.json": "{ not json" });
  assert.match(invalid.checks.find((check) => check.id === "manifest").detail, /invalid JSON/);
});

test("brand.icon is advice for kinds that need a favicon and never changes the tier", async () => {
  const advice = (report) => report.checks.find((check) => check.id === "brand.icon");
  const cli = await grade({ ...polishedFiles, "showcase.json": manifest });
  assert.deepEqual([advice(cli).status, advice(cli).required, cli.tier], ["pass", false, "A"]);
  assert.match(advice(cli).detail, /not needed for a cli/);

  const web = await grade({ ...polishedFiles, "showcase.json": { ...manifest, kind: "web-app" } });
  assert.deepEqual([advice(web).status, advice(web).guide, web.tier], ["fail", "brand", "A"]);

  const branded = await grade({ ...polishedFiles, "icon.svg": "<svg/>", "showcase.json": { ...manifest, kind: "web-app", brand: { icon: "icon.svg", colors: ["#112233"] } } });
  assert.equal(advice(branded).status, "pass");
  assert.equal(branded.tier, "A");

  const missing = await grade({ ...polishedFiles, "showcase.json": { ...manifest, brand: { logo: "nope.svg" } } });
  assert.match(missing.checks.find((check) => check.id === "manifest").detail, /brand not found: nope.svg/);
  assert.equal(missing.tier, "B");
});

test("broken local links fail, and same-repo GitHub URLs resolve to local files", async () => {
  const root = await fixture({
    ...polishedFiles,
    "README.md": `${polishedFiles["README.md"]}\n[gone](docs/missing.md) [ok](https://github.com/me/demo/blob/main/docs/hero.png) [bad](https://raw.githubusercontent.com/me/demo/main/docs/nope.png) [other](https://github.com/else/repo/blob/main/x.md)\n`,
  });
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "remote", "add", "origin", "git@github.com:me/demo.git"]);
  const report = await evaluate(await loadProject(root), { fetch: okFetch });
  assert.equal(report.checks.find((check) => check.id === "readme.links").detail, "broken: docs/missing.md, https://raw.githubusercontent.com/me/demo/main/docs/nope.png");
});

test("detects common project kinds", async () => {
  const kind = async (files) => (await loadProject(await fixture(files))).kind;
  assert.equal(await kind({ "manifest.json": { manifest_version: 3 } }), "browser-extension");
  assert.equal(await kind({ "package.json": { devDependencies: { electron: "1" }, bin: "x.js" } }), "desktop-app");
  assert.equal(await kind({ "package.json": { bin: "x.js", pi: { extensions: ["a.js"] } } }), "cli");
  assert.equal(await kind({ "package.json": { pi: { extensions: ["a.js"] } } }), "agent-extension");
  assert.equal(await kind({ "package.json": { dependencies: { next: "16" } } }), "web-app");
  assert.equal(await kind({ "Cargo.toml": "", "src/main.rs": "" }), "cli");
  assert.equal(await kind({ "package.json": { dependencies: { next: "16" } }, "showcase.json": { kind: "game" } }), "game");
  assert.equal(await kind({}), "other");
});
