import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { ExplorerData, ImpactReport } from "../types";
import { relativePath } from "../lib/paths";

interface GraphViewProps {
  data: ExplorerData;
  selectedPath: string | null;
  searchTerm: string;
  impact: ImpactReport | null;
  onSelect: (path: string) => void;
  hideReExports: boolean;
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
  { selector: ".hidden-edge", style: { display: "none" } },
  { selector: ".faded", style: { opacity: 0.08 } },
  { selector: ".highlighted", style: { "background-color": "#ffcc00" } },
  // .impact-target comes after node:selected so it wins when both apply (the common case: a file
  // is selected, then "Show impact" is clicked on it) — Cytoscape resolves same-specificity
  // property conflicts by declaration order, later wins.
  { selector: "node:selected", style: { "border-width": 3, "border-color": "#222" } },
  { selector: ".impact-target", style: { "border-width": 3, "border-color": "#e63946" } },
];

export default function GraphView({ data, selectedPath, searchTerm, impact, onSelect, hideReExports }: GraphViewProps) {
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
      layout: { name: "cose", animate: false, nodeRepulsion: () => 12000, idealEdgeLength: () => 80, componentSpacing: 120, nodeOverlap: 20 },
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

  useEffect(() => {
    cyRef.current?.edges('[kind = "reExport"]').toggleClass("hidden-edge", hideReExports);
  }, [hideReExports]);

  // Highlight either the active impact set (takes priority while present) or search matches —
  // never both at once, so there's never a need to reconcile two active highlight states.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (impact) {
      const impactedSet = new Set(impact.impactedFiles);
      cy.nodes().forEach((node) => {
        const id = node.id();
        node.toggleClass("impact-target", id === impact.targetFile);
        node.toggleClass("highlighted", impactedSet.has(id));
        node.toggleClass("faded", id !== impact.targetFile && !impactedSet.has(id));
      });
      cy.edges().addClass("faded");
      return;
    }

    cy.elements().removeClass("impact-target");

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
  }, [searchTerm, impact]);

  return <div ref={containerRef} className="graph-view" />;
}
