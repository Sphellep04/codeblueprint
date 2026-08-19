import * as fs from "fs";
import * as path from "path";
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind } from "ts-morph";
import { JsxEmit } from "typescript";

/**
 * Builds a ts-morph Project rooted at `rootDir`. Prefers a real tsconfig.json so
 * baseUrl/paths aliases and allowJs/jsx settings are honored by the language
 * service's module resolution. Falls back to virtual compiler options for plain
 * JS projects or malformed configs so the CLI never crashes on a missing/broken
 * tsconfig.
 */
export function createProject(rootDir: string): Project {
  const tsConfigPath = path.join(rootDir, "tsconfig.json");

  if (fs.existsSync(tsConfigPath)) {
    try {
      return new Project({
        tsConfigFilePath: tsConfigPath,
        skipAddingFilesFromTsConfig: true,
      });
    } catch (err) {
      process.stderr.write(
        `Warning: failed to parse ${tsConfigPath} (${(err as Error).message}); falling back to default compiler options.\n`
      );
    }
  }

  return new Project({
    compilerOptions: {
      allowJs: true,
      jsx: JsxEmit.ReactJSX,
      target: ScriptTarget.ES2020,
      module: ModuleKind.CommonJS,
      moduleResolution: ModuleResolutionKind.Node10,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  });
}
