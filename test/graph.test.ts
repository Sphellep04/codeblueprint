import { test } from "node:test";
import * as assert from "node:assert/strict";
import { buildGraph, findCycles, findCyclePath, findDependents, inDegrees, DependencyGraph } from "../src/graph";

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

test("findCyclePath: a self-loop on the SCC's starting member doesn't hide the real multi-file cycle", () => {
  // a has both a self-loop and is genuinely part of a -> b -> a. A back-edge search that doesn't
  // exclude self-loops could close the "cycle" against a itself, reporting just ["a"] and hiding
  // the real a<->b circular dependency that findCycles already grouped it into.
  const graph = buildGraph(
    ["a", "b"],
    new Map([
      ["a", ["a", "b"]],
      ["b", ["a"]],
    ])
  );
  const path = findCyclePath(["a", "b"], graph);
  assert.equal(path.length, 2);
  assertIsValidCycle(path, graph);
});

test("findDependents: a linear chain returns every upstream node", () => {
  const graph = buildGraph(
    ["a", "b", "c"],
    new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", []],
    ])
  );
  assert.deepEqual(new Set(findDependents(graph, "c")), new Set(["a", "b"]));
  assert.deepEqual(findDependents(graph, "a"), []);
});

test("findDependents: a 2-node cycle's dependents are the other node, not itself", () => {
  const graph = buildGraph(
    ["a", "b"],
    new Map([
      ["a", ["b"]],
      ["b", ["a"]],
    ])
  );
  assert.deepEqual(findDependents(graph, "a"), ["b"]);
  assert.deepEqual(findDependents(graph, "b"), ["a"]);
});

test("findDependents: a diamond dependency doesn't produce a duplicate", () => {
  // a -> b -> d, a -> c -> d: two paths from a to d, but a must appear once in d's dependents.
  const graph = buildGraph(
    ["a", "b", "c", "d"],
    new Map([
      ["a", ["b", "c"]],
      ["b", ["d"]],
      ["c", ["d"]],
      ["d", []],
    ])
  );
  const dependents = findDependents(graph, "d");
  assert.deepEqual(new Set(dependents), new Set(["a", "b", "c"]));
  assert.equal(dependents.length, 3);
});

test("findDependents: an isolated node has no dependents", () => {
  const graph = buildGraph(["a"], new Map([["a", []]]));
  assert.deepEqual(findDependents(graph, "a"), []);
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
