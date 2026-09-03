import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";

/**
 * Reads rootAbs's own package.json "workspaces" field, supporting both npm's plain array form
 * (["packages/*"]) and yarn's object form ({"packages": ["packages/*"]}). Returns null if the field
 * is absent or the file doesn't parse — "no workspace field" and "malformed package.json" are both
 * "not a workspace," not an error; this mirrors the rest of the codebase's other automatic
 * detections (tsconfig.json, .gitignore), which fail safe rather than throwing on a missing/bad file.
 */
export function parseWorkspacePatterns(rootAbs: string): string[] | null {
  const pkgPath = path.join(rootAbs, "package.json");
  if (!fs.existsSync(pkgPath)) return null;

  let pkg: any;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return null;
  }

  const workspaces = pkg.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces.filter((p): p is string => typeof p === "string");
  }
  if (workspaces && typeof workspaces === "object" && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((p: unknown): p is string => typeof p === "string");
  }
  return null;
}

/**
 * Reads rootAbs's own pnpm-workspace.yaml "packages" field — pnpm's own workspace config format,
 * not read from package.json at all. Same safe-fail contract as parseWorkspacePatterns: returns null
 * (never throws) if the file is absent or doesn't parse as valid YAML, or if "packages" isn't an
 * array of strings. Uses a real YAML parser (the `yaml` package) rather than a hand-rolled one — a
 * hand-rolled parser risks silently producing a wrong package set on a malformed/partial parse,
 * which would be worse than this project's usual safe-failure-mode of simply not detecting a
 * workspace at all.
 */
export function parsePnpmWorkspacePatterns(rootAbs: string): string[] | null {
  const yamlPath = path.join(rootAbs, "pnpm-workspace.yaml");
  if (!fs.existsSync(yamlPath)) return null;

  let doc: unknown;
  try {
    doc = parseYaml(fs.readFileSync(yamlPath, "utf8"));
  } catch {
    return null;
  }

  if (!doc || typeof doc !== "object" || !("packages" in doc)) return null;
  const packages = (doc as { packages: unknown }).packages;
  if (!Array.isArray(packages)) return null;
  return packages.filter((p): p is string => typeof p === "string");
}

/**
 * Expands one workspace pattern into the package directories it matches. Only a single trailing
 * "*" segment (e.g. "packages/*") is supported — realistically the only form workspace fields ever
 * use in practice — falling back to treating the pattern as a literal directory otherwise. "**",
 * mid-path wildcards, and brace expansion are deliberately not supported; a pattern using them
 * resolves to nothing rather than guessing. A matched directory only counts as a real package if it
 * has its own package.json, matching how npm/yarn actually determine workspace membership.
 */
export function expandPattern(workspaceRootAbs: string, pattern: string): string[] {
  const segments = pattern.split("/");
  const isSingleTrailingStar = segments[segments.length - 1] === "*" && !segments.slice(0, -1).some((s) => s.includes("*"));

  if (!isSingleTrailingStar) {
    const literal = path.join(workspaceRootAbs, pattern);
    return fs.existsSync(literal) && fs.statSync(literal).isDirectory() && fs.existsSync(path.join(literal, "package.json"))
      ? [literal]
      : [];
  }

  const parentDir = path.join(workspaceRootAbs, ...segments.slice(0, -1));
  if (!fs.existsSync(parentDir)) return [];

  return fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "node_modules")
    .map((d) => path.join(parentDir, d.name))
    .filter((dir) => fs.existsSync(path.join(dir, "package.json")));
}

/**
 * Detects whether rootAbs is a workspace root and, if so, returns every discovered package
 * directory (deduplicated, absolute paths) — rootAbs itself is NOT included, since it's the
 * workspace root, not one of its packages. Checks npm/yarn's package.json "workspaces" field first;
 * if that's absent, falls back to pnpm-workspace.yaml. Returns null when rootAbs matches neither, in
 * which case callers should treat this as an ordinary single-package project.
 */
export function detectWorkspace(rootAbs: string): string[] | null {
  const patterns = parseWorkspacePatterns(rootAbs) ?? parsePnpmWorkspacePatterns(rootAbs);
  if (!patterns) return null;

  const packageRoots = new Set<string>();
  for (const pattern of patterns) {
    for (const dir of expandPattern(rootAbs, pattern)) {
      packageRoots.add(dir);
    }
  }
  return Array.from(packageRoots).sort();
}
