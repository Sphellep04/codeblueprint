import * as fs from "fs";
import * as path from "path";

const INDEX_CANDIDATES = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mts", "index.cts", "index.mjs", "index.cjs"];
const CONVENTIONAL_ENTRY_BASENAMES = ["main.ts", "main.js"];
const RESOLVABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

const APP_ROUTER_FILES = new Set([
  "page.tsx",
  "page.ts",
  "page.jsx",
  "page.js",
  "layout.tsx",
  "layout.ts",
  "loading.tsx",
  "loading.ts",
  "error.tsx",
  "error.ts",
  "not-found.tsx",
  "not-found.ts",
  "route.ts",
  "route.tsx",
  "template.tsx",
  "template.ts",
  "default.tsx",
  "default.ts",
  "middleware.ts",
  "middleware.js",
]);

const TEST_FILE_RE = /\.(test|spec)\.(js|jsx|ts|tsx)$/;
const STORY_FILE_RE = /\.stories\.(js|jsx|ts|tsx|mjs|cjs)$/;
const CONFIG_FILE_RE = /\.config\.(js|ts|cjs|mjs)$/;

/** ts-morph's SourceFile.getFilePath() always returns forward-slash paths, even on
 * Windows, while path.resolve/path.join produce backslash paths there — normalize
 * everything to forward slashes so Set membership checks against ts-morph paths work. */
function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function resolveModuleField(rootAbs: string, value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const base = path.resolve(rootAbs, value);
  const candidates = [base, ...RESOLVABLE_EXTENSIONS.map((ext) => base + ext), ...INDEX_CANDIDATES.map((f) => path.join(base, f))];
  const match = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  return match ? toPosix(match) : undefined;
}

function resolvePackageJsonEntryPoints(rootAbs: string): Set<string> {
  const entries = new Set<string>();
  const pkgPath = path.join(rootAbs, "package.json");
  if (!fs.existsSync(pkgPath)) return entries;

  let pkg: any;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return entries;
  }

  for (const field of ["main", "module", "browser"]) {
    const resolved = resolveModuleField(rootAbs, pkg[field]);
    if (resolved) entries.add(resolved);
  }

  if (pkg.exports) {
    const dot = typeof pkg.exports === "string" ? pkg.exports : pkg.exports["."];
    if (typeof dot === "string") {
      const resolved = resolveModuleField(rootAbs, dot);
      if (resolved) entries.add(resolved);
    } else if (dot && typeof dot === "object") {
      for (const v of Object.values(dot)) {
        const resolved = resolveModuleField(rootAbs, v);
        if (resolved) entries.add(resolved);
      }
    }
  }

  if (pkg.bin) {
    const binValues = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin);
    for (const v of binValues) {
      const resolved = resolveModuleField(rootAbs, v);
      if (resolved) entries.add(resolved);
    }
  }

  return entries;
}

/** True for Next.js `pages/**` files and `app/**` files matching APP_ROUTER_FILES — the files a
 * developer actually ships as application routes, as distinct from test/config files and
 * package.json entries, which are also entry points (see computeEntryPoints) but not routes. */
function isRouteFile(rootAbs: string, filePath: string): boolean {
  const rel = toPosix(path.relative(rootAbs, filePath));
  const basename = path.basename(filePath);

  if (rel.startsWith("pages/") || rel.includes("/pages/")) return true;
  if ((rel.startsWith("app/") || rel.includes("/app/")) && APP_ROUTER_FILES.has(basename)) return true;
  return false;
}

/** Subset of computeEntryPoints' result that's genuinely a route — see isRouteFile. */
export function computeRoutes(rootAbs: string, filePaths: string[]): Set<string> {
  const routes = new Set<string>();
  for (const filePath of filePaths) {
    if (isRouteFile(rootAbs, filePath)) routes.add(filePath);
  }
  return routes;
}

/**
 * Determines whether an absolute file path should be treated as an entry point
 * (never flagged as orphaned) even with zero internal importers.
 *
 * packageRoots defaults to [rootAbs] — the ordinary single-package case, unchanged from before this
 * parameter existed. For a monorepo, callers pass every discovered workspace package's root
 * alongside rootAbs, so each package's own package.json/index files are recognized as its entry
 * points too — otherwise, e.g., an app package nothing else imports (apps are typically leaves,
 * never re-imported by a sibling) would be misreported as an orphan just because it isn't nested
 * directly under rootAbs itself.
 */
export function computeEntryPoints(rootAbs: string, filePaths: string[], packageRoots: string[] = [rootAbs]): Set<string> {
  const entries = new Set<string>();

  for (const packageRoot of packageRoots) {
    for (const e of resolvePackageJsonEntryPoints(packageRoot)) entries.add(e);

    for (const dir of [packageRoot, path.join(packageRoot, "src")]) {
      for (const name of [...INDEX_CANDIDATES, ...CONVENTIONAL_ENTRY_BASENAMES]) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) entries.add(toPosix(candidate));
      }
    }
  }

  for (const filePath of filePaths) {
    const rel = toPosix(path.relative(rootAbs, filePath));
    const basename = path.basename(filePath);

    if (isRouteFile(rootAbs, filePath)) {
      entries.add(filePath);
      continue;
    }

    if (basename === "middleware.ts" || basename === "middleware.js") {
      entries.add(filePath);
      continue;
    }

    if (TEST_FILE_RE.test(basename) || rel.includes("__tests__/")) {
      entries.add(filePath);
      continue;
    }

    if (STORY_FILE_RE.test(basename)) {
      entries.add(filePath);
      continue;
    }

    if (packageRoots.some((pr) => toPosix(path.dirname(filePath)) === toPosix(pr)) && CONFIG_FILE_RE.test(basename)) {
      entries.add(filePath);
      continue;
    }
  }

  return entries;
}
