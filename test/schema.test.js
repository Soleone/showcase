import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../src/schema.js";

test("accepts a minimal manifest", () => {
  assert.deepEqual(validate({ title: "Demo", pitch: "Does a thing.", description: "Does it well.", kind: "cli" }), []);
});

test("reports missing, unknown and malformed fields", () => {
  const errors = validate({ title: "", kind: "spaceship", live: "ftp://example.com", year: 1800, media: { hero: "a.png", gif: "b.gif" } });
  assert.deepEqual(errors.sort(), [
    "description: required",
    "kind: must be one of web-app, local-web-app, cli, library, browser-extension, desktop-app, agent-extension, game, service, theme, other",
    "live: must be an http(s) URL",
    "media.gif: unknown field",
    "pitch: required",
    "title: must not be empty",
    "year: must be at least 1990",
  ]);
});

test("description is required and capped", () => {
  const base = { title: "Demo", pitch: "Does a thing.", kind: "cli" };
  assert.deepEqual(validate(base), ["description: required"]);
  assert.deepEqual(validate({ ...base, description: "Goes further than the pitch." }), []);
  assert.deepEqual(validate({ ...base, description: "x".repeat(241) }), ["description: 241 characters, max 240"]);
  assert.deepEqual(validate({ ...base, description: "" }), ["description: must not be empty"]);
});

test("allows x- extension fields", () => {
  assert.deepEqual(validate({ title: "Demo", pitch: "Does a thing.", description: "Does it well.", kind: "cli", "x-portfolio": { anything: true } }), []);
});

test("checks array items", () => {
  assert.deepEqual(validate({ title: "Demo", pitch: "Does a thing.", description: "Does it well.", kind: "cli", tech: ["Node", 3] }), ["tech[1]: expected string"]);
});

test("supports nullable types for the portfolio config", async () => {
  const { portfolioSchema } = await import("../src/schema.js");
  assert.deepEqual(validate({ projects: [{ id: "a", title: null, path: null, repo: null, priority: null }] }, portfolioSchema), []);
  assert.deepEqual(validate({ projects: [{ id: "a", path: 3 }] }, portfolioSchema), ["projects[0].path: expected string or null"]);
});

test("demo.externals needs a seam and a stand-in for each external", () => {
  const manifest = (externals) => ({ title: "Demo", pitch: "Does a thing.", description: "Does it well.", kind: "cli", demo: { externals } });
  assert.deepEqual(validate(manifest([{ name: "LLM", type: "model", seam: "piCommand", standIn: "canned" }])), []);
  assert.deepEqual(validate(manifest([])), []);
  assert.deepEqual(validate(manifest([{ name: "LLM", type: "model", standIn: "magic" }])).sort(), [
    "demo.externals[0].seam: required",
    "demo.externals[0].standIn: must be one of canned, replay, simulated, bring-your-own, real, omitted",
  ]);
});

test("brand takes images and #rrggbb colors", () => {
  const base = { title: "T", pitch: "P", description: "D", kind: "web-app" };
  assert.deepEqual(validate({ ...base, brand: { icon: "icon.svg", logo: "logo.svg", wordmark: "word.svg", colors: ["#5b8DEF", "#112233"] } }), []);
  assert.deepEqual(validate({ ...base, brand: { colors: ["#5b8def", "blue"], font: "Inter" } }), ["brand.colors[1]: must match ^#[0-9a-fA-F]{6}$", "brand.font: unknown field"]);
});
