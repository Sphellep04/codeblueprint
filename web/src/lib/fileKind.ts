import type { CodeGraph, FileModel } from "../types";

export type FileKind = "entry" | "component" | "class" | "service" | "utility";

const SERVICE_PATH_RE = /\/(services|api|clients)\//i;

/**
 * Heuristic per-file classification driving the graph's node shape — same spirit as
 * componentHeuristics.ts's server-side heuristics: a best-effort signal, not a guarantee. Priority
 * order matters: an entry point is flagged regardless of what it contains (that's the single most
 * important fact about a file), then symbol kind, then a path convention, falling back to "utility"
 * for a plain function-only file.
 */
export function classifyFileKind(file: FileModel, codeGraph: CodeGraph): FileKind {
  if (file.isEntryPoint) return "entry";

  const symbols = codeGraph.symbols.filter((s) => s.filePath === file.absolutePath);
  if (symbols.some((s) => s.kind === "component")) return "component";
  if (symbols.some((s) => s.kind === "class")) return "class";
  if (SERVICE_PATH_RE.test(file.absolutePath)) return "service";
  return "utility";
}

export const FILE_KIND_SHAPE: Record<FileKind, string> = {
  entry: "diamond",
  component: "ellipse",
  class: "hexagon",
  service: "round-rectangle",
  utility: "rectangle",
};

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  entry: "Entry point",
  component: "Component",
  class: "Class",
  service: "Service",
  utility: "Utility / function",
};

// Shared across every component that shows a file's kind (GraphView, ArchitectureView, Sidebar,
// CommandPalette) so the same file always reads as the same color everywhere in the app — one
// color language, not a per-component reinvention of it. Mirrors the app's design-token hex values
// (see GraphView.tsx's comment for why Cytoscape/canvas rendering can't reference index.css's
// --cb-* custom properties directly; components using plain CSS classes instead reference the
// matching --cb-* token so both stay in sync by construction).
export const FILE_KIND_COLOR: Record<FileKind, string> = {
  entry: "#f5a524",
  component: "#4d7fff",
  class: "#a78bfa",
  service: "#22d3ee",
  utility: "#6b7280",
};
