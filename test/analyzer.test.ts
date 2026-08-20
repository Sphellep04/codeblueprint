import { test } from "node:test";
import * as assert from "node:assert/strict";
import { Project } from "ts-morph";
import { getCyclomaticComplexity, getFunctionCandidates } from "../src/analyzer";

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
