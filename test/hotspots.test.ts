import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { runHotspotReport } from "../src/orchestrator";
import { HotspotReport } from "../src/model";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-react-app");

function basename(p: string): string {
  return path.basename(p);
}

let cached: HotspotReport | undefined;
function report(): HotspotReport {
  if (!cached) cached = runHotspotReport(FIXTURE);
  return cached;
}

test("runHotspotReport: modules match the fixture's known directory layout", () => {
  const names = report()
    .modules.map((m) => m.name)
    .sort();
  assert.deepEqual(names, ["(root)", "components", "cycle", "legacy", "pages", "services", "utils"]);

  const fileCounts = Object.fromEntries(report().modules.map((m) => [m.name, m.fileCount]));
  assert.deepEqual(fileCounts, {
    "(root)": 5,
    pages: 3,
    components: 2,
    cycle: 2,
    utils: 1,
    services: 1,
    legacy: 1,
  });
});

test("runHotspotReport: Header.tsx and helpers.ts are tied at the top with 2 dependents each", () => {
  const top = report().hotspots.filter((h) => h.dependents === Math.max(...report().hotspots.map((x) => x.dependents)));
  const topBasenames = top.map((h) => basename(h.filePath)).sort();
  assert.deepEqual(topBasenames, ["Header.tsx", "helpers.ts"]);
  assert.equal(top[0].dependents, 2);
});

test("runHotspotReport: files with zero dependents (orphans, leaves) are excluded from hotspots", () => {
  const basenames = report().hotspots.map((h) => basename(h.filePath));
  assert.equal(basenames.includes("legacyHelper.js"), false);
  assert.equal(basenames.includes("oldUtil.ts"), false);
  assert.equal(basenames.includes("about.tsx"), false); // an entry point, but nothing imports it
});

test("runHotspotReport: two cycle paths, matching the known circular pairs", () => {
  const cycleBasenames = report()
    .cycles.map((c) => c.files.map(basename).sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(cycleBasenames, [
    ["a.ts", "b.ts"],
    ["Header.tsx", "helpers.ts"],
  ]);
});

test("runHotspotReport: components module coupling is 4 (Ca=3, Ce=1)", () => {
  const components = report().modules.find((m) => m.name === "components");
  assert.ok(components);
  assert.equal(components!.coupling, 4);
});
