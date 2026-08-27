import type { ExplorerData, CodeGraph } from "../types";
import { classifyLayer, LAYER_ORDER, ArchitectureLayer } from "./layer";

export interface LayerEdge {
  from: ArchitectureLayer;
  to: ArchitectureLayer;
  count: number;
}

export interface BlueprintData {
  layers: { layer: ArchitectureLayer; fileCount: number }[];
  edges: LayerEdge[];
}

/**
 * Aggregates the file-level graph up to the layer level: one box per non-empty layer (in
 * LAYER_ORDER), one weighted arrow per distinct (fromLayer, toLayer) pair with at least one
 * cross-layer file edge. Same-layer edges are deliberately excluded — the Blueprint shows how
 * layers relate to each other, not what's already visible in the Architecture view's per-layer
 * boxes. Regenerated from the real graph on every load, so it can't drift the way a hand-drawn
 * architecture diagram does.
 */
export function computeBlueprint(data: ExplorerData, codeGraph: CodeGraph): BlueprintData {
  const layerByFile = new Map(data.files.map((f) => [f.absolutePath, classifyLayer(f, codeGraph)]));

  const fileCounts = new Map<ArchitectureLayer, number>();
  for (const layer of layerByFile.values()) {
    fileCounts.set(layer, (fileCounts.get(layer) ?? 0) + 1);
  }

  const edgeCounts = new Map<string, number>();
  for (const e of data.edges) {
    const from = layerByFile.get(e.from);
    const to = layerByFile.get(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }

  const layers = LAYER_ORDER.filter((l) => (fileCounts.get(l) ?? 0) > 0).map((l) => ({ layer: l, fileCount: fileCounts.get(l)! }));

  const edges: LayerEdge[] = Array.from(edgeCounts.entries()).map(([key, count]) => {
    const [from, to] = key.split("->") as [ArchitectureLayer, ArchitectureLayer];
    return { from, to, count };
  });

  return { layers, edges };
}
