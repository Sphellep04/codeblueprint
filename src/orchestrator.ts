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
} from "./analyzer";
import { countComponents } from "./componentHeuristics";
import { buildGraph, inDegrees, findCycles } from "./graph";
import { computeEntryPoints } from "./entrypoints";
import { buildCodeGraph } from "./codeGraph";
import { FileModel, ProjectModel, Summary, CodeGraph } from "./model";
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

export function buildProjectModel(rootDir: string): ProjectModel {
  const { rootAbs, sourceFiles } = loadProject(rootDir);

  const filePaths = sourceFiles.map((sf) => sf.getFilePath());
  const entryPoints = computeEntryPoints(rootAbs, filePaths);

  const files: FileModel[] = sourceFiles.map((sf) => {
    const functionCandidates = getFunctionCandidates(sf);
    return {
      absolutePath: sf.getFilePath(),
      importCount: countImports(sf),
      exportCount: countExports(sf),
      functionCount: functionCandidates.length,
      classCount: countClasses(sf),
      componentCount: countComponents(sf, functionCandidates),
      internalDependencies: getInternalDependencies(sf, rootAbs),
      isEntryPoint: entryPoints.has(sf.getFilePath()),
    };
  });

  return {
    rootDir: rootAbs,
    projectName: resolveProjectName(rootAbs),
    files,
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
