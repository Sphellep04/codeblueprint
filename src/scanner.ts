import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import { Project, SourceFile } from "ts-morph";

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",
  "**/.git/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.cache/**",
];

const SOURCE_GLOB = "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}";

/**
 * Adds all matching source files under rootDir to the project, applying the
 * default ignore list plus the project's own .gitignore (if present) on top.
 * Declaration files (*.d.ts) are excluded since they aren't implementation code.
 */
export function scanSourceFiles(project: Project, rootDir: string): SourceFile[] {
  const patterns = [path.join(rootDir, SOURCE_GLOB).replace(/\\/g, "/"), ...DEFAULT_EXCLUDES.map((p) => "!" + p)];

  const gitignorePath = path.join(rootDir, ".gitignore");
  let ig: ReturnType<typeof ignore> | null = null;
  if (fs.existsSync(gitignorePath)) {
    ig = ignore().add(fs.readFileSync(gitignorePath, "utf8"));
  }

  project.addSourceFilesAtPaths(patterns);

  const rootAbs = path.resolve(rootDir);
  const files = project.getSourceFiles().filter((sf) => {
    if (sf.isDeclarationFile()) return false;
    if (ig) {
      const rel = path.relative(rootAbs, sf.getFilePath()).replace(/\\/g, "/");
      if (rel.startsWith("..")) return true;
      if (ig.ignores(rel)) return false;
    }
    return true;
  });

  // Remove any files filtered out by .gitignore from the ts-morph project too,
  // so downstream traversal only sees the files we're actually reporting on.
  const keep = new Set(files.map((f) => f.getFilePath()));
  for (const sf of project.getSourceFiles()) {
    if (!keep.has(sf.getFilePath())) {
      project.removeSourceFile(sf);
    }
  }

  return files;
}
