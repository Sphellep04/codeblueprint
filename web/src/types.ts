// Mirrors src/model.ts's ExplorerData/FileModel/FileEdge. web/ and the CLI are separate TS
// compilation contexts (different tsconfig, different module targets), so this is a small,
// deliberately duplicated contract rather than a cross-package import — keep it in sync by hand.

export interface FileModel {
  absolutePath: string;
  importCount: number;
  exportCount: number;
  functionCount: number;
  classCount: number;
  componentCount: number;
  complexityTotal: number;
  internalDependencies: string[];
  isEntryPoint: boolean;
}

export type FileEdgeKind = "import" | "reExport";

export interface FileEdge {
  kind: FileEdgeKind;
  from: string;
  to: string;
}

export interface ExplorerData {
  rootDir: string;
  projectName: string;
  files: FileModel[];
  edges: FileEdge[];
}

export interface FileHotspot {
  filePath: string;
  dependents: number;
}

export interface CyclePath {
  files: string[];
}

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
  impactedFiles: string[];
  impactedRoutes: string[];
}
