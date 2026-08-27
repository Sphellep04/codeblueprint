import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { runAnalysis, runGraphAnalysis, runImpactAnalysis } from "../src/orchestrator";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-monorepo");

function basename(p: string): string {
  return path.basename(p);
}

test("basic-monorepo fixture: metrics match hand-verified expectations", () => {
  const summary = runAnalysis(FIXTURE);

  assert.equal(summary.projectName, "basic-monorepo");
  assert.equal(summary.files, 3);
  assert.equal(summary.components, 0);
  assert.equal(summary.functions, 2);
  assert.equal(summary.classes, 0);
  assert.equal(summary.imports, 1);
  assert.equal(summary.exports, 3);
  assert.equal(summary.circularDeps, 0);
});

test("basic-monorepo fixture: packages/app/src/index.ts is NOT an orphan (regression test for computeEntryPoints packageRoots)", () => {
  // Nothing imports packages/app/src/index.ts -- it's a leaf app, not a library. Before the
  // computeEntryPoints packageRoots fix, only the workspace root's own package.json/index files
  // were recognized as entry points, so this file was misreported as an orphan. This assertion
  // fails against pre-fix code and passes once each workspace package's own package.json "main"
  // is recognized as an entry point.
  const summary = runAnalysis(FIXTURE);
  assert.equal(summary.orphanFiles, 0);
  assert.deepEqual(summary.orphanFilePaths, []);
});

test("basic-monorepo fixture: cross-package import is a real internal edge (app -> lib)", () => {
  const graph = runGraphAnalysis(FIXTURE);
  const appToLib = graph.files.find((e) => basename(e.from) === "index.ts" && e.from.includes("/app/") && basename(e.to) === "index.ts" && e.to.includes("/lib/"));
  assert.ok(appToLib, "expected an import edge from packages/app/src/index.ts to packages/lib/src/index.ts");
  assert.equal(appToLib?.kind, "import");
});

test("basic-monorepo fixture: lib's barrel re-export (index.ts -> greet.ts) is a reExport edge", () => {
  const graph = runGraphAnalysis(FIXTURE);
  const barrel = graph.files.find((e) => basename(e.from) === "index.ts" && e.from.includes("/lib/") && basename(e.to) === "greet.ts");
  assert.ok(barrel, "expected a reExport edge from packages/lib/src/index.ts to packages/lib/src/greet.ts");
  assert.equal(barrel?.kind, "reExport");
});

test("basic-monorepo fixture: run() calls greet() across the package boundary (usage edge)", () => {
  const graph = runGraphAnalysis(FIXTURE);
  const run = graph.symbols.find((s) => s.name === "run");
  const greet = graph.symbols.find((s) => s.name === "greet");
  assert.ok(run && greet, "expected both run and greet symbols to be registered");
  const usage = graph.usages.find((u) => u.from === run!.id && u.to === greet!.id);
  assert.ok(usage, "expected a usage edge from run to greet");
  assert.equal(usage?.kind, "calls");
});

test("basic-monorepo fixture: impact of packages/lib/src/greet.ts crosses the package boundary into app", () => {
  const report = runImpactAnalysis(FIXTURE, "packages/lib/src/greet.ts");
  const basenames = report.impactedFiles.map((p) => `${p.includes("/app/") ? "app" : "lib"}/${basename(p)}`).sort();
  assert.deepEqual(basenames, ["app/index.ts", "lib/index.ts"]);
});
