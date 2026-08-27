import type { CodeGraph, SymbolUsageEdge } from "../types";

export interface TracedChain {
  /** Every symbol id reachable from startSymbolId, forward, not including startSymbolId itself. */
  symbolIds: string[];
  /** The subset of CodeGraph.usages connecting only symbols in the traced set (start included). */
  edges: SymbolUsageEdge[];
}

/**
 * Mirrors src/graph.ts's findReachableForward (see test/graph.test.ts for the algorithm's proof) —
 * a forward BFS over the symbol usage graph (CodeGraph.usages) instead of the file graph. Kept in
 * sync by hand, same pattern as web/src/lib/module.ts. Used by SymbolGraphView's "Trace flow"
 * feature: what does this symbol, directly or indirectly, end up calling.
 */
export function traceCallChain(codeGraph: CodeGraph, startSymbolId: string): TracedChain {
  const edgesByNode = new Map<string, string[]>();
  for (const usage of codeGraph.usages) {
    if (!edgesByNode.has(usage.from)) edgesByNode.set(usage.from, []);
    edgesByNode.get(usage.from)!.push(usage.to);
  }

  const visited = new Set<string>([startSymbolId]);
  const symbolIds: string[] = [];
  const queue: string[] = [startSymbolId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of edgesByNode.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      symbolIds.push(next);
      queue.push(next);
    }
  }

  const edges = codeGraph.usages.filter((u) => visited.has(u.from) && visited.has(u.to));
  return { symbolIds, edges };
}
