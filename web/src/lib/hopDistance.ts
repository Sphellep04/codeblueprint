import type { FileEdge } from "../types";

/**
 * BFS over the reversed dependency graph (same technique as the backend's graph.ts
 * findDependentsFromReverse), purely to recover discrete hop-distance rings for the concentric
 * impact layout in GraphView. ImpactReport/DiffImpactReport only carry reveal ORDER (already
 * hop-ordered, per graph.ts's plain queue-based BFS), not the actual hop number — re-deriving the
 * number here from data GraphView already has (data.edges) keeps this a presentation-only concern
 * rather than a backend response-shape change just to feed one view's layout.
 */
export function computeHopDistances(edges: FileEdge[], targetFiles: string[]): Map<string, number> {
  const dependentsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!dependentsOf.has(e.to)) dependentsOf.set(e.to, []);
    dependentsOf.get(e.to)!.push(e.from);
  }

  const distances = new Map<string, number>();
  const queue: string[] = [];
  for (const target of targetFiles) {
    if (distances.has(target)) continue;
    distances.set(target, 0);
    queue.push(target);
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const dist = distances.get(current)!;
    for (const dependent of dependentsOf.get(current) ?? []) {
      if (distances.has(dependent)) continue;
      distances.set(dependent, dist + 1);
      queue.push(dependent);
    }
  }

  return distances;
}
