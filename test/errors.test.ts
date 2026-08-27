import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runAnalysis, CodeBlueprintError } from "../src/orchestrator";

test("runAnalysis: throws CodeBlueprintError for a nonexistent path", () => {
  assert.throws(() => runAnalysis(path.join(__dirname, "does-not-exist")), CodeBlueprintError);
});

test("runAnalysis: throws CodeBlueprintError when the path is a file, not a directory", () => {
  assert.throws(() => runAnalysis(path.join(__dirname, "..", "package.json")), CodeBlueprintError);
});

test("runAnalysis: throws CodeBlueprintError when the directory has no source files", () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeblueprint-empty-"));
  try {
    assert.throws(() => runAnalysis(emptyDir), CodeBlueprintError);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});
