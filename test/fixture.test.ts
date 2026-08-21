import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { runAnalysis } from "../src/orchestrator";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-react-app");

test("basic-react-app fixture: metrics match hand-verified expectations", () => {
  const summary = runAnalysis(FIXTURE);

  assert.equal(summary.projectName, "basic-react-app");
  assert.equal(summary.files, 15);
  assert.equal(summary.components, 8);
  assert.equal(summary.functions, 18);
  assert.equal(summary.classes, 2);
  assert.equal(summary.imports, 14);
  assert.equal(summary.exports, 18);
  assert.equal(summary.circularDeps, 2);
  assert.equal(summary.orphanFiles, 2);
});

test("basic-react-app fixture: orphans are exactly the unreferenced and CommonJS-only files", () => {
  const summary = runAnalysis(FIXTURE);
  const orphanBasenames = summary.orphanFilePaths.map((p) => path.basename(p)).sort();
  assert.deepEqual(orphanBasenames, ["legacyHelper.js", "oldUtil.ts"]);
});

test("basic-react-app fixture: cycles are Header<->helpers and the barrel-style cycle/a<->cycle/b pair", () => {
  const summary = runAnalysis(FIXTURE);
  const cycleBasenames = summary.cycles.map((c) => c.files.map((f) => path.basename(f)).sort()).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(cycleBasenames, [
    ["a.ts", "b.ts"],
    ["Header.tsx", "helpers.ts"],
  ]);
});

test("basic-react-app fixture: pages/*, tsconfig path alias, and memo/anonymous-export components are not orphaned", () => {
  const summary = runAnalysis(FIXTURE);
  const orphanBasenames = new Set(summary.orphanFilePaths.map((p) => path.basename(p)));
  for (const shouldNotBeOrphan of ["index.tsx", "about.tsx", "_app.tsx", "App.tsx", "MemoBadge.tsx", "AnonComponent.tsx"]) {
    assert.equal(orphanBasenames.has(shouldNotBeOrphan), false, `${shouldNotBeOrphan} should not be an orphan`);
  }
});
