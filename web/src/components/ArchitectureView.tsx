import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { ExplorerData, CodeGraph } from "../types";
import { relativePath } from "../lib/paths";
import { classifyFileKind, FILE_KIND_SHAPE, FileKind } from "../lib/fileKind";
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
const COLOR = { blue: "#4d7fff", cyan: "#22d3ee", amber: "#f5a524", purple: "#a78bfa", utility: "#6b7280" };

const KIND_COLOR: Record<FileKind, string> = {
  entry: COLOR.amber,
  component: COLOR.blue,
  class: COLOR.purple,
  service: COLOR.cyan,
  utility: COLOR.utility,
};

const LEGEND_ITEMS = LAYER_ORDER.map((layer) => ({ label: layer, color: LAYER_COLOR[layer] }));

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

    const presentLayers = new Set(data.files.map((f) => classifyLayer(f, codeGraph)));

    const layerNodes: cytoscape.ElementDefinition[] = LAYER_ORDER.filter((l) => presentLayers.has(l)).map((layer) => ({
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
          fileColor: KIND_COLOR[kind],
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
      // TODO(refinement pass): compound-node (layer box) spacing/sizing still needs real tuning —
      // sibling layer boxes can overlap or, at higher componentSpacing, the auto-fit zooms out far
      // enough to make labels illegible. Deferred deliberately per the project's "test/refine once
      // everything is built end-to-end" plan rather than hand-tuning cose parameters in isolation now.
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 10000,
        idealEdgeLength: () => 70,
        componentSpacing: 200,
        nestingFactor: 0.1,
      },
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
