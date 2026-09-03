import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { getChangedFiles } from "../src/git";

/** A real, hermetic git repo in a temp dir — getChangedFiles shells out to the actual git binary,
 * so faking its output isn't meaningful; this exercises the real thing without depending on this
 * project's own repo state (which is clean and therefore a poor test fixture on its own). */
function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-git-test-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "committed.ts"), "export const a = 1;\n");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "nested.ts"), "export const b = 2;\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: dir });
  return dir;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

test("getChangedFiles: a clean working tree returns an empty array", () => {
  const dir = makeRepo();
  assert.deepEqual(getChangedFiles(dir), []);
});

test("getChangedFiles: a modified tracked file is reported with its absolute path", () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, "committed.ts"), "export const a = 2;\n");
  const changed = getChangedFiles(dir).map(toPosix);
  assert.deepEqual(changed, [toPosix(path.join(dir, "committed.ts"))]);
});

test("getChangedFiles: a new untracked file is reported alongside a modified one", () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, "committed.ts"), "export const a = 2;\n");
  fs.writeFileSync(path.join(dir, "new.ts"), "export const c = 3;\n");
  const changed = getChangedFiles(dir).map(toPosix).sort();
  assert.deepEqual(changed, [toPosix(path.join(dir, "committed.ts")), toPosix(path.join(dir, "new.ts"))].sort());
});

test("getChangedFiles: a staged (but not yet committed) file is still reported", () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, "src", "nested.ts"), "export const b = 20;\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  const changed = getChangedFiles(dir).map(toPosix);
  assert.deepEqual(changed, [toPosix(path.join(dir, "src", "nested.ts"))]);
});

test("getChangedFiles: a directory that isn't a git repo returns an empty array, not a throw", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-not-a-repo-"));
  assert.deepEqual(getChangedFiles(dir), []);
});
