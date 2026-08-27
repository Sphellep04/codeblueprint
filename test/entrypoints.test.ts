import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
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

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

test("computeEntryPoints: without packageRoots, a sibling package's own index file is NOT recognized (default-parameter baseline)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codeblueprint-entrypoints-"));
  const rootAbs = path.resolve(dir);
  const appSrcDir = path.join(rootAbs, "packages", "app", "src");
  fs.mkdirSync(appSrcDir, { recursive: true });
  const appIndex = toPosix(path.join(appSrcDir, "index.ts"));
  fs.writeFileSync(appIndex, "export {};\n");

  const entryPoints = computeEntryPoints(rootAbs, [appIndex]);
  assert.equal(entryPoints.has(appIndex), false);
});

test("computeEntryPoints: with packageRoots, each workspace package's own index file is recognized as an entry point", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codeblueprint-entrypoints-"));
  const rootAbs = path.resolve(dir);
  const appRoot = path.join(rootAbs, "packages", "app");
  const libRoot = path.join(rootAbs, "packages", "lib");
  fs.mkdirSync(path.join(appRoot, "src"), { recursive: true });
  fs.mkdirSync(path.join(libRoot, "src"), { recursive: true });
  const appIndex = toPosix(path.join(appRoot, "src", "index.ts"));
  const libIndex = toPosix(path.join(libRoot, "src", "index.ts"));
  fs.writeFileSync(appIndex, "export {};\n");
  fs.writeFileSync(libIndex, "export {};\n");

  const entryPoints = computeEntryPoints(rootAbs, [appIndex, libIndex], [rootAbs, appRoot, libRoot]);
  assert.ok(entryPoints.has(appIndex));
  assert.ok(entryPoints.has(libIndex));
});

test("computeEntryPoints: a config file directly under a workspace package root is recognized only when packageRoots includes that package", () => {
  const files = [p("packages", "app", "vite.config.ts")];
  assert.equal(computeEntryPoints(ROOT, files).has(p("packages", "app", "vite.config.ts")), false);

  const withPackageRoots = computeEntryPoints(ROOT, files, [ROOT, p("packages", "app")]);
  assert.ok(withPackageRoots.has(p("packages", "app", "vite.config.ts")));
});
