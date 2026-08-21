import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { computeRoutes, computeEntryPoints } from "../src/entrypoints";

const ROOT = path.resolve("/project");

function p(...segments: string[]): string {
  return path.join(ROOT, ...segments).replace(/\\/g, "/");
}

test("computeRoutes: includes every file under pages/", () => {
  const files = [p("pages", "index.tsx"), p("pages", "about.tsx"), p("pages", "blog", "[slug].tsx")];
  assert.deepEqual(computeRoutes(ROOT, files), new Set(files));
});

test("computeRoutes: includes app/ files matching known route conventions, excludes others", () => {
  const files = [p("app", "page.tsx"), p("app", "dashboard", "layout.tsx"), p("app", "utils.ts")];
  assert.deepEqual(computeRoutes(ROOT, files), new Set([p("app", "page.tsx"), p("app", "dashboard", "layout.tsx")]));
});

test("computeRoutes: excludes test files, config files, and plain src/ files that computeEntryPoints includes", () => {
  const files = [p("src", "utils.test.ts"), p("vite.config.ts"), p("src", "helpers.ts")];
  assert.deepEqual(computeRoutes(ROOT, files), new Set());

  // Sanity check: these same files ARE entry points, just not routes — computeRoutes is a subset.
  const entryPoints = computeEntryPoints(ROOT, files);
  assert.ok(entryPoints.has(p("src", "utils.test.ts")));
  assert.ok(entryPoints.has(p("vite.config.ts")));
});

test("computeRoutes: a plain file outside pages/ or app/ is not a route", () => {
  assert.deepEqual(computeRoutes(ROOT, [p("src", "index.ts")]), new Set());
});
