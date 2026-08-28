import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { ExplorerData, CodeGraph, FileModel } from "../types";
import { relativePath } from "../lib/paths";
import { classifyFileKind, FILE_KIND_SHAPE, FILE_KIND_COLOR } from "../lib/fileKind";
import { classifyLayer, LAYER_ORDER, LAYER_COLOR } from "../lib/layer";
import Legend from "./Legend";

interface ArchitectureViewProps {
  data: ExplorerData;
  codeGraph: CodeGraph;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

// Mirrors GraphView.tsx's design-token hex values — see its comment for why Cytoscape (canvas
// rendering, not DOM) can't reference index.css's --cb-* custom properties directly.
const COLOR = { blue: "#4d7fff" };

const LEGEND_ITEMS = LAYER_ORDER.map((layer) => ({ label: layer, color: LAYER_COLOR[layer] }));

// Deterministic band layout: each layer gets its own horizontal row of fixed height, files inside
// it wrap into a grid. Cytoscape auto-fits a compound parent's box tightly around its children's
// actual positions regardless of layout algorithm, so giving every file a precomputed, non-
// overlapping (band, row, column) slot is enough to guarantee the layer boxes themselves never
// overlap — no fighting cose's compound-separation physics, which cose has no strong guarantees for.
const NODES_PER_ROW = 5;
const NODE_SPACING_X = 110;
const NODE_SPACING_Y = 55;
const BAND_TOP_PADDING = 50;
const BAND_BOTTOM_PADDING = 20;
const BAND_GAP = 50;

const STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: "node.layer",
    style: {
      shape: "roundrectangle",
      "background-color": "data(color)",
      "background-opacity": 0.12,
      "border-width": 1.5,
      "border-color": "data(color)",
      label: "data(label)",
      "text-valign": "top",
      "text-halign": "left",
      "text-margin-x": 6,
      "text-margin-y": -6,
      "font-size": 11,
      "font-family": "'JetBrains Mono', monospace",
      "font-weight": 700,
      color: "data(color)",
      padding: "24px",
    },
  },
  {
    selector: "node.file",
    style: {
      label: "data(label)",
      shape: "data(shape)" as cytoscape.Css.Node["shape"],
      "background-color": "data(fileColor)",
      width: 14,
      height: 14,
      "font-size": 8,
      "font-family": "'JetBrains Mono', monospace",
      color: "#e6e6e6",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 3,
      "text-background-color": "#000",
      "text-background-opacity": 0.55,
      "text-background-padding": "2px",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#5c6470",
      "target-arrow-color": "#5c6470",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      opacity: 0.5,
    },
  },
  { selector: "node.file:selected", style: { "border-width": 3, "border-color": COLOR.blue } },
];

export default function ArchitectureView({ data, codeGraph, selectedPath, onSelect }: ArchitectureViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const byLayer = new Map<string, FileModel[]>();
    for (const f of data.files) {
      const layer = classifyLayer(f, codeGraph);
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer)!.push(f);
    }
    const presentLayers = LAYER_ORDER.filter((l) => byLayer.has(l));

    const filePositions = new Map<string, { x: number; y: number }>();
    let bandTop = 0;
    for (const layer of presentLayers) {
      const files = byLayer.get(layer)!;
      files.forEach((f, i) => {
        const col = i % NODES_PER_ROW;
        const row = Math.floor(i / NODES_PER_ROW);
        filePositions.set(f.absolutePath, { x: col * NODE_SPACING_X, y: bandTop + BAND_TOP_PADDING + row * NODE_SPACING_Y });
      });
      const rows = Math.ceil(files.length / NODES_PER_ROW);
      bandTop += BAND_TOP_PADDING + rows * NODE_SPACING_Y + BAND_BOTTOM_PADDING + BAND_GAP;
    }

    const layerNodes: cytoscape.ElementDefinition[] = presentLayers.map((layer) => ({
      data: { id: `layer:${layer}`, label: layer, color: LAYER_COLOR[layer] },
      classes: "layer",
    }));

    const fileNodes: cytoscape.ElementDefinition[] = data.files.map((f) => {
      const layer = classifyLayer(f, codeGraph);
      const kind = classifyFileKind(f, codeGraph);
      return {
        data: {
          id: f.absolutePath,
          label: relativePath(f.absolutePath, data.rootDir),
          parent: `layer:${layer}`,
          shape: FILE_KIND_SHAPE[kind],
          fileColor: FILE_KIND_COLOR[kind],
        },
        classes: "file",
      };
    });

    const edges: cytoscape.ElementDefinition[] = data.edges.map((e, i) => ({
      data: { id: `edge-${i}`, source: e.from, target: e.to },
    }));

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...layerNodes, ...fileNodes, ...edges],
      style: STYLE,
      // Only file nodes get an explicit position (the object-map form of `positions` — omitted
      // keys, like the layer/compound-parent ids here, are simply left unset by Cytoscape); each
      // layer's box is then derived tightly around its own children's actual positions — exactly
      // the behavior that guarantees non-overlapping bands here.
      layout: { name: "preset", positions: Object.fromEntries(filePositions), fit: true, padding: 30 },
    });

    cy.on("tap", "node.file", (evt) => onSelect(evt.target.id()));

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [data, codeGraph, onSelect]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes(".file").unselect();
    if (selectedPath) cy.$id(selectedPath).select();
  }, [selectedPath]);

  return (
    <div className="graph-view">
      <div ref={containerRef} className="graph-canvas" />
      <Legend items={LEGEND_ITEMS} />
    </div>
  );
}
