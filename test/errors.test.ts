import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runAnalysis, CodeAtlasError } from "../src/orchestrator";

test("runAnalysis: throws CodeAtlasError for a nonexistent path", () => {
  assert.throws(() => runAnalysis(path.join(__dirname, "does-not-exist")), CodeAtlasError);
});

test("runAnalysis: throws CodeAtlasError when the path is a file, not a directory", () => {
  assert.throws(() => runAnalysis(path.join(__dirname, "..", "package.json")), CodeAtlasError);
});

test("runAnalysis: throws CodeAtlasError when the directory has no source files", () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeatlas-empty-"));
  try {
    assert.throws(() => runAnalysis(emptyDir), CodeAtlasError);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});
