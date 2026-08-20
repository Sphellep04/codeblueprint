import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { ExplorerData } from "../types";
import { relativePath } from "../lib/paths";

interface GraphViewProps {
  data: ExplorerData;
  selectedPath: string | null;
  searchTerm: string;
  onSelect: (path: string) => void;
}

const STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-size": 8,
      "background-color": "#6699ff",
      width: 16,
      height: 16,
    },
  },
  {
    selector: "node[?isEntryPoint]",
    style: { "background-color": "#ff9933", shape: "diamond" },
  },
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
  { selector: 'edge[kind = "reExport"]', style: { "line-style": "dashed" } },
  { selector: ".faded", style: { opacity: 0.08 } },
  { selector: ".highlighted", style: { "background-color": "#ffcc00" } },
  { selector: "node:selected", style: { "border-width": 3, "border-color": "#222" } },
];

export default function GraphView({ data, selectedPath, searchTerm, onSelect }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // Rebuild the graph whenever the underlying data changes (once per page load for the MVP).
  useEffect(() => {
    if (!containerRef.current) return;

    const nodes: cytoscape.ElementDefinition[] = data.files.map((f) => ({
      data: { id: f.absolutePath, label: relativePath(f.absolutePath, data.rootDir), isEntryPoint: f.isEntryPoint },
    }));
    const edges: cytoscape.ElementDefinition[] = data.edges.map((e, i) => ({
      data: { id: `edge-${i}`, source: e.from, target: e.to, kind: e.kind },
    }));

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
      style: STYLE,
      layout: { name: "cose", animate: false },
    });

    cy.on("tap", "node", (evt) => onSelect(evt.target.id()));

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [data, onSelect]);

  // Reflect external selection (e.g. a sidebar click) onto the graph.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedPath) cy.$id(selectedPath).select();
  }, [selectedPath]);

  // Fade non-matching nodes/edges while a search term is active.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (!searchTerm.trim()) {
      cy.elements().removeClass("faded highlighted");
      return;
    }

    const term = searchTerm.toLowerCase();
    cy.nodes().forEach((node) => {
      const matches = (node.data("label") as string).toLowerCase().includes(term);
      node.toggleClass("highlighted", matches);
      node.toggleClass("faded", !matches);
    });
    cy.edges().addClass("faded");
  }, [searchTerm]);

  return <div ref={containerRef} className="graph-view" />;
}
