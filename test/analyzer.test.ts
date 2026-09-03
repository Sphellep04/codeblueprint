import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Project } from "ts-morph";
import { getCyclomaticComplexity, getFunctionCandidates, getDependencyEdges, countClasses, getClassExpressionCandidates } from "../src/analyzer";

function complexityOf(source: string, functionName: string): number {
  const project = new Project();
  const sf = project.createSourceFile("test.ts", source);
  const candidate = getFunctionCandidates(sf).find((c) => c.name === functionName);
  assert.ok(candidate, `no function candidate named ${functionName}`);
  return getCyclomaticComplexity(candidate!.node);
}

test("getCyclomaticComplexity: a function with no branches is 1", () => {
  assert.equal(complexityOf(`function f() { return 1; }`, "f"), 1);
});

test("getCyclomaticComplexity: one if statement is 2", () => {
  assert.equal(complexityOf(`function f(x: number) { if (x > 0) return 1; return 0; }`, "f"), 2);
});

test("getCyclomaticComplexity: a ternary is 2", () => {
  assert.equal(complexityOf(`function f(x: number) { return x > 0 ? 1 : 0; }`, "f"), 2);
});

test("getCyclomaticComplexity: && and || each add 1", () => {
  assert.equal(complexityOf(`function f(a: boolean, b: boolean, c: boolean) { return a && b || c; }`, "f"), 3);
});

test("getCyclomaticComplexity: a switch with 3 cases (no default) adds 3", () => {
  const src = `
    function f(x: number) {
      switch (x) {
        case 1: return "a";
        case 2: return "b";
        case 3: return "c";
        default: return "d";
      }
    }
  `;
  assert.equal(complexityOf(src, "f"), 4); // 1 + 3 case clauses; default doesn't count
});

test("getCyclomaticComplexity: for/while/catch each add 1", () => {
  const src = `
    function f(items: number[]) {
      for (const item of items) {
        try {
          console.log(item);
        } catch (e) {
          console.log(e);
        }
      }
      let i = 0;
      while (i < items.length) i++;
      return i;
    }
  `;
  assert.equal(complexityOf(src, "f"), 4); // 1 + for-of + catch + while
});

// resolveRequireSpecifier checks the real filesystem (fs.existsSync), not ts-morph's virtual
// project — require() has no ts-morph module-specifier resolution to piggyback on, unlike import.
// So these need real files on real disk, not createSourceFile's in-memory-only form.
function makeRealProject(files: Record<string, string>): { dir: string; project: Project } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-analyzer-test-"));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  const project = new Project();
  for (const relPath of Object.keys(files)) {
    project.addSourceFileAtPath(path.join(dir, relPath));
  }
  return { dir, project };
}

test("getDependencyEdges: require('./x') resolves to a real scanned file, kind-tagged 'require'", () => {
  const { dir, project } = makeRealProject({
    "a.js": `const b = require("./b");\nmodule.exports = b;\n`,
    "b.js": `module.exports = { value: 1 };\n`,
  });
  const rootAbs = path.resolve(dir);
  const sf = project.getSourceFileOrThrow(path.join(dir, "a.js"));
  const edges = getDependencyEdges(sf, rootAbs);
  assert.deepEqual(
    edges.map((e) => ({ to: path.basename(e.to), kind: e.kind })),
    [{ to: "b.js", kind: "require" }]
  );
});

test("getDependencyEdges: require() resolves through an index file candidate", () => {
  const { dir, project } = makeRealProject({
    "a.js": `const utils = require("./utils");\n`,
    "utils/index.js": `module.exports = {};\n`,
  });
  const rootAbs = path.resolve(dir);
  const sf = project.getSourceFileOrThrow(path.join(dir, "a.js"));
  const edges = getDependencyEdges(sf, rootAbs);
  assert.equal(edges.length, 1);
  assert.equal(path.basename(edges[0].to), "index.js");
  assert.equal(edges[0].kind, "require");
});

test("getDependencyEdges: require() of a bare package name is not treated as an internal edge", () => {
  const { dir, project } = makeRealProject({ "a.js": `const react = require("react");\n` });
  const rootAbs = path.resolve(dir);
  const sf = project.getSourceFileOrThrow(path.join(dir, "a.js"));
  assert.deepEqual(getDependencyEdges(sf, rootAbs), []);
});

test("getDependencyEdges: require() of a path that doesn't resolve to any real file is dropped, not thrown", () => {
  const { dir, project } = makeRealProject({ "a.js": `const x = require("./does-not-exist");\n` });
  const rootAbs = path.resolve(dir);
  const sf = project.getSourceFileOrThrow(path.join(dir, "a.js"));
  assert.deepEqual(getDependencyEdges(sf, rootAbs), []);
});

test("countClasses: a class expression bound to a variable is counted alongside class declarations", () => {
  const project = new Project();
  const sf = project.createSourceFile(
    "test.ts",
    `class Declared {}\nconst Expr = class {};\nconst notAClass = 5;\n`
  );
  assert.equal(countClasses(sf), 2);
});

test("getClassExpressionCandidates: name comes from the variable it's bound to; an unbound class expression is ignored", () => {
  const project = new Project();
  const sf = project.createSourceFile(
    "test.ts",
    `const Named = class {};\n[class {}].forEach(() => {});\n`
  );
  const candidates = getClassExpressionCandidates(sf);
  assert.deepEqual(
    candidates.map((c) => c.name),
    ["Named"]
  );
});

test("getCyclomaticComplexity: a nested function's branches don't inflate the outer function's count", () => {
  const src = `
    const outer = () => {
      const inner = () => {
        if (true) return 1;
        return 0;
      };
      return inner();
    };
  `;
  const project = new Project();
  const sf = project.createSourceFile("test.ts", src);
  const candidates = getFunctionCandidates(sf);

  const outer = candidates.find((c) => c.name === "outer");
  const inner = candidates.find((c) => c.name === "inner");
  assert.ok(outer);
  assert.ok(inner);
  assert.equal(getCyclomaticComplexity(outer!.node), 1); // no branches of its own — inner's `if` doesn't leak in
  assert.equal(getCyclomaticComplexity(inner!.node), 2); // inner's own `if` is correctly counted on its own node
});
