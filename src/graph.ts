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
    const neighbors = Array.from(graph.edges.get(current) ?? []).filter((n) => memberSet.has(n));
    const backEdge = neighbors.find((n) => indexOnPath.has(n));
    if (backEdge !== undefined) return path.slice(indexOnPath.get(backEdge)!);

    const next = neighbors.find((n) => !indexOnPath.has(n))!;
    path.push(next);
    indexOnPath.set(next, path.length - 1);
    current = next;
  }
}
