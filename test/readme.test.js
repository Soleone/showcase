import assert from "node:assert/strict";
import test from "node:test";
import { parseReadme } from "../src/readme.js";

test("finds the title, lead, hero position and links", () => {
  const readme = parseReadme(`# Tool

[![CI](https://img.shields.io/ci.svg)](https://ci.example.com) ![Build](https://github.com/me/tool/actions/workflows/ci.yml/badge.svg)

A small tool that does one thing well.

<img src="docs/hero.png" width="600">

## Usage

See [the docs](docs/usage.md).
`);
  assert.equal(readme.title, "Tool");
  assert.equal(readme.lead, "A small tool that does one thing well.");
  assert.deepEqual(readme.media.map((item) => item.src), ["docs/hero.png"], "badges are not media");
  assert.ok(readme.media[0].line < readme.firstSectionLine);
  assert.deepEqual(readme.links.map((link) => link.href), ["https://ci.example.com", "docs/usage.md"]);
});

test("a list ends the lead paragraph", () => {
  assert.equal(parseReadme("# Ext\n\nAdds buttons:\n- one\n- two\n").lead, "Adds buttons:");
});

test("ignores code blocks and comments when counting words and media", () => {
  const readme = parseReadme("# T\n\n<!-- ![hidden](x.png) -->\nOne two three.\n\n```md\n![not media](y.png)\nlots of words here\n```\n");
  assert.equal(readme.words, 4);
  assert.equal(readme.codeBlocks, 1);
  assert.deepEqual(readme.media, []);
});

test("treats a bare GitHub attachment line as media", () => {
  const readme = parseReadme("# T\n\nPitch.\n\nhttps://github.com/user-attachments/assets/abc-123\n");
  assert.deepEqual(readme.media.map((item) => item.src), ["https://github.com/user-attachments/assets/abc-123"]);
});
