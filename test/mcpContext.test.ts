import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { loadMcpContext, CodeBlueprintError } from "../src/orchestrator";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-react-app");

function basename(p: string): string {
  return path.basename(p);
}

let cached: ReturnType<typeof loadMcpContext> | undefined;
function ctx(): ReturnType<typeof loadMcpContext> {
  if (!cached) cached = loadMcpContext(FIXTURE);
  return cached;
}

test("loadMcpContext.getSummary: matches the fixture's already-proven metric values", () => {
  const summary = ctx().getSummary();
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

test("loadMcpContext.getFileSummary: returns the right metrics for a known file", () => {
  const file = ctx().getFileSummary("src/components/Header.tsx");
  assert.equal(basename(file.absolutePath), "Header.tsx");
  assert.equal(file.importCount, 1);
  assert.equal(file.componentCount, 1);
});

test("loadMcpContext.getFileSummary: throws CodeBlueprintError for an unknown file", () => {
  assert.throws(() => ctx().getFileSummary("src/does/not/exist.ts"), CodeBlueprintError);
});

test("loadMcpContext.getDependencies: Header.tsx depends on helpers.ts and is depended on by both App.tsx and helpers.ts (the documented cycle)", () => {
  const deps = ctx().getDependencies("src/components/Header.tsx");
  assert.deepEqual(deps.dependsOn.map(basename), ["helpers.ts"]);
  assert.deepEqual(deps.dependents.map(basename).sort(), ["App.tsx", "helpers.ts"]);
});

test("loadMcpContext.getDependencies: throws CodeBlueprintError for an unknown file", () => {
  assert.throws(() => ctx().getDependencies("src/does/not/exist.ts"), CodeBlueprintError);
});

test("loadMcpContext.findSymbol: case-insensitive substring match finds Header and describeHeader", () => {
  const matches = ctx()
    .findSymbol("header")
    .map((s) => s.name)
    .sort();
  assert.deepEqual(matches, ["Header", "describeHeader"]);
});

test("loadMcpContext.findSymbol: no match returns an empty array, not an error", () => {
  assert.deepEqual(ctx().findSymbol("doesNotExistAnywhere"), []);
});

test("loadMcpContext.getImpact: matches impact.test.ts's already-proven values for helpers.ts", () => {
  const report = ctx().getImpact("src/utils/helpers.ts");
  const basenames = report.impactedFiles.map(basename).sort();
  assert.deepEqual(basenames, ["App.tsx", "Header.tsx", "about.tsx", "index.tsx"]);
  assert.equal(report.impactedRoutes.length, 1);
});

test("loadMcpContext.getImpact: throws CodeBlueprintError for an unknown file", () => {
  assert.throws(() => ctx().getImpact("src/does/not/exist.ts"), CodeBlueprintError);
});

test("loadMcpContext.getHotspots: matches hotspots.test.ts's already-proven module layout", () => {
  const names = ctx()
    .getHotspots()
    .modules.map((m) => m.name)
    .sort();
  assert.deepEqual(names, ["(root)", "components", "cycle", "legacy", "pages", "services", "utils"]);
});
