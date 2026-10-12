import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checks } from "../src/checks.js";
import { topics } from "../src/guide.js";
import { exists } from "../src/project.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const bin = path.join(root, "bin/showcase.js");
const run = (...args) => promisify(execFile)(process.execPath, [bin, ...args]).catch((error) => error);
const relativeLinks = (text) => [...text.matchAll(/\]\((?!https?:|#|\/)([^)\s]+)\)/g)].map((match) => match[1]);

test("guide prints the index with every topic listed", async () => {
  const { stdout } = await run("guide");
  assert.match(stdout, /^# showcase guide/);
  for (const topic of topics) assert.match(stdout, new RegExp(`- \`${topic.name}\`: `));
  assert.doesNotMatch(stdout, /\{\{topics\}\}/);
});

test("guide prints each topic", async () => {
  for (const topic of topics) {
    const { stdout, code } = await run("guide", topic.name);
    assert.equal(code, undefined, topic.name);
    assert.match(stdout, /^# /, topic.name);
  }
});

test("guide rejects an unknown topic and names the real ones", async () => {
  const { stderr, code } = await run("guide", "nope");
  assert.equal(code, 2);
  assert.match(stderr, /No guide topic 'nope'.*pitch.*portfolio/);
});

test("printed links are absolute and point at real files", async () => {
  const { stdout } = await run("guide", "manifest");
  assert.match(stdout, new RegExp(`\\]\\(${path.join(root, "schema", "showcase.schema.json").replaceAll("\\", "\\\\")}\\)`));
  for (const topic of topics) {
    const file = path.join(root, topic.file);
    for (const link of relativeLinks(await readFile(file, "utf8"))) {
      assert.ok(await exists(path.resolve(path.dirname(file), link.split("#")[0])), `${topic.file} links to missing ${link}`);
    }
  }
});

test("every failing check points at a real topic", () => {
  const names = new Set(topics.map((topic) => topic.name));
  for (const check of checks) {
    assert.ok(check.guide, `${check.id} names no topic`);
    const named = typeof check.guide === "function" ? [check.guide({ kind: "cli" }), check.guide({ kind: "web-app" })] : [check.guide];
    for (const guide of named) assert.ok(names.has(guide), `${check.id} names unknown topic ${guide}`);
  }
});

test("every guide file is a registered topic and the skill holds no instructions of its own", async () => {
  const registered = new Set(topics.map((topic) => topic.file));
  for (const name of await readdir(path.join(root, "docs/guide"))) {
    if (name !== "index.md") assert.ok(registered.has(`docs/guide/${name}`), `docs/guide/${name} is not in topics`);
  }
  const skill = await readFile(path.join(root, "skills/showcase/SKILL.md"), "utf8");
  assert.match(skill, /showcase guide/);
  assert.ok(skill.split("\n").length < 20, "the skill should only point at `showcase guide`");
});

test("check prints the topic beside each next step", async () => {
  const { stdout } = await run("check", path.join(root, "demo/projects/old-library"), "--offline");
  assert.match(stdout, /\(showcase guide pitch\)/);
});
