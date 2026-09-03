import * as fs from "fs";
import * as path from "path";
import { createProject } from "./projectFactory";
import { scanSourceFiles } from "./scanner";
import {
  countImports,
  countExports,
  countFunctions,
  countClasses,
  getFunctionCandidates,
  getInternalDependencies,
  getCyclomaticComplexity,
} from "./analyzer";
import { countComponents } from "./componentHeuristics";
import { buildGraph, inDegrees, findCycles, findCyclePath, findDependentsFromReverse, reverseGraph, DependencyGraph } from "./graph";
import { computeEntryPoints, computeRoutes } from "./entrypoints";
import { detectWorkspace } from "./workspace";
import { buildCodeGraph, buildFileEdges } from "./codeGraph";
import { buildModuleMetrics } from "./modules";
import {
  FileModel,
  ProjectModel,
  Summary,
  CodeGraph,
  ExplorerData,
  HotspotReport,
  ImpactReport,
  DiffImpactReport,
  FileEdge,
  SymbolModel,
} from "./model";
import { SourceFile } from "ts-morph";
import { getChangedFiles } from "./git";

export class CodeBlueprintError extends Error {}

function resolveProjectName(rootAbs: string): string {
  const pkgPath = path.join(rootAbs, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (typeof pkg.name === "string" && pkg.name.length > 0) return pkg.name;
    } catch {
      // fall through to directory basename
    }
  }
  return path.basename(rootAbs);
}

function loadProject(rootDir: string): { rootAbs: string; sourceFiles: SourceFile[]; packageRoots: string[] } {
  const rootAbs = path.resolve(rootDir);

  if (!fs.existsSync(rootAbs)) {
    throw new CodeBlueprintError(`path "${rootDir}" does not exist.`);
  }
  if (!fs.statSync(rootAbs).isDirectory()) {
    throw new CodeBlueprintError(`"${rootDir}" is not a directory.`);
  }

  const project = createProject(rootAbs);
  const sourceFiles = scanSourceFiles(project, rootAbs);

  if (sourceFiles.length === 0) {
    throw new CodeBlueprintError(`no JavaScript/TypeScript source files found in "${rootDir}".`);
  }

  // rootAbs's own scan already picks up every nested workspace package's files (the glob is
  // recursive and isInternalDependency's boundary already covers anything under rootAbs) — the one
  // thing workspace detection actually changes is which directories count as package roots for
  // entry-point purposes (see entrypoints.ts's computeEntryPoints), so a workspace package's own
  // index/package.json-main file isn't misreported as an orphan just because it isn't importable
  // from anywhere else and isn't nested under rootAbs's own package.json.
  const workspacePackages = detectWorkspace(rootAbs);
  const packageRoots = workspacePackages ? [rootAbs, ...workspacePackages] : [rootAbs];

  return { rootAbs, sourceFiles, packageRoots };
}

function buildFileModels(rootAbs: string, sourceFiles: SourceFile[], packageRoots: string[]): FileModel[] {
  const filePaths = sourceFiles.map((sf) => sf.getFilePath());
  const entryPoints = computeEntryPoints(rootAbs, filePaths, packageRoots);

  return sourceFiles.map((sf) => {
    const functionCandidates = getFunctionCandidates(sf);
    return {
      absolutePath: sf.getFilePath(),
      importCount: countImports(sf),
      exportCount: countExports(sf),
      functionCount: functionCandidates.length,
      classCount: countClasses(sf),
      componentCount: countComponents(sf, functionCandidates),
      complexityTotal: functionCandidates.reduce((sum, c) => sum + getCyclomaticComplexity(c.node), 0),
      internalDependencies: getInternalDependencies(sf, rootAbs),
      isEntryPoint: entryPoints.has(sf.getFilePath()),
    };
  });
}

/** File-level dependency graph built from FileModel.internalDependencies — the "what does each
 * file import" edge set every report derives its own graph algorithms from. Factored out once so
 * summarize/runHotspotReport/buildImpactContext (and, via loadServerData, the Explorer server)
 * all build it identically instead of each writing out the same two-line edgesByNode/buildGraph
 * block. */
function buildFileGraph(files: FileModel[]): DependencyGraph {
  const edgesByNode = new Map<string, string[]>(files.map((f) => [f.absolutePath, f.internalDependencies]));
  return buildGraph(
    files.map((f) => f.absolutePath),
    edgesByNode
  );
}

/** The result of one project parse: everything every report is derived from, computed exactly
 * once. Each CLI entry point below still calls this independently (a CLI process only ever runs
 * one mode, so there's nothing to share across calls that never happen together) — but
 * loadServerData calls it exactly once and derives all three server endpoints' data from the same
 * ProjectContext, which is where a repeated project parse would otherwise actually cost something. */
interface ProjectContext {
  rootAbs: string;
  projectName: string;
  sourceFiles: SourceFile[];
  files: FileModel[];
}

function buildProjectContext(rootDir: string): ProjectContext {
  const { rootAbs, sourceFiles, packageRoots } = loadProject(rootDir);
  return { rootAbs, projectName: resolveProjectName(rootAbs), sourceFiles, files: buildFileModels(rootAbs, sourceFiles, packageRoots) };
}

export function buildProjectModel(rootDir: string): ProjectModel {
  const ctx = buildProjectContext(rootDir);
  return { rootDir: ctx.rootAbs, projectName: ctx.projectName, files: ctx.files };
}

export function summarize(model: ProjectModel): Summary {
  const graph = buildFileGraph(model.files);

  const degrees = inDegrees(graph);
  const orphanFilePaths = model.files.filter((f) => !f.isEntryPoint && (degrees.get(f.absolutePath) ?? 0) === 0).map((f) => f.absolutePath);

  const cycles = findCycles(graph).map((files) => ({ files }));

  return {
    projectName: model.projectName,
    files: model.files.length,
    components: sum(model.files, (f) => f.componentCount),
    functions: sum(model.files, (f) => f.functionCount),
    classes: sum(model.files, (f) => f.classCount),
    imports: sum(model.files, (f) => f.importCount),
    exports: sum(model.files, (f) => f.exportCount),
    complexity: sum(model.files, (f) => f.complexityTotal),
    circularDeps: cycles.length,
    orphanFiles: orphanFilePaths.length,
    cycles,
    orphanFilePaths,
  };
}

function sum(files: FileModel[], pick: (f: FileModel) => number): number {
  return files.reduce((acc, f) => acc + pick(f), 0);
}

export function runAnalysis(rootDir: string): Summary {
  const model = buildProjectModel(rootDir);
  return summarize(model);
}

export function runGraphAnalysis(rootDir: string): CodeGraph {
  const { rootAbs, sourceFiles } = loadProject(rootDir);
  return buildCodeGraph(sourceFiles, rootAbs);
}

function deriveExplorerData(ctx: ProjectContext, edges: FileEdge[]): ExplorerData {
  return { rootDir: ctx.rootAbs, projectName: ctx.projectName, files: ctx.files, edges };
}

export function runExplorerData(rootDir: string): ExplorerData {
  const ctx = buildProjectContext(rootDir);
  return deriveExplorerData(ctx, buildFileEdges(ctx.sourceFiles, ctx.rootAbs));
}

const TOP_HOTSPOTS = 10;

function deriveHotspotReport(ctx: ProjectContext, edges: FileEdge[], graph: DependencyGraph): HotspotReport {
  const degrees = inDegrees(graph);

  const hotspots = ctx.files
    .map((f) => ({ filePath: f.absolutePath, dependents: degrees.get(f.absolutePath) ?? 0 }))
    .filter((h) => h.dependents > 0)
    .sort((a, b) => b.dependents - a.dependents || a.filePath.localeCompare(b.filePath))
    .slice(0, TOP_HOTSPOTS);

  const cycles = findCycles(graph).map((members) => ({ files: findCyclePath(members, graph) }));

  return {
    rootDir: ctx.rootAbs,
    projectName: ctx.projectName,
    hotspots,
    cycles,
    modules: buildModuleMetrics(ctx.files, edges, ctx.rootAbs),
  };
}

export function runHotspotReport(rootDir: string): HotspotReport {
  const ctx = buildProjectContext(rootDir);
  const edges = buildFileEdges(ctx.sourceFiles, ctx.rootAbs);
  return deriveHotspotReport(ctx, edges, buildFileGraph(ctx.files));
}

interface ImpactContext {
  rootAbs: string;
  projectName: string;
  files: FileModel[];
  /** Pre-reversed graph (see graph.ts's reverseGraph) — built once per ImpactContext so repeated
   * computeImpact calls against the same context (one per /api/impact request from the Explorer)
   * each do only an O(V+E) BFS, not a fresh O(V+E) reversal on top of it. */
  reverse: DependencyGraph;
  routes: Set<string>;
}

function buildImpactContextFrom(ctx: ProjectContext, graph: DependencyGraph): ImpactContext {
  return {
    rootAbs: ctx.rootAbs,
    projectName: ctx.projectName,
    files: ctx.files,
    reverse: reverseGraph(graph),
    routes: computeRoutes(
      ctx.rootAbs,
      ctx.files.map((f) => f.absolutePath)
    ),
  };
}

/**
 * Resolves a user-typed path (e.g. --impact's <file>) to one of the actually-scanned files.
 * Relative paths resolve against rootAbs (the project root the user already gave), not
 * process.cwd(), so the result doesn't depend on where codeblueprint happens to be invoked from;
 * path.resolve also collapses any ".."/"." segments regardless of whether the input was relative or
 * absolute. Falls back to a case-insensitive match if no exact match is found, since
 * Windows/macOS's case-insensitive filesystems mean a user-typed path can legitimately differ in
 * case from the on-disk casing ts-morph reports — only case itself is forgiven, not a genuinely
 * different path. Throws CodeBlueprintError, not a silent empty report, when nothing matches at all.
 */
function resolveKnownFile(files: FileModel[], rootAbs: string, targetFile: string): string {
  const normalized = path.resolve(rootAbs, targetFile).replace(/\\/g, "/");
  const match =
    files.find((f) => f.absolutePath === normalized) ?? files.find((f) => f.absolutePath.toLowerCase() === normalized.toLowerCase());
  if (!match) {
    throw new CodeBlueprintError(`"${targetFile}" does not match a scanned file in this project (looked for "${normalized}").`);
  }
  return match.absolutePath;
}

function computeImpact(ctx: ImpactContext, targetFile: string): ImpactReport {
  const resolved = resolveKnownFile(ctx.files, ctx.rootAbs, targetFile);
  const impactedFiles = findDependentsFromReverse(ctx.reverse, resolved);
  return {
    rootDir: ctx.rootAbs,
    projectName: ctx.projectName,
    targetFile: resolved,
    impactedFiles,
    impactedRoutes: impactedFiles.filter((f) => ctx.routes.has(f)),
  };
}

export function runImpactAnalysis(rootDir: string, targetFile: string): ImpactReport {
  const ctx = buildProjectContext(rootDir);
  return computeImpact(buildImpactContextFrom(ctx, buildFileGraph(ctx.files)), targetFile);
}

/** Server-only: one project parse, returning a bound closure so every /api/impact request is just
 * an O(V+E) BFS against an already-built (and already-reversed) graph — no re-parsing, and no
 * graph-reversal, per click. */
export function loadImpactContext(rootDir: string): { computeImpact: (targetFile: string) => ImpactReport } {
  const ctx = buildProjectContext(rootDir);
  const impactCtx = buildImpactContextFrom(ctx, buildFileGraph(ctx.files));
  return { computeImpact: (targetFile: string) => computeImpact(impactCtx, targetFile) };
}

/**
 * "What does my actual uncommitted work touch, right now" — the union of every git-changed file's
 * own transitive impact set, not one manually-picked target. impactedFiles/perFile both exclude any
 * other changedFiles entry from a given file's own impact walk: a file you changed is "the change,"
 * not "a downstream effect" of another change, the same way ImpactReport.impactedFiles never
 * includes targetFile itself.
 *
 * changedFiles isn't resolved through git internally here — it's the same context-building split
 * computeImpact already uses (a resolved target in, a report out) — so this stays trivially testable
 * against explicit file lists without needing a real git fixture. runDiffImpactAnalysis below is the
 * thin wrapper that actually calls getChangedFiles.
 */
function computeDiffImpact(ctx: ImpactContext, changedFiles: string[]): DiffImpactReport {
  // Resolved first, in its own pass: findDependentsFromReverse returns fully-resolved absolute
  // paths, so the exclusion filter below has to compare against resolved changed paths too — a set
  // built from the raw (possibly relative, possibly differently-cased) input strings would never
  // match, silently letting a changed file re-appear in its own union as if untouched.
  const resolvedChanged: string[] = [];
  for (const file of changedFiles) {
    try {
      resolvedChanged.push(resolveKnownFile(ctx.files, ctx.rootAbs, file));
    } catch {
      // A git-detected change (e.g. a deleted file, or one outside the scanned extensions) isn't
      // guaranteed to match a resolvable scanned file the way a user-typed --impact path is —
      // dropped, not thrown, same safe-failure-mode as every other soft edge case in this codebase.
      continue;
    }
  }
  const changedSet = new Set(resolvedChanged);

  const impactedSet = new Set<string>();
  const perFile: DiffImpactReport["perFile"] = [];
  for (const resolved of resolvedChanged) {
    const fileImpact = findDependentsFromReverse(ctx.reverse, resolved).filter((f) => !changedSet.has(f));
    perFile.push({ file: resolved, impactedCount: fileImpact.length });
    for (const f of fileImpact) impactedSet.add(f);
  }

  const impactedFiles = Array.from(impactedSet);
  return {
    rootDir: ctx.rootAbs,
    projectName: ctx.projectName,
    changedFiles: resolvedChanged,
    impactedFiles,
    impactedRoutes: impactedFiles.filter((f) => ctx.routes.has(f)),
    perFile,
  };
}

/** changedFiles defaults to the real git-detected set; the explicit-array form exists so tests can
 * exercise computeDiffImpact's union/exclusion logic without a live git fixture. */
export function runDiffImpactAnalysis(rootDir: string, changedFiles?: string[]): DiffImpactReport {
  const ctx = buildProjectContext(rootDir);
  const files = changedFiles ?? getChangedFiles(ctx.rootAbs);
  return computeDiffImpact(buildImpactContextFrom(ctx, buildFileGraph(ctx.files)), files);
}

/** Server-only: same one-parse-many-requests shape as loadImpactContext — re-reads git status on
 * every call (cheap; the project graph itself is only built once), since unlike a single-file
 * --impact target, what's "changed" can legitimately differ between two requests in the same
 * --serve session. */
export function loadDiffImpactContext(rootDir: string): { computeDiffImpact: () => DiffImpactReport } {
  const ctx = buildProjectContext(rootDir);
  const impactCtx = buildImpactContextFrom(ctx, buildFileGraph(ctx.files));
  return { computeDiffImpact: () => computeDiffImpact(impactCtx, getChangedFiles(ctx.rootAbs)) };
}

/**
 * Everything the --serve Explorer needs, from exactly one project parse. createServer previously
 * called runExplorerData/runHotspotReport/loadImpactContext independently, each doing its own full
 * ts-morph parse — three full parses (plus three separate FileModel[] builds, including the
 * getCyclomaticComplexity walk over every function) at every --serve startup. This does the parse
 * once and derives all three outputs from the same ProjectContext/graph.
 */
export function loadServerData(rootDir: string): {
  explorerData: ExplorerData;
  hotspotReport: HotspotReport;
  computeImpact: (targetFile: string) => ImpactReport;
  computeDiffImpact: () => DiffImpactReport;
  codeGraph: CodeGraph;
  resolveFile: (targetFile: string) => string;
} {
  const ctx = buildProjectContext(rootDir);
  const edges = buildFileEdges(ctx.sourceFiles, ctx.rootAbs);
  const graph = buildFileGraph(ctx.files);
  const impactCtx = buildImpactContextFrom(ctx, graph);

  return {
    explorerData: deriveExplorerData(ctx, edges),
    hotspotReport: deriveHotspotReport(ctx, edges, graph),
    computeImpact: (targetFile: string) => computeImpact(impactCtx, targetFile),
    computeDiffImpact: () => computeDiffImpact(impactCtx, getChangedFiles(ctx.rootAbs)),
    codeGraph: buildCodeGraph(ctx.sourceFiles, ctx.rootAbs),
    resolveFile: (targetFile: string) => resolveKnownFile(ctx.files, ctx.rootAbs, targetFile),
  };
}

/**
 * Backing data for the MCP server (--mcp): one project parse, then six cheap read-only query
 * functions derived from it — the same "parse once, derive many times" shape as loadServerData,
 * since an MCP server is a long-lived stdio process answering many tool calls over its lifetime,
 * not a one-shot CLI invocation. Every function here composes existing analysis primitives; no new
 * analysis logic is introduced for the MCP surface.
 */
export function loadMcpContext(rootDir: string): {
  getSummary: () => Summary;
  getFileSummary: (file: string) => FileModel;
  getDependencies: (file: string) => { dependsOn: string[]; dependents: string[] };
  findSymbol: (query: string) => SymbolModel[];
  getImpact: (file: string) => ImpactReport;
  getDiffImpact: () => DiffImpactReport;
  getHotspots: () => HotspotReport;
} {
  const ctx = buildProjectContext(rootDir);
  const edges = buildFileEdges(ctx.sourceFiles, ctx.rootAbs);
  const graph = buildFileGraph(ctx.files);
  const impactCtx = buildImpactContextFrom(ctx, graph);
  const codeGraph = buildCodeGraph(ctx.sourceFiles, ctx.rootAbs);
  const hotspotReport = deriveHotspotReport(ctx, edges, graph);

  return {
    getSummary: () => summarize({ rootDir: ctx.rootAbs, projectName: ctx.projectName, files: ctx.files }),

    getFileSummary: (file) => {
      const resolved = resolveKnownFile(ctx.files, ctx.rootAbs, file);
      return ctx.files.find((f) => f.absolutePath === resolved)!;
    },

    getDependencies: (file) => {
      const resolved = resolveKnownFile(ctx.files, ctx.rootAbs, file);
      return {
        dependsOn: ctx.files.find((f) => f.absolutePath === resolved)!.internalDependencies,
        dependents: ctx.files.filter((f) => f.internalDependencies.includes(resolved)).map((f) => f.absolutePath),
      };
    },

    findSymbol: (query) => {
      const q = query.toLowerCase();
      return codeGraph.symbols.filter((s) => s.name.toLowerCase().includes(q));
    },

    getImpact: (file) => computeImpact(impactCtx, file),

    getDiffImpact: () => computeDiffImpact(impactCtx, getChangedFiles(ctx.rootAbs)),

    getHotspots: () => hotspotReport,
  };
}
