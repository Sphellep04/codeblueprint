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
