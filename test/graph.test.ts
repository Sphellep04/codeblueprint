import { test } from "node:test";
import * as assert from "node:assert/strict";
import { buildGraph, findCycles, findCyclePath, inDegrees, DependencyGraph } from "../src/graph";

/** A cycle path is valid iff every consecutive pair (wrapping around) is a real edge in the graph. */
function assertIsValidCycle(path: string[], graph: DependencyGraph): void {
  assert.ok(path.length >= 1, "cycle path must not be empty");
  for (let i = 0; i < path.length; i++) {
    const from = path[i];
    const to = path[(i + 1) % path.length];
    assert.ok(graph.edges.get(from)?.has(to), `expected a real edge ${from} -> ${to}`);
  }
}

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

test("findCyclePath: a two-node cycle returns the edge-connected path in the graph's actual direction", () => {
  const graph = buildGraph(
    ["a", "b"],
    new Map([
      ["a", ["b"]],
      ["b", ["a"]],
    ])
  );
  const path = findCyclePath(["a", "b"], graph);
  assertIsValidCycle(path, graph);
  assert.deepEqual(path, ["a", "b"]);
});

test("findCyclePath: a single self-loop returns the one-node path unchanged", () => {
  const graph = buildGraph(["a"], new Map([["a", ["a"]]]));
  assert.deepEqual(findCyclePath(["a"], graph), ["a"]);
});

test("findCyclePath: an SCC with an extra chord edge still returns a genuine cycle, not a false one", () => {
  // a -> b -> c -> a is the real 3-cycle; a -> c is a chord that a naive "just walk and stop at
  // the first repeat" implementation could mistake for closing a shorter, invalid cycle.
  const graph = buildGraph(
    ["a", "b", "c"],
    new Map([
      ["a", ["b", "c"]],
      ["b", ["c"]],
      ["c", ["a"]],
    ])
  );
  const path = findCyclePath(["a", "b", "c"], graph);
  assertIsValidCycle(path, graph);
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
