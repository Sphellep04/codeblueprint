import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseWorkspacePatterns, parsePnpmWorkspacePatterns, expandPattern, detectWorkspace } from "../src/workspace";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codeblueprint-workspace-test-"));
}

function writePackageJson(dir: string, contents: unknown): void {
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(contents));
}

test("parseWorkspacePatterns: npm's plain array form", () => {
  const dir = tempDir();
  writePackageJson(dir, { name: "root", workspaces: ["packages/*"] });
  assert.deepEqual(parseWorkspacePatterns(dir), ["packages/*"]);
});

test("parseWorkspacePatterns: yarn's object form", () => {
  const dir = tempDir();
  writePackageJson(dir, { name: "root", workspaces: { packages: ["apps/*", "packages/*"], nohoist: ["**/foo"] } });
  assert.deepEqual(parseWorkspacePatterns(dir), ["apps/*", "packages/*"]);
});

test("parseWorkspacePatterns: no workspaces field returns null", () => {
  const dir = tempDir();
  writePackageJson(dir, { name: "root" });
  assert.equal(parseWorkspacePatterns(dir), null);
});

test("parseWorkspacePatterns: no package.json at all returns null", () => {
  const dir = tempDir();
  assert.equal(parseWorkspacePatterns(dir), null);
});

test("parseWorkspacePatterns: malformed JSON returns null instead of throwing", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "package.json"), "{ not valid json");
  assert.equal(parseWorkspacePatterns(dir), null);
});

test("parsePnpmWorkspacePatterns: reads the 'packages' field from pnpm-workspace.yaml", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n  - 'apps/*'\n");
  assert.deepEqual(parsePnpmWorkspacePatterns(dir), ["packages/*", "apps/*"]);
});

test("parsePnpmWorkspacePatterns: no pnpm-workspace.yaml at all returns null", () => {
  const dir = tempDir();
  assert.equal(parsePnpmWorkspacePatterns(dir), null);
});

test("parsePnpmWorkspacePatterns: malformed YAML returns null instead of throwing", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'unterminated\n\tbad indent: [");
  assert.equal(parsePnpmWorkspacePatterns(dir), null);
});

test("parsePnpmWorkspacePatterns: a 'packages' field that isn't an array of strings returns null", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), "packages: not-an-array\n");
  assert.equal(parsePnpmWorkspacePatterns(dir), null);
});

test("parsePnpmWorkspacePatterns: no 'packages' field at all returns null", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), "onlyBuiltDependencies:\n  - foo\n");
  assert.equal(parsePnpmWorkspacePatterns(dir), null);
});

test("detectWorkspace: falls back to pnpm-workspace.yaml when there's no package.json workspaces field", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "packages", "a"), { recursive: true });
  fs.mkdirSync(path.join(dir, "packages", "b"), { recursive: true });
  writePackageJson(dir, { name: "root" }); // no "workspaces" field
  fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
  writePackageJson(path.join(dir, "packages", "a"), { name: "a" });
  writePackageJson(path.join(dir, "packages", "b"), { name: "b" });

  assert.deepEqual(detectWorkspace(dir), [path.join(dir, "packages", "a"), path.join(dir, "packages", "b")].sort());
});

test("detectWorkspace: package.json 'workspaces' takes priority over pnpm-workspace.yaml when both exist", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "npm-pkgs", "a"), { recursive: true });
  fs.mkdirSync(path.join(dir, "pnpm-pkgs", "b"), { recursive: true });
  writePackageJson(dir, { name: "root", workspaces: ["npm-pkgs/*"] });
  fs.writeFileSync(path.join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'pnpm-pkgs/*'\n");
  writePackageJson(path.join(dir, "npm-pkgs", "a"), { name: "a" });
  writePackageJson(path.join(dir, "pnpm-pkgs", "b"), { name: "b" });

  assert.deepEqual(detectWorkspace(dir), [path.join(dir, "npm-pkgs", "a")]);
});

test("expandPattern: a single trailing '*' expands to every subdirectory with its own package.json", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "packages", "a"), { recursive: true });
  fs.mkdirSync(path.join(dir, "packages", "b"), { recursive: true });
  fs.mkdirSync(path.join(dir, "packages", "not-a-package")); // no package.json — excluded
  writePackageJson(path.join(dir, "packages", "a"), { name: "a" });
  writePackageJson(path.join(dir, "packages", "b"), { name: "b" });

  const result = expandPattern(dir, "packages/*").sort();
  assert.deepEqual(result, [path.join(dir, "packages", "a"), path.join(dir, "packages", "b")].sort());
});

test("expandPattern: node_modules is never treated as a workspace package", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "packages", "node_modules"), { recursive: true });
  writePackageJson(path.join(dir, "packages", "node_modules"), { name: "should-not-appear" });
  assert.deepEqual(expandPattern(dir, "packages/*"), []);
});

test("expandPattern: an unsupported pattern shape (mid-path wildcard) falls back to a literal-directory check and finds nothing", () => {
  const dir = tempDir();
  assert.deepEqual(expandPattern(dir, "packages/*/nested"), []);
});

test("expandPattern: a literal directory pattern (no wildcard) resolves if it's a real package", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "single-package"));
  writePackageJson(path.join(dir, "single-package"), { name: "single" });
  assert.deepEqual(expandPattern(dir, "single-package"), [path.join(dir, "single-package")]);
});

test("detectWorkspace: returns null for an ordinary (non-workspace) project", () => {
  const dir = tempDir();
  writePackageJson(dir, { name: "not-a-monorepo" });
  assert.equal(detectWorkspace(dir), null);
});

test("detectWorkspace: returns every discovered package root, deduplicated and sorted", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "packages", "a"), { recursive: true });
  fs.mkdirSync(path.join(dir, "packages", "b"), { recursive: true });
  writePackageJson(dir, { name: "root", workspaces: ["packages/*"] });
  writePackageJson(path.join(dir, "packages", "a"), { name: "a" });
  writePackageJson(path.join(dir, "packages", "b"), { name: "b" });

  assert.deepEqual(detectWorkspace(dir), [path.join(dir, "packages", "a"), path.join(dir, "packages", "b")].sort());
});
