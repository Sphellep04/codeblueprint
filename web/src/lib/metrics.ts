import type { FileEdge, FileModel } from "../types";

export function incomingEdgeCount(edges: FileEdge[], filePath: string): number {
  return edges.filter((e) => e.to === filePath).length;
}

export function outgoingEdgeCount(edges: FileEdge[], filePath: string): number {
  return edges.filter((e) => e.from === filePath).length;
}

/** Same rule orchestrator.ts's summarize() uses server-side: zero incoming edges and not
 * recognized as an entry point. Recomputed client-side from data already fetched, rather than
 * requiring a dedicated endpoint. */
export function isOrphan(edges: FileEdge[], file: FileModel): boolean {
  return !file.isEntryPoint && incomingEdgeCount(edges, file.absolutePath) === 0;
}

export function orphanFiles(files: FileModel[], edges: FileEdge[]): FileModel[] {
  return files.filter((f) => isOrphan(edges, f));
}
