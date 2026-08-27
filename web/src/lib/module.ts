import { relativePath } from "./paths";

export const ROOT_MODULE_NAME = "(root)";

/** Client-side port of src/modules.ts's moduleNameForFile — same top-level-directory rule
 * (stripping a leading "src" segment first), reusing relativePath instead of node's `path` module
 * (this is browser code). Kept in sync by hand since web/ and the CLI don't share a compilation
 * context — see web/src/types.ts's comment for why that's the established pattern here. */
export function moduleNameForFile(absolutePath: string, rootDir: string): string {
  const rel = relativePath(absolutePath, rootDir);
  const segments = rel.split("/").filter(Boolean);
  const base = segments[0] === "src" ? segments.slice(1) : segments;
  return base.length > 1 ? base[0] : ROOT_MODULE_NAME;
}
