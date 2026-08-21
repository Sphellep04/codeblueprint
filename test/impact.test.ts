import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { runImpactAnalysis, CodeAtlasError } from "../src/orchestrator";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-react-app");

function basename(p: string): string {
  return path.basename(p);
}

test("runImpactAnalysis: helpers.ts's transitive impact includes App.tsx, Header.tsx, and index.tsx (cycle-safe)", () => {
  const report = runImpactAnalysis(FIXTURE, "src/utils/helpers.ts");
  const basenames = report.impactedFiles.map(basename).sort();
  // Header.tsx imports helpers.ts (direct); helpers.ts also imports Header.tsx (the documented
  // cycle) — that back-edge must NOT cause helpers.ts to reappear in its own impact set.
  assert.deepEqual(basenames, ["App.tsx", "Header.tsx", "about.tsx", "index.tsx"]);
  assert.equal(basenames.includes("helpers.ts"), false);
});

test("runImpactAnalysis: helpers.ts's impact includes pages/about.tsx as an affected route", () => {
  const report = runImpactAnalysis(FIXTURE, "src/utils/helpers.ts");
  assert.equal(report.impactedRoutes.length, 1);
  assert.equal(basename(report.impactedRoutes[0]), "about.tsx");
});

test("runImpactAnalysis: cycle/a.ts's impact is exactly cycle/b.ts (cycle-safe, not itself)", () => {
  const report = runImpactAnalysis(FIXTURE, "src/cycle/a.ts");
  assert.deepEqual(report.impactedFiles.map(basename), ["b.ts"]);
  assert.deepEqual(report.impactedRoutes, []);
});

test("runImpactAnalysis: userService.ts's impact is exactly index.tsx", () => {
  const report = runImpactAnalysis(FIXTURE, "src/services/userService.ts");
  assert.deepEqual(report.impactedFiles.map(basename), ["index.tsx"]);
});

test("runImpactAnalysis: a route file (nothing imports pages/*) has zero impact", () => {
  const report = runImpactAnalysis(FIXTURE, "pages/index.tsx");
  assert.deepEqual(report.impactedFiles, []);
  assert.deepEqual(report.impactedRoutes, []);
});

test("runImpactAnalysis: an orphan file has zero impact", () => {
  const report = runImpactAnalysis(FIXTURE, "src/legacy/oldUtil.ts");
  assert.deepEqual(report.impactedFiles, []);
});

test("runImpactAnalysis: relative and absolute target paths resolve to the same result", () => {
  const relative = runImpactAnalysis(FIXTURE, "src/utils/helpers.ts");
  const absolute = runImpactAnalysis(FIXTURE, path.join(FIXTURE, "src", "utils", "helpers.ts"));
  assert.deepEqual(relative.impactedFiles.sort(), absolute.impactedFiles.sort());
  assert.equal(relative.targetFile, absolute.targetFile);
});

test("runImpactAnalysis: a target that doesn't match any scanned file throws CodeAtlasError", () => {
  assert.throws(() => runImpactAnalysis(FIXTURE, "src/does/not/exist.ts"), CodeAtlasError);
});

test("runImpactAnalysis: a mismatched-case path still resolves (case-insensitive fallback)", () => {
  // Windows/macOS filesystems are case-insensitive, so a user can legitimately type a path with
  // different casing than what ts-morph reports on disk — this must not throw.
  const report = runImpactAnalysis(FIXTURE, "src/Utils/Helpers.ts");
  assert.equal(basename(report.targetFile), "helpers.ts");
  assert.equal(report.impactedFiles.length, 4);
});

test("runImpactAnalysis: an absolute path with '..' segments is normalized before matching", () => {
  const withDotDot = path.join(FIXTURE, "src", "utils", "..", "utils", "helpers.ts");
  const report = runImpactAnalysis(FIXTURE, withDotDot);
  assert.equal(basename(report.targetFile), "helpers.ts");
  assert.equal(report.impactedFiles.length, 4);
});
