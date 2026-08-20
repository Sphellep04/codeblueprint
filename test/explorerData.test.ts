import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { runExplorerData } from "../src/orchestrator";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-react-app");

test("runExplorerData: rootDir/projectName and a complete file list, including orphans", () => {
  const data = runExplorerData(FIXTURE);

  assert.equal(data.projectName, "basic-react-app");
  assert.equal(path.resolve(data.rootDir), path.resolve(FIXTURE));
  assert.equal(data.files.length, 15);

  const basenames = data.files.map((f) => path.basename(f.absolutePath));
  assert.ok(basenames.includes("legacyHelper.js"), "orphan file should still appear in the file list");
  assert.ok(basenames.includes("oldUtil.ts"), "orphan file should still appear in the file list");
});

test("runExplorerData: edges match the known import and re-export relationships", () => {
  const data = runExplorerData(FIXTURE);

  const bToA = data.edges.find((e) => path.basename(e.from) === "b.ts" && path.basename(e.to) === "a.ts");
  const appToHeader = data.edges.find((e) => path.basename(e.from) === "App.tsx" && path.basename(e.to) === "Header.tsx");
  assert.equal(bToA?.kind, "reExport");
  assert.equal(appToHeader?.kind, "import");

  // legacyHelper.js is CommonJS-only and contributes no edges (documented Phase 1 limitation).
  const anyEdgeInvolvingLegacyHelper = data.edges.some((e) => path.basename(e.from) === "legacyHelper.js" || path.basename(e.to) === "legacyHelper.js");
  assert.equal(anyEdgeInvolvingLegacyHelper, false);
});
