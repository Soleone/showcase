import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../src/schema.js";

test("accepts a minimal manifest", () => {
  assert.deepEqual(validate({ title: "Demo", pitch: "Does a thing.", kind: "cli" }), []);
});

test("reports missing, unknown and malformed fields", () => {
  const errors = validate({ title: "", kind: "spaceship", live: "ftp://example.com", year: 1800, media: { hero: "a.png", gif: "b.gif" } });
  assert.deepEqual(errors.sort(), [
    "kind: must be one of web-app, local-web-app, cli, library, browser-extension, desktop-app, agent-extension, game, service, other",
    "live: must be an http(s) URL",
    "media.gif: unknown field",
    "pitch: required",
    "title: must not be empty",
    "year: must be at least 1990",
  ]);
});

test("allows x- extension fields", () => {
  assert.deepEqual(validate({ title: "Demo", pitch: "Does a thing.", kind: "cli", "x-portfolio": { anything: true } }), []);
});

test("checks array items", () => {
  assert.deepEqual(validate({ title: "Demo", pitch: "Does a thing.", kind: "cli", tech: ["Node", 3] }), ["tech[1]: expected string"]);
});

test("supports nullable types for the portfolio config", async () => {
  const { portfolioSchema } = await import("../src/schema.js");
  assert.deepEqual(validate({ projects: [{ id: "a", title: null, path: null, repo: null, priority: null }] }, portfolioSchema), []);
  assert.deepEqual(validate({ projects: [{ id: "a", path: 3 }] }, portfolioSchema), ["projects[0].path: expected string or null"]);
});
