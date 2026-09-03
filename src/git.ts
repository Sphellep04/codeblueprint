import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "child_process";
import * as path from "path";

function isUnderOrEqual(fileAbs: string, rootAbs: string): boolean {
  const normalizedRoot = rootAbs.replace(/\\/g, "/").replace(/\/$/, "");
  return fileAbs === normalizedRoot || fileAbs.startsWith(normalizedRoot + "/");
}

/**
 * Absolute paths of every file git considers changed and relevant to rootAbs right now: staged +
 * unstaged modifications to tracked files (`git diff --name-only HEAD`) plus untracked files (`git
 * status --porcelain`, "??" entries). Deliberately never throws — returns [] if rootAbs isn't inside
 * a git repo, git isn't installed, or there's no HEAD yet (a brand-new repo with no commits) — the
 * same safe-failure-mode philosophy used throughout this codebase (a dropped result is fine; a wrong
 * one isn't). execFile-style argument arrays are used throughout, never a shell string, so a file
 * path can never be interpreted as a shell metacharacter.
 *
 * git reports diff/status paths relative to the repo's *toplevel*, not the cwd git was invoked
 * from — resolving them against rootAbs directly would be wrong (and silently so — the malformed
 * path just fails to match a scanned file and gets dropped downstream) whenever rootAbs is a
 * subdirectory of a larger repo, e.g. codeblueprint pointed at one package of a monorepo, or at this
 * project's own fixtures/ during development. `git rev-parse --show-toplevel` gives the real base to
 * resolve against; results are then filtered back down to files actually under rootAbs, so a
 * subdirectory scan never reports changes from unrelated parts of the same repo.
 *
 * Known gap, same spirit as the CommonJS/tsconfig-exports limitations documented in the README: a
 * renamed file's "old -> new" status line resolves to its new path only; deleted files (which have
 * no on-disk content to analyze) are naturally dropped when resolveKnownFile can't find them.
 */
export function getChangedFiles(rootAbs: string): string[] {
  try {
    // stdin/stderr ignored: this is a background query, not an interactive git invocation, and a
    // caller like --mcp must never have unrelated subprocess chatter leak into its own stderr.
    const execOpts: ExecFileSyncOptionsWithStringEncoding = {
      cwd: rootAbs,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    };

    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], execOpts).trim();
    const diffOutput = execFileSync("git", ["diff", "--name-only", "HEAD"], execOpts);
    const statusOutput = execFileSync("git", ["status", "--porcelain"], execOpts);

    const fromDiff = diffOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    // Porcelain lines are a fixed-width "XY " status prefix followed by the path — trimming before
    // slicing would eat the leading status-code space on the very common " M file.ts" case (clean
    // index, modified worktree), shifting the slice and clipping the path's first character. Only
    // strip a trailing \r (if any); the leading two status characters must stay untouched.
    const fromStatus = statusOutput
      .split("\n")
      .map((line) => line.replace(/\r$/, ""))
      .filter((line) => line.length > 0)
      .map((line) => {
        const rest = line.slice(3);
        const arrowIdx = rest.indexOf(" -> ");
        return arrowIdx === -1 ? rest : rest.slice(arrowIdx + 4);
      });

    const relativePaths = new Set([...fromDiff, ...fromStatus]);
    return Array.from(relativePaths)
      .map((p) => path.resolve(repoRoot, p).replace(/\\/g, "/"))
      .filter((abs) => isUnderOrEqual(abs, rootAbs));
  } catch {
    return [];
  }
}
