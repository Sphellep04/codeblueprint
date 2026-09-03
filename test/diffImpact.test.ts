import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { runDiffImpactAnalysis } from "../src/orchestrator";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-react-app");

function basename(p: string): string {
  return path.basename(p);
}

// changedFiles is passed explicitly throughout (bypassing getChangedFiles/git entirely) so these
// stay hermetic and deterministic — see orchestrator.ts's runDiffImpactAnalysis comment for why the
// explicit-array form exists.

test("runDiffImpactAnalysis: a single changed file matches runImpactAnalysis's result for that file", () => {
  const report = runDiffImpactAnalysis(FIXTURE, ["src/utils/helpers.ts"]);
  const basenames = report.impactedFiles.map(basename).sort();
  assert.deepEqual(basenames, ["App.tsx", "Header.tsx", "about.tsx", "index.tsx"]);
  assert.equal(report.impactedRoutes.length, 1);
  assert.equal(basename(report.impactedRoutes[0]), "about.tsx");
});

test("runDiffImpactAnalysis: two independent changed files union their impact sets, deduped", () => {
  // helpers.ts's impact includes App.tsx/Header.tsx/about.tsx/index.tsx; userService.ts's impact is
  // exactly index.tsx (already-overlapping) — the union must not double-count index.tsx.
  const report = runDiffImpactAnalysis(FIXTURE, ["src/utils/helpers.ts", "src/services/userService.ts"]);
  const basenames = report.impactedFiles.map(basename).sort();
  assert.deepEqual(basenames, ["App.tsx", "Header.tsx", "about.tsx", "index.tsx"]);
});

test("runDiffImpactAnalysis: perFile reports each changed file's own (unfiltered-by-union) impact count", () => {
  const report = runDiffImpactAnalysis(FIXTURE, ["src/utils/helpers.ts", "src/services/userService.ts"]);
  const byBasename = new Map(report.perFile.map((p) => [basename(p.file), p.impactedCount]));
  assert.equal(byBasename.get("helpers.ts"), 4);
  assert.equal(byBasename.get("userService.ts"), 1);
});

test("runDiffImpactAnalysis: a changed file that's also impacted by another changed file is excluded from impactedFiles", () => {
  // Header.tsx imports helpers.ts (direct dependent). Both changed at once: Header.tsx itself must
  // not appear in impactedFiles just because helpers.ts's walk would otherwise include it — the
  // same "targetFile never appears in its own impactedFiles" rule generalized to a changed set.
  const report = runDiffImpactAnalysis(FIXTURE, ["src/utils/helpers.ts", "src/components/Header.tsx"]);
  assert.equal(report.impactedFiles.map(basename).includes("Header.tsx"), false);
});

test("runDiffImpactAnalysis: no changed files produces an empty report, not an error", () => {
  const report = runDiffImpactAnalysis(FIXTURE, []);
  assert.deepEqual(report.changedFiles, []);
  assert.deepEqual(report.impactedFiles, []);
  assert.deepEqual(report.perFile, []);
});

test("runDiffImpactAnalysis: a changed path that doesn't match any scanned file is dropped, not thrown", () => {
  const report = runDiffImpactAnalysis(FIXTURE, ["src/utils/helpers.ts", "src/does/not/exist.ts"]);
  assert.equal(report.changedFiles.length, 1);
  assert.equal(basename(report.changedFiles[0]), "helpers.ts");
});
