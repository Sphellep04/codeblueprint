export interface FileModel {
  absolutePath: string;
  importCount: number;
  exportCount: number;
  functionCount: number;
  classCount: number;
  componentCount: number;
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
