import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import type { ExplorerData, ImpactReport, CodeGraph, HotspotReport } from "../types";
import { relativePath } from "../lib/paths";
import { classifyFileKind, FILE_KIND_SHAPE, FileKind } from "../lib/fileKind";
import { incomingEdgeCount } from "../lib/metrics";
import Legend from "./Legend";
import ImpactBanner from "./ImpactBanner";
import Minimap from "./Minimap";

interface GraphViewProps {
  data: ExplorerData;
  codeGraph: CodeGraph;
  hotspots: HotspotReport;
  selectedPath: string | null;
  searchTerm: string;
  impact: ImpactReport | null;
  onSelect: (path: string) => void;
  hideReExports: boolean;
}

// Cytoscape renders to <canvas>, not the DOM, so index.css's --cb-* custom properties aren't
// reachable from its stylesheet — these mirror the same design-token hex values by hand; keep them
// in sync if the tokens ever change.
const COLOR = {
  blue: "#4d7fff",
  cyan: "#22d3ee",
  amber: "#f5a524",
  red: "#ef4444",
  purple: "#a78bfa",
  utility: "#6b7280",
};

const KIND_COLOR: Record<FileKind, string> = {
  entry: COLOR.amber,
  component: COLOR.blue,
  class: COLOR.purple,
  service: COLOR.cyan,
  utility: COLOR.utility,
};

const MIN_SIZE = 10;
const MAX_SIZE = 40;
const SIZE_PER_INCOMING_EDGE = 3;

const LEGEND_ITEMS = [
  { label: "Entry point", color: KIND_COLOR.entry },
  { label: "Component", color: KIND_COLOR.component },
  { label: "Class", color: KIND_COLOR.class },
  { label: "Service", color: KIND_COLOR.service },
  { label: "Utility / function", color: KIND_COLOR.utility },
  { label: "Circular dependency", color: COLOR.red, ring: true },
];

const STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      shape: "data(shape)" as cytoscape.Css.Node["shape"],
      "background-color": "data(color)",
      width: "data(size)",
      height: "data(size)",
      "font-size": 9,
      color: "#e6e6e6",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 4,
      "text-background-color": "#000",
      "text-background-opacity": 0.55,
      "text-background-padding": "2px",
      "text-background-shape": "roundrectangle",
      // Smoothly animates opacity/border/background changes whenever a class like .faded or
      // .highlighted is toggled, instead of the change snapping instantly — this alone gives the
      // impact reveal (below) its "fade" without any manual per-property animation code.
      "transition-property": "opacity, border-width, border-color, background-color",
      "transition-duration": 0.3,
      "transition-timing-function": "ease-out",
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
      opacity: 0.6,
      "transition-property": "opacity",
      "transition-duration": 0.3,
      "transition-timing-function": "ease-out",
    },
  },
  { selector: 'edge[kind = "reExport"]', style: { "line-style": "dashed" } },
  { selector: ".hidden-edge", style: { display: "none" } },
  { selector: ".faded", style: { opacity: 0.06 } },
  { selector: ".highlighted", style: { "background-color": COLOR.amber } },
  // Priority (later wins on a same-specificity conflict): highlighted < selected < in-cycle <
  // impact-target. A cycle is an ambient structural danger signal, worth showing over mere
  // selection; an active impact query is the user's current focus, so it always wins outright.
  // Border widths scale with node size (mapData) rather than a fixed pixel value — a fixed 3px
  // border on a 10px minimum-size node visually eats the entire node, drowning out its kind color.
  { selector: "node:selected", style: { "border-width": "mapData(size, 10, 40, 1.5, 3)" as unknown as number, "border-color": COLOR.blue } },
  { selector: ".in-cycle", style: { "border-width": "mapData(size, 10, 40, 1.5, 3)" as unknown as number, "border-color": COLOR.red } },
  { selector: ".impact-target", style: { "border-width": "mapData(size, 10, 40, 2, 5)" as unknown as number, "border-color": COLOR.red } },
];

export default function GraphView({ data, codeGraph, hotspots, selectedPath, searchTerm, impact, onSelect, hideReExports }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  // Mirrors cyRef into state purely so the Minimap (a child, rendered from this same return) gets a
  // re-render once the instance exists — refs alone don't trigger that. Every other effect below
  // still reads cyRef.current directly; they don't need the extra re-render this causes.
  const [cyForMinimap, setCyForMinimap] = useState<cytoscape.Core | null>(null);

  // Rebuild the graph whenever the underlying data changes (once per page load for the MVP).
  useEffect(() => {
    if (!containerRef.current) return;

    const cycleFiles = new Set(hotspots.cycles.flatMap((c) => c.files));

    const nodes: cytoscape.ElementDefinition[] = data.files.map((f) => {
      const kind = classifyFileKind(f, codeGraph);
      const size = Math.min(
        MAX_SIZE,
        Math.max(MIN_SIZE, MIN_SIZE + incomingEdgeCount(data.edges, f.absolutePath) * SIZE_PER_INCOMING_EDGE)
      );
      return {
        data: {
          id: f.absolutePath,
          label: relativePath(f.absolutePath, data.rootDir),
          shape: FILE_KIND_SHAPE[kind],
          color: KIND_COLOR[kind],
          size,
        },
        classes: cycleFiles.has(f.absolutePath) ? "in-cycle" : "",
      };
    });
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
    setCyForMinimap(cy);
    return () => {
      cy.destroy();
      cyRef.current = null;
      setCyForMinimap(null);
    };
  }, [data, codeGraph, hotspots, onSelect]);

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
        node.removeClass("highlighted");
        node.toggleClass("impact-target", id === impact.targetFile);
        node.toggleClass("faded", id !== impact.targetFile && !impactedSet.has(id));
      });
      cy.edges().addClass("faded");

      const target = cy.$id(impact.targetFile);
      const baseSize = target.data("size") as number;
      // A brief pulse draws the eye to the target the instant impact analysis starts.
      target.stop(true).animate({ style: { width: baseSize * 1.8, height: baseSize * 1.8 } }, { duration: 220, easing: "ease-out" });
      target.animate({ style: { width: baseSize, height: baseSize } }, { duration: 220, easing: "ease-in" });

      // impact.impactedFiles is produced by graph.ts's findDependentsFromReverse, a plain
      // queue-based BFS — its return order is therefore already hop-distance order (closest
      // dependents first). Revealing in that order, staggered, turns the flat list into a visible
      // cascade outward from the target. If that BFS is ever rewritten to not preserve visitation
      // order, this stagger silently stops matching hop distance — worth re-checking here first.
      const timers = impact.impactedFiles.map((id, i) =>
        window.setTimeout(() => cy.$id(id).addClass("highlighted"), 300 + i * 60)
      );
      return () => timers.forEach((t) => window.clearTimeout(t));
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

  return (
    <div className="graph-view">
      <div ref={containerRef} className="graph-canvas" />
      <Legend items={LEGEND_ITEMS} />
      <Minimap cy={cyForMinimap} />
      {impact && <ImpactBanner impact={impact} rootDir={data.rootDir} modules={hotspots.modules} />}
    </div>
  );
}
