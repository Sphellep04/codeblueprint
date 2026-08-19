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
