export interface FileModel {
  absolutePath: string;
  importCount: number;
  exportCount: number;
  functionCount: number;
  classCount: number;
  componentCount: number;
  /** Sum of McCabe cyclomatic complexity across every function/method in this file. */
  complexityTotal: number;
  /** Absolute paths of internal (non-node_modules) files this file depends on. */
  internalDependencies: string[];
  isEntryPoint: boolean;
}

export interface ProjectModel {
  rootDir: string;
  projectName: string;
  files: FileModel[];
}

export interface CycleGroup {
  /** Absolute paths of the files forming this strongly-connected cluster. */
  files: string[];
}

export interface Summary {
  projectName: string;
  files: number;
  components: number;
  functions: number;
  classes: number;
  imports: number;
  exports: number;
  /** Sum of every file's complexityTotal. Not printed by report.ts's plain-text output today — see --hotspots. */
  complexity: number;
  circularDeps: number;
  orphanFiles: number;
  /** Retained for a future --json/--verbose mode; not printed by report.ts today. */
  cycles: CycleGroup[];
  orphanFilePaths: string[];
}

export type SymbolKind = "function" | "method" | "class" | "component";

export interface SymbolModel {
  /** Deterministic within one analysis run: `${filePath}#${name}:${declarationLine}`. */
  id: string;
  /** "default" for an anonymous default export. */
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  exported: boolean;
}

export type FileEdgeKind = "import" | "reExport";

export interface FileEdge {
  kind: FileEdgeKind;
  from: string;
  to: string;
}

/** File-to-symbol: an import statement isn't itself a symbol. */
export interface ImportEdge {
  file: string;
  symbol: string;
}

export type UsageKind = "calls" | "renders";

/** Symbol-to-symbol: the "from" is always a real declared symbol whose body contains the usage site. */
export interface SymbolUsageEdge {
  kind: UsageKind;
  from: string;
  to: string;
}

export interface CodeGraph {
  files: FileEdge[];
  symbols: SymbolModel[];
  imports: ImportEdge[];
  usages: SymbolUsageEdge[];
}

/**
 * File-level data for the --serve Explorer UI: every scanned file (including orphans, which have
 * zero edges and so never appear in CodeGraph.files) plus the import/re-export edges between them.
 */
export interface ExplorerData {
  rootDir: string;
  projectName: string;
  files: FileModel[];
  edges: FileEdge[];
}

export interface FileHotspot {
  filePath: string;
  /** How many other files import this one — in-degree in the file dependency graph. */
  dependents: number;
}

/** An edge-ordered walk through one circular-dependency cluster: files[0] -> files[1] -> ... -> files[0]. */
export interface CyclePath {
  files: string[];
}

/**
 * Raw (not display-normalized) coupling/complexity/dependency numbers for one module — see
 * src/modules.ts for how these are computed and why each formula was chosen.
 */
export interface ModuleMetrics {
  name: string;
  fileCount: number;
  dependencyCount: number;
  coupling: number;
  complexityAverage: number;
}

export interface HotspotReport {
  rootDir: string;
  projectName: string;
  hotspots: FileHotspot[];
  cycles: CyclePath[];
  modules: ModuleMetrics[];
}

export interface ImpactReport {
  rootDir: string;
  projectName: string;
  targetFile: string;
  /** Full transitive closure of dependents, NOT including targetFile itself. */
  impactedFiles: string[];
  /** Subset of impactedFiles that are routes — see entrypoints.ts's computeRoutes. */
  impactedRoutes: string[];
}

export interface DiffImpactFileBreakdown {
  file: string;
  /** Size of this one file's own (not the union's) impact set — lets the caller see which specific
   * change is the risky one, since the top-level impactedFiles below is a deduped union. */
  impactedCount: number;
}

/**
 * Same shape/intent as ImpactReport, but for every file git reports as changed at once (see
 * git.ts's getChangedFiles) rather than one manually-picked target — "what does my actual
 * uncommitted work touch right now," not "what does this one file touch."
 */
export interface DiffImpactReport {
  rootDir: string;
  projectName: string;
  /** Absolute paths, as returned by getChangedFiles — empty if nothing is changed or this isn't a git repo. */
  changedFiles: string[];
  /** Deduped union of every changed file's own transitive impact set. Never includes a changedFiles entry. */
  impactedFiles: string[];
  /** Subset of impactedFiles that are routes — see entrypoints.ts's computeRoutes. */
  impactedRoutes: string[];
  perFile: DiffImpactFileBreakdown[];
}
