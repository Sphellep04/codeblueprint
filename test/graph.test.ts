import { test } from "node:test";
import * as assert from "node:assert/strict";
import { buildGraph, findCycles, inDegrees } from "../src/graph";

test("findCycles: acyclic graph has no cycles", () => {
  const graph = buildGraph(
    ["a", "b", "c"],
    new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", []],
    ])
  );
  assert.deepEqual(findCycles(graph), []);
});

test("findCycles: two disjoint cycles count as two clusters, not one", () => {
  const graph = buildGraph(
    ["a", "b", "c", "d", "e"],
    new Map([
      ["a", ["b"]],
      ["b", ["a"]],
      ["c", ["d"]],
      ["d", ["e"]],
      ["e", ["c"]],
    ])
  );
  const cycles = findCycles(graph);
  assert.equal(cycles.length, 2);
  const sizes = cycles.map((c) => c.length).sort();
  assert.deepEqual(sizes, [2, 3]);
});

test("findCycles: a single self-loop counts as one cycle", () => {
  const graph = buildGraph(["a"], new Map([["a", ["a"]]]));
  assert.equal(findCycles(graph).length, 1);
});

test("inDegrees: node with no incoming edges is 0", () => {
  const graph = buildGraph(
    ["a", "b"],
    new Map([
      ["a", ["b"]],
      ["b", []],
    ])
  );
  const degrees = inDegrees(graph);
  assert.equal(degrees.get("a"), 0);
  assert.equal(degrees.get("b"), 1);
});
