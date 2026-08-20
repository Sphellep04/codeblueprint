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
