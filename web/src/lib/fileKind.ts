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
