import { test } from "node:test";
import * as assert from "node:assert/strict";
import { formatHotspotReport } from "../src/report";
import { HotspotReport } from "../src/model";

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
