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
import { buildGraph, inDegrees, findCycles, findCyclePath } from "./graph";
import { computeEntryPoints } from "./entrypoints";
import { buildCodeGraph, buildFileEdges } from "./codeGraph";
import { buildModuleMetrics } from "./modules";
import { FileModel, ProjectModel, Summary, CodeGraph, ExplorerData, HotspotReport } from "./model";
import { SourceFile } from "ts-morph";

export class CodeAtlasError extends Error {}

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

function loadProject(rootDir: string): { rootAbs: string; sourceFiles: SourceFile[] } {
  const rootAbs = path.resolve(rootDir);

  if (!fs.existsSync(rootAbs)) {
    throw new CodeAtlasError(`path "${rootDir}" does not exist.`);
  }
  if (!fs.statSync(rootAbs).isDirectory()) {
    throw new CodeAtlasError(`"${rootDir}" is not a directory.`);
  }

  const project = createProject(rootAbs);
  const sourceFiles = scanSourceFiles(project, rootAbs);

  if (sourceFiles.length === 0) {
    throw new CodeAtlasError(`no JavaScript/TypeScript source files found in "${rootDir}".`);
  }

  return { rootAbs, sourceFiles };
}

function buildFileModels(rootAbs: string, sourceFiles: SourceFile[]): FileModel[] {
  const filePaths = sourceFiles.map((sf) => sf.getFilePath());
  const entryPoints = computeEntryPoints(rootAbs, filePaths);

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

export function buildProjectModel(rootDir: string): ProjectModel {
  const { rootAbs, sourceFiles } = loadProject(rootDir);

  return {
    rootDir: rootAbs,
    projectName: resolveProjectName(rootAbs),
    files: buildFileModels(rootAbs, sourceFiles),
  };
}

export function summarize(model: ProjectModel): Summary {
  const edgesByNode = new Map<string, string[]>(model.files.map((f) => [f.absolutePath, f.internalDependencies]));
  const graph = buildGraph(
    model.files.map((f) => f.absolutePath),
    edgesByNode
  );

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

export function runExplorerData(rootDir: string): ExplorerData {
  const { rootAbs, sourceFiles } = loadProject(rootDir);
  return {
    rootDir: rootAbs,
    projectName: resolveProjectName(rootAbs),
    files: buildFileModels(rootAbs, sourceFiles),
    edges: buildFileEdges(sourceFiles, rootAbs),
  };
}

const TOP_HOTSPOTS = 10;

export function runHotspotReport(rootDir: string): HotspotReport {
  const { rootAbs, sourceFiles } = loadProject(rootDir);
  const files = buildFileModels(rootAbs, sourceFiles);
  const edges = buildFileEdges(sourceFiles, rootAbs);

  const edgesByNode = new Map<string, string[]>(files.map((f) => [f.absolutePath, f.internalDependencies]));
  const graph = buildGraph(
    files.map((f) => f.absolutePath),
    edgesByNode
  );
  const degrees = inDegrees(graph);

  const hotspots = files
    .map((f) => ({ filePath: f.absolutePath, dependents: degrees.get(f.absolutePath) ?? 0 }))
    .filter((h) => h.dependents > 0)
    .sort((a, b) => b.dependents - a.dependents || a.filePath.localeCompare(b.filePath))
    .slice(0, TOP_HOTSPOTS);

  const cycles = findCycles(graph).map((members) => ({ files: findCyclePath(members, graph) }));

  return {
    rootDir: rootAbs,
    projectName: resolveProjectName(rootAbs),
    hotspots,
    cycles,
    modules: buildModuleMetrics(files, edges, rootAbs),
  };
}
