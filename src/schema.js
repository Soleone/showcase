import { readFileSync } from "node:fs";

export const schemaUrl = new URL("../schema/showcase.schema.json", import.meta.url);
export const schema = JSON.parse(readFileSync(schemaUrl, "utf8"));

const typeChecks = {
  object: (value) => value !== null && typeof value === "object" && !Array.isArray(value),
  array: Array.isArray,
  string: (value) => typeof value === "string",
  integer: Number.isInteger,
  number: (value) => typeof value === "number" && Number.isFinite(value),
  boolean: (value) => typeof value === "boolean",
};

function isUri(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Validates the JSON Schema subset that showcase.schema.json uses, so the schema file stays the single source of truth.
export function validate(value, node = schema, path = "") {
  const at = path || "(root)";
  if (node.type && !typeChecks[node.type](value)) return [`${at}: expected ${node.type}`];
  if (node.enum && !node.enum.includes(value)) return [`${at}: must be one of ${node.enum.join(", ")}`];

  const errors = [];
  if (typeof value === "string") {
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(`${at}: must not be empty`);
    if (node.maxLength !== undefined && value.length > node.maxLength) errors.push(`${at}: ${value.length} characters, max ${node.maxLength}`);
    if (node.format === "uri" && !isUri(value)) errors.push(`${at}: must be an http(s) URL`);
  }
  if (typeof value === "number") {
    if (node.minimum !== undefined && value < node.minimum) errors.push(`${at}: must be at least ${node.minimum}`);
    if (node.maximum !== undefined && value > node.maximum) errors.push(`${at}: must be at most ${node.maximum}`);
  }
  if (Array.isArray(value) && node.items) {
    value.forEach((item, index) => errors.push(...validate(item, node.items, `${path}[${index}]`)));
  }
  if (typeChecks.object(value)) {
    for (const key of node.required ?? []) {
      if (!(key in value)) errors.push(`${path ? `${path}.` : ""}${key}: required`);
    }
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      const property = node.properties?.[key];
      const pattern = Object.entries(node.patternProperties ?? {}).find(([source]) => new RegExp(source).test(key));
      if (property) errors.push(...validate(child, property, childPath));
      else if (pattern) errors.push(...validate(child, pattern[1], childPath));
      else if (node.additionalProperties === false) errors.push(`${childPath}: unknown field`);
    }
  }
  return errors;
}
