import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { CodeGraph, SymbolModel } from "../types";
import { relativePath } from "../lib/paths";

interface SymbolGraphViewProps {
  codeGraph: CodeGraph;
  selectedPath: string | null;
  rootDir: string;
  onOpenSource: (file: string, line: number) => void;
}

const STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-size": 9,
      color: "#e6e6e6",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 4,
      "text-background-color": "#000",
      "text-background-opacity": 0.55,
      "text-background-padding": "2px",
      "text-background-shape": "roundrectangle",
      "background-color": "#6699ff",
      width: 14,
      height: 14,
    },
  },
  { selector: "node[?neighbor]", style: { "background-color": "#999", shape: "diamond" } },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#999",
      "target-arrow-color": "#999",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      opacity: 0.6,
    },
  },
  { selector: 'edge[kind = "renders"]', style: { "line-style": "dashed" } },
  { selector: "node:selected", style: { "border-width": 3, "border-color": "#222" } },
];

export default function SymbolGraphView({ codeGraph, selectedPath, rootDir, onOpenSource }: SymbolGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current || !selectedPath) return;

    const symbolsById = new Map<string, SymbolModel>(codeGraph.symbols.map((s) => [s.id, s]));
    const fileSymbols = codeGraph.symbols.filter((s) => s.filePath === selectedPath);
    const fileSymbolIds = new Set(fileSymbols.map((s) => s.id));
    const relevantUsages = codeGraph.usages.filter((u) => fileSymbolIds.has(u.from) || fileSymbolIds.has(u.to));

    const neighborIds = new Set<string>();
    for (const usage of relevantUsages) {
      if (!fileSymbolIds.has(usage.from)) neighborIds.add(usage.from);
      if (!fileSymbolIds.has(usage.to)) neighborIds.add(usage.to);
    }

    const nodes: cytoscape.ElementDefinition[] = [
      ...fileSymbols.map((s) => ({ data: { id: s.id, label: s.name, neighbor: false } })),
      ...Array.from(neighborIds)
        .map((id) => symbolsById.get(id))
        .filter((s): s is SymbolModel => s !== undefined)
        .map((s) => ({ data: { id: s.id, label: `${s.name} (${relativePath(s.filePath, rootDir)})`, neighbor: true } })),
    ];
    const edges: cytoscape.ElementDefinition[] = relevantUsages.map((u, i) => ({
      data: { id: `usage-${i}`, source: u.from, target: u.to, kind: u.kind },
    }));

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
      style: STYLE,
      layout: { name: "cose", animate: false, nodeRepulsion: () => 12000, idealEdgeLength: () => 80, componentSpacing: 120, nodeOverlap: 20 },
    });

    cy.on("tap", "node", (evt) => {
      const symbol = symbolsById.get(evt.target.id());
      if (symbol) onOpenSource(symbol.filePath, symbol.line);
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [codeGraph, selectedPath, rootDir, onOpenSource]);

  if (!selectedPath) {
    return <div className="symbol-graph-view app-placeholder-inline">Select a file to see its symbol graph.</div>;
  }

  return <div ref={containerRef} className="symbol-graph-view" />;
}
