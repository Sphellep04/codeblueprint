export interface DependencyGraph {
  nodes: string[];
  edges: Map<string, Set<string>>;
}

export function buildGraph(nodePaths: string[], edgesByNode: Map<string, string[]>): DependencyGraph {
  const edges = new Map<string, Set<string>>();
  for (const node of nodePaths) {
    edges.set(node, new Set(edgesByNode.get(node) ?? []));
  }
  return { nodes: nodePaths, edges };
}

export function inDegrees(graph: DependencyGraph): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of graph.nodes) degrees.set(node, 0);
  for (const targets of graph.edges.values()) {
    for (const target of targets) {
      degrees.set(target, (degrees.get(target) ?? 0) + 1);
    }
  }
  return degrees;
}

/** Tarjan's strongly-connected-components algorithm, O(V+E), iterative to avoid stack overflow on large graphs. */
export function findStronglyConnectedComponents(graph: DependencyGraph): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];

  type Frame = { node: string; neighbors: string[]; i: number };

  for (const start of graph.nodes) {
    if (indices.has(start)) continue;

    const work: Frame[] = [{ node: start, neighbors: Array.from(graph.edges.get(start) ?? []), i: 0 }];
    indices.set(start, index);
    lowlink.set(start, index);
    index++;
    stack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const { node: v } = frame;

      if (frame.i < frame.neighbors.length) {
        const w = frame.neighbors[frame.i];
        frame.i++;
        if (!indices.has(w)) {
          indices.set(w, index);
          lowlink.set(w, index);
          index++;
          stack.push(w);
          onStack.add(w);
          work.push({ node: w, neighbors: Array.from(graph.edges.get(w) ?? []), i: 0 });
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      } else {
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1].node;
          lowlink.set(parent, Math.min(lowlink.get(parent)!, lowlink.get(v)!));
        }
        if (lowlink.get(v) === indices.get(v)) {
          const component: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            component.push(w);
          } while (w !== v);
          result.push(component);
        }
      }
    }
  }

  return result;
}

/** Distinct cyclic clusters: SCCs of size >= 2, or size 1 with a self-loop. */
export function findCycles(graph: DependencyGraph): string[][] {
  return findStronglyConnectedComponents(graph).filter(
    (scc) => scc.length > 1 || (scc.length === 1 && (graph.edges.get(scc[0])?.has(scc[0]) ?? false))
  );
}

/**
 * Reconstructs one genuine edge-connected cyclic path through an SCC's member set (from
 * findCycles), e.g. ["a", "b", "c"] meaning a -> b -> c -> a. Walks forward via DFS until it hits
 * a node already on the current path (a back-edge), which closes the cycle — O(V+E) within the
 * member subgraph. Doesn't attempt to visit every member (a Hamiltonian cycle through an arbitrary
 * SCC is unnecessary here and NP-hard in general); a simple forward walk always finds *a* real
 * cycle, since every node in a genuine SCC has at least one outgoing edge back into the SCC.
 */
export function findCyclePath(members: string[], graph: DependencyGraph): string[] {
  if (members.length <= 1) return members;

  const memberSet = new Set(members);
  const path: string[] = [members[0]];
  const indexOnPath = new Map<string, number>([[members[0], 0]]);
  let current = members[0];

  while (true) {
    // Self-loops are excluded here: members.length > 1 at this point (the single-node/self-loop
    // case already returned above), so a self-loop on `current` would otherwise look like an
    // immediate "back edge," closing the path against itself and hiding the real multi-file cycle
    // that actually put `current` in this SCC.
    const neighbors = Array.from(graph.edges.get(current) ?? []).filter((n) => memberSet.has(n) && n !== current);
    const backEdge = neighbors.find((n) => indexOnPath.has(n));
    if (backEdge !== undefined) return path.slice(indexOnPath.get(backEdge)!);

    const next = neighbors.find((n) => !indexOnPath.has(n))!;
    path.push(next);
    indexOnPath.set(next, path.length - 1);
    current = next;
  }
}

/** Reverses a DependencyGraph's edges: edges.get(X) becomes "who depends on X" instead of "what X depends on." */
export function reverseGraph(graph: DependencyGraph): DependencyGraph {
  const edges = new Map<string, Set<string>>();
  for (const node of graph.nodes) edges.set(node, new Set());
  for (const [from, targets] of graph.edges) {
    for (const to of targets) {
      edges.get(to)?.add(from);
    }
  }
  return { nodes: graph.nodes, edges };
}

/**
 * Full transitive closure of files that (directly or indirectly) depend on `target`, given an
 * already-reversed graph (see reverseGraph) — BFS, O(V+E). Excludes target itself even if
 * reachable through a cycle back to it: target is seeded into `visited` before the walk starts, so
 * a cycle looping back to it is a dead end, not a re-add. Split out from findDependents so a caller
 * making many queries against the same graph (e.g. one --impact request per click against a
 * server's already-loaded project) can reverse the graph once and reuse it, instead of paying the
 * O(V+E) reversal cost on every query.
 */
export function findDependentsFromReverse(reverse: DependencyGraph, target: string): string[] {
  const visited = new Set<string>([target]);
  const result: string[] = [];
  const queue: string[] = [target];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dependent of reverse.edges.get(current) ?? []) {
      if (visited.has(dependent)) continue;
      visited.add(dependent);
      result.push(dependent);
      queue.push(dependent);
    }
  }

  return result;
}

/** Convenience one-shot form of findDependentsFromReverse for a caller that only needs a single
 * query against `graph` and doesn't already have (or want to keep) a reversed copy of it. */
export function findDependents(graph: DependencyGraph, target: string): string[] {
  return findDependentsFromReverse(reverseGraph(graph), target);
}

/**
 * Forward BFS from `start`, following each node's own outgoing edges (the mirror image of
 * findDependentsFromReverse, which walks a reversed graph). Everything transitively reachable
 * "downstream" of start, cycle-safe the same way: start is seeded into `visited` before the walk,
 * so a cycle looping back to it is a dead end, not a re-add. Used for symbol-level call-chain
 * tracing (what does this symbol, directly or indirectly, end up calling), as distinct from
 * findDependents' "who transitively depends on this."
 */
export function findReachableForward(graph: DependencyGraph, start: string): string[] {
  const visited = new Set<string>([start]);
  const result: string[] = [];
  const queue: string[] = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of graph.edges.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      result.push(next);
      queue.push(next);
    }
  }

  return result;
}
