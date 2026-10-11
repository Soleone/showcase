// Keeps .claude-plugin/plugin.json on the version release-it just bumped package.json to.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version) throw new Error("usage: node scripts/sync-plugin-version.js <version>");
const file = new URL("../.claude-plugin/plugin.json", import.meta.url);
const text = readFileSync(file, "utf8");
const next = text.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
if (next === text && !text.includes(`"version": "${version}"`)) throw new Error("no version field found in plugin.json");
writeFileSync(file, next);
