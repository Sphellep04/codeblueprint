import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import { moduleNameForFile, buildModuleMetrics, ROOT_MODULE_NAME } from "../src/modules";
import { FileModel, FileEdge } from "../src/model";

const ROOT = path.resolve("/project");

test("moduleNameForFile: a file under src/<dir>/ is grouped by that directory", () => {
  assert.equal(moduleNameForFile(path.join(ROOT, "src", "billing", "x.ts"), ROOT), "billing");
});

test("moduleNameForFile: a file directly under src/ buckets into the root module", () => {
  assert.equal(moduleNameForFile(path.join(ROOT, "src", "x.ts"), ROOT), ROOT_MODULE_NAME);
});

test("moduleNameForFile: a top-level directory that isn't 'src' is its own module", () => {
  assert.equal(moduleNameForFile(path.join(ROOT, "pages", "x.ts"), ROOT), "pages");
});

test("moduleNameForFile: a root-level file buckets into the root module", () => {
  assert.equal(moduleNameForFile(path.join(ROOT, "x.ts"), ROOT), ROOT_MODULE_NAME);
});

function file(absolutePath: string, overrides: Partial<FileModel> = {}): FileModel {
  return {
    absolutePath,
    importCount: 0,
    exportCount: 0,
    functionCount: 0,
    classCount: 0,
    componentCount: 0,
    complexityTotal: 0,
    internalDependencies: [],
    isEntryPoint: false,
    ...overrides,
  };
}

test("buildModuleMetrics: coupling, dependencies, and average complexity are computed per module", () => {
  const a = path.join(ROOT, "src", "billing", "a.ts");
  const b = path.join(ROOT, "src", "billing", "b.ts");
  const c = path.join(ROOT, "src", "shared", "c.ts");

  const files: FileModel[] = [
    file(a, { importCount: 2, complexityTotal: 4 }),
    file(b, { importCount: 1, complexityTotal: 2 }),
    file(c, { importCount: 3, complexityTotal: 10 }),
  ];

  const edges: FileEdge[] = [
    { kind: "import", from: a, to: b }, // within billing — not cross-module
    { kind: "import", from: a, to: c }, // billing -> shared: billing Ce+1, shared Ca+1
    { kind: "import", from: b, to: c }, // billing -> shared: billing Ce+1, shared Ca+1
    { kind: "import", from: c, to: a }, // shared -> billing: shared Ce+1, billing Ca+1
  ];

  const modules = buildModuleMetrics(files, edges, ROOT);
  const billing = modules.find((m) => m.name === "billing")!;
  const shared = modules.find((m) => m.name === "shared")!;

  assert.equal(billing.fileCount, 2);
  assert.equal(billing.dependencyCount, 3); // 2 + 1
  assert.equal(billing.complexityAverage, 3); // (4 + 2) / 2
  assert.equal(billing.coupling, 3); // Ce=2 (a->c, b->c) + Ca=1 (c->a)

  assert.equal(shared.fileCount, 1);
  assert.equal(shared.dependencyCount, 3);
  assert.equal(shared.complexityAverage, 10);
  assert.equal(shared.coupling, 3); // Ca=2 (a->c, b->c) + Ce=1 (c->a)
});

test("buildModuleMetrics: an import and a re-export between the same two files counts as one coupling relationship, not two", () => {
  const a = path.join(ROOT, "src", "billing", "a.ts");
  const c = path.join(ROOT, "src", "shared", "c.ts");

  const files: FileModel[] = [file(a), file(c)];
  const edges: FileEdge[] = [
    { kind: "import", from: a, to: c },
    { kind: "reExport", from: a, to: c }, // same file pair, different edge kind — one real relationship
  ];

  const modules = buildModuleMetrics(files, edges, ROOT);
  const billing = modules.find((m) => m.name === "billing")!;
  const shared = modules.find((m) => m.name === "shared")!;

  assert.equal(billing.coupling, 1); // Ce=1, not 2
  assert.equal(shared.coupling, 1); // Ca=1, not 2
});
