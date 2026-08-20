import * as path from "path";
import { FileModel, FileEdge, ModuleMetrics } from "./model";

export const ROOT_MODULE_NAME = "(root)";

/**
 * Module = top-level directory relative to rootDir, stripping a leading "src" segment first if
 * present — so `src/billing/x.ts` -> "billing", but `pages/x.ts` (a sibling of src/) -> "pages".
 * A file with nothing left after that (a root-level file, or one directly under src/) buckets
 * into ROOT_MODULE_NAME. One rule handles both "has a src/ dir" and "doesn't" uniformly.
 */
export function moduleNameForFile(absolutePath: string, rootAbs: string): string {
  const rel = path.relative(rootAbs, absolutePath).replace(/\\/g, "/");
  const segments = rel.split("/").filter(Boolean);
  const base = segments[0] === "src" ? segments.slice(1) : segments;
  return base.length > 1 ? base[0] : ROOT_MODULE_NAME;
}

/**
 * Per-module coupling/complexity/dependency metrics. Coupling is afferent + efferent cross-module
 * file-level edges (an edge whose `from`/`to` land in different modules increments the source
 * module's efferent count and the target module's afferent count); complexity is the module's
 * average per-file complexityTotal (not a sum, so a module isn't penalized just for having more
 * files); dependencies is the sum of each file's importCount. All three are raw numbers — display
 * normalization (bars, percentages) is left to report.ts / the Explorer UI, not computed here.
 */
export function buildModuleMetrics(files: FileModel[], edges: FileEdge[], rootAbs: string): ModuleMetrics[] {
  const moduleOf = new Map(files.map((f) => [f.absolutePath, moduleNameForFile(f.absolutePath, rootAbs)]));

  const byModule = new Map<string, FileModel[]>();
  for (const f of files) {
    const name = moduleOf.get(f.absolutePath)!;
    if (!byModule.has(name)) byModule.set(name, []);
    byModule.get(name)!.push(f);
  }

  const crossCounts = new Map<string, { ca: number; ce: number }>();
  const bump = (name: string, key: "ca" | "ce") => {
    const c = crossCounts.get(name) ?? { ca: 0, ce: 0 };
    c[key]++;
    crossCounts.set(name, c);
  };
  for (const edge of edges) {
    const from = moduleOf.get(edge.from);
    const to = moduleOf.get(edge.to);
    if (!from || !to || from === to) continue;
    bump(from, "ce");
    bump(to, "ca");
  }

  return Array.from(byModule.entries())
    .map(([name, moduleFiles]) => {
      const c = crossCounts.get(name) ?? { ca: 0, ce: 0 };
      const complexityTotal = moduleFiles.reduce((sum, f) => sum + f.complexityTotal, 0);
      return {
        name,
        fileCount: moduleFiles.length,
        dependencyCount: moduleFiles.reduce((sum, f) => sum + f.importCount, 0),
        coupling: c.ca + c.ce,
        complexityAverage: complexityTotal / moduleFiles.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
