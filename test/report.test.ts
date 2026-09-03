import { test } from "node:test";
import * as assert from "node:assert/strict";
import { formatHotspotReport, formatImpactReport, formatDiffImpactReport } from "../src/report";
import { HotspotReport, ImpactReport, DiffImpactReport } from "../src/model";

const SAMPLE: HotspotReport = {
  rootDir: "/project",
  projectName: "sample",
  hotspots: [{ filePath: "/project/src/auth.ts", dependents: 5 }],
  cycles: [{ files: ["/project/src/a.ts", "/project/src/b.ts"] }],
  modules: [{ name: "auth", fileCount: 2, dependencyCount: 3, coupling: 4, complexityAverage: 2.5 }],
};

test("formatHotspotReport: includes all three sections with the right content", () => {
  const text = formatHotspotReport(SAMPLE);
  assert.match(text, /Most connected files/);
  assert.match(text, /src\/auth\.ts\s+5 dependents/);
  assert.match(text, /Circular dependencies/);
  assert.match(text, /src\/a\.ts → src\/b\.ts → src\/a\.ts/);
  assert.match(text, /Modules/);
  assert.match(text, /Module: auth/);
  assert.match(text, /Coupling.*\(4\)/);
  assert.match(text, /Complexity.*\(2\.5\)/);
  assert.match(text, /Dependencies.*\(3\)/);
});

test("formatHotspotReport: empty hotspots/cycles render '(none)' instead of an empty section", () => {
  const text = formatHotspotReport({ ...SAMPLE, hotspots: [], cycles: [] });
  const lines = text.split("\n");
  const hotspotsIdx = lines.findIndex((l) => l === "Most connected files");
  const cyclesIdx = lines.findIndex((l) => l === "Circular dependencies");
  assert.equal(lines[hotspotsIdx + 1], "  (none)");
  assert.equal(lines[cyclesIdx + 1], "  (none)");
});

const IMPACT_SAMPLE: ImpactReport = {
  rootDir: "/project",
  projectName: "sample",
  targetFile: "/project/src/auth.ts",
  impactedFiles: ["/project/src/navbar.tsx", "/project/src/dashboard.tsx"],
  impactedRoutes: ["/project/pages/settings.tsx"],
};

test("formatImpactReport: includes the target, impact count, file list, and route count", () => {
  const text = formatImpactReport(IMPACT_SAMPLE);
  assert.match(text, /Target: src\/auth\.ts/);
  assert.match(text, /Potential impact: 2 files/);
  assert.match(text, /src\/navbar\.tsx/);
  assert.match(text, /src\/dashboard\.tsx/);
  assert.match(text, /1 route may be affected/);
  assert.match(text, /pages\/settings\.tsx/);
});

test("formatImpactReport: singular wording for exactly one impacted file", () => {
  const text = formatImpactReport({ ...IMPACT_SAMPLE, impactedFiles: ["/project/src/navbar.tsx"] });
  assert.match(text, /Potential impact: 1 file\b/);
});

test("formatImpactReport: zero impact renders a clear empty message instead of an empty list", () => {
  const text = formatImpactReport({ ...IMPACT_SAMPLE, impactedFiles: [], impactedRoutes: [] });
  assert.match(text, /Potential impact: 0 files/);
  assert.match(text, /\(no files depend on this one\)/);
  assert.match(text, /0 routes may be affected/);
});

const DIFF_IMPACT_SAMPLE: DiffImpactReport = {
  rootDir: "/project",
  projectName: "sample",
  changedFiles: ["/project/src/auth.ts", "/project/src/db.ts"],
  impactedFiles: ["/project/src/navbar.tsx", "/project/src/dashboard.tsx"],
  impactedRoutes: ["/project/pages/settings.tsx"],
  perFile: [
    { file: "/project/src/auth.ts", impactedCount: 2 },
    { file: "/project/src/db.ts", impactedCount: 1 },
  ],
};

test("formatDiffImpactReport: includes the changed-file breakdown, combined impact, and route count", () => {
  const text = formatDiffImpactReport(DIFF_IMPACT_SAMPLE);
  assert.match(text, /Changed: 2 files/);
  assert.match(text, /src\/auth\.ts \(2 impacted\)/);
  assert.match(text, /src\/db\.ts \(1 impacted\)/);
  assert.match(text, /Combined potential impact: 2 files/);
  assert.match(text, /src\/navbar\.tsx/);
  assert.match(text, /src\/dashboard\.tsx/);
  assert.match(text, /1 route may be affected/);
  assert.match(text, /pages\/settings\.tsx/);
});

test("formatDiffImpactReport: singular wording for exactly one changed file", () => {
  const text = formatDiffImpactReport({ ...DIFF_IMPACT_SAMPLE, changedFiles: ["/project/src/auth.ts"], perFile: [DIFF_IMPACT_SAMPLE.perFile[0]] });
  assert.match(text, /Changed: 1 file\b/);
});

test("formatDiffImpactReport: no changed files renders a clear message and skips every other section", () => {
  const text = formatDiffImpactReport({ ...DIFF_IMPACT_SAMPLE, changedFiles: [], impactedFiles: [], impactedRoutes: [], perFile: [] });
  assert.match(text, /No changed files detected \(clean working tree, or not a git repository\)\./);
  assert.doesNotMatch(text, /Combined potential impact/);
});

test("formatDiffImpactReport: zero combined impact renders a clear empty message instead of an empty list", () => {
  const text = formatDiffImpactReport({ ...DIFF_IMPACT_SAMPLE, impactedFiles: [], impactedRoutes: [] });
  assert.match(text, /Combined potential impact: 0 files/);
  assert.match(text, /\(nothing else depends on these files\)/);
  assert.match(text, /0 routes may be affected/);
});
