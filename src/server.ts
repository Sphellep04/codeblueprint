import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { exec, execFile } from "child_process";
import { loadServerData, CodeBlueprintError } from "./orchestrator";

export const DEFAULT_PORT = 4787;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/**
 * Locates the built Explorer UI assets: `dist/ui` when running from the compiled CLI
 * (`dist/server.js` -> `dist/ui`), or `web/dist` when running from source via ts-node
 * (`src/server.ts` -> `../web/dist`). Returns undefined if neither has been built yet — callers
 * decide how to respond to that, rather than this throwing mid-resolution.
 */
export function resolveUiDir(): string | undefined {
  for (const candidate of [path.join(__dirname, "ui"), path.join(__dirname, "..", "web", "dist")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  return undefined;
}

/** Resolves a request path to a file inside uiDir, rejecting any attempt to escape it. */
function safeJoin(uiDir: string, urlPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    // Malformed percent-encoding (e.g. a stray "%") — treat as an unresolvable path rather than
    // letting decodeURIComponent's URIError propagate as an uncaught exception in the request handler.
    return undefined;
  }
  const target = path.normalize(path.join(uiDir, decoded));
  const root = path.normalize(uiDir + path.sep);
  if (target !== path.normalize(uiDir) && !target.startsWith(root)) return undefined;
  return target;
}

function serveStatic(uiDir: string | undefined, urlPath: string, res: http.ServerResponse): void {
  if (!uiDir || !fs.existsSync(uiDir)) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("CodeBlueprint Explorer UI assets not found — run `npm run build` first.");
    return;
  }

  const requestedPath = safeJoin(uiDir, urlPath);
  const hasExtension = path.extname(urlPath.split("?")[0]) !== "";
  const requestedFileExists = requestedPath !== undefined && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile();

  if (hasExtension && !requestedFileExists) {
    // A real missing asset (e.g. a stale reference to a renamed bundle file) — not a client route.
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  // Extensionless routes (client-side routing) and any successfully-resolved asset both fall
  // through here; requestedFileExists is false for extensionless paths, hitting the SPA fallback.
  const filePath = requestedFileExists ? requestedPath! : path.join(uiDir, "index.html");

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const contentType = MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

/**
 * Opens a file at a specific line in the user's local editor — VS Code via its `-g file:line` CLI
 * flag, falling back to the OS's default file handler if that fails (e.g. VS Code isn't installed).
 * Uses execFile, not exec, throughout: filePath is already validated against known scanned files by
 * the caller, but is still request-derived, so it's never passed through a shell. On win32, VS
 * Code's `code` launcher is `code.cmd`, a batch file — execFile/spawn without shell:true cannot run
 * `.cmd` files directly, so both the primary attempt and the fallback are routed through `cmd /c`
 * there; darwin/linux's `code`/`open`/`xdg-open` are real executables and don't need that.
 */
function defaultOpenInEditor(filePath: string, line: number): void {
  const target = `${filePath}:${line}`;
  const openWithCode =
    process.platform === "win32" ? execFile("cmd", ["/c", "code", "-g", target]) : execFile("code", ["-g", target]);

  openWithCode.on("error", () => {
    if (process.platform === "win32") execFile("cmd", ["/c", "start", "", filePath]);
    else if (process.platform === "darwin") execFile("open", [filePath]);
    else execFile("xdg-open", [filePath]);
  });
}

/**
 * Builds an unlistened HTTP server for the --serve Explorer. loadServerData does exactly one
 * project parse and derives ExplorerData/HotspotReport/CodeGraph (all served verbatim on every
 * request — the project doesn't change during the server's lifetime) plus bound
 * impact-computation/file-resolution closures (recomputed per request, since the target varies per
 * click). uiDir defaults to the auto-detected build output; tests pass an explicit directory to
 * serve fixture assets instead. openInEditor defaults to the real (process-launching)
 * implementation; tests inject a spy instead, since actually launching an editor is not something a
 * test run should ever do.
 */
export function createServer(
  rootDir: string,
  uiDir: string | undefined = resolveUiDir(),
  openInEditor: (filePath: string, line: number) => void = defaultOpenInEditor
): http.Server {
  const { explorerData, hotspotReport, computeImpact, computeDiffImpact, codeGraph, resolveFile } = loadServerData(rootDir);
  const explorerDataJson = JSON.stringify(explorerData);
  const hotspotReportJson = JSON.stringify(hotspotReport);
  const codeGraphJson = JSON.stringify(codeGraph);

  return http.createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    if (req.url === "/api/explorer-data") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(explorerDataJson);
      return;
    }

    if (req.url === "/api/hotspots") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(hotspotReportJson);
      return;
    }

    if (req.url === "/api/code-graph") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(codeGraphJson);
      return;
    }

    if (req.url === "/api/open-source" || req.url?.startsWith("/api/open-source?")) {
      const params = new URL(req.url, "http://localhost").searchParams;
      const file = params.get("file");
      if (!file) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required 'file' query parameter." }));
        return;
      }

      let resolvedPath: string;
      try {
        resolvedPath = resolveFile(file);
      } catch (err) {
        if (err instanceof CodeBlueprintError) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        throw err;
      }

      const line = Math.max(1, parseInt(params.get("line") ?? "1", 10) || 1);
      openInEditor(resolvedPath, line);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ opened: true }));
      return;
    }

    // Exact match or "?"-prefixed query string only — a startsWith check here would also swallow
    // an unrelated future path like /api/impact-summary or a typo'd /api/impacts.
    if (req.url === "/api/impact" || req.url?.startsWith("/api/impact?")) {
      const file = new URL(req.url, "http://localhost").searchParams.get("file");
      if (!file) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required 'file' query parameter." }));
        return;
      }

      // Resolve the report fully before writing any headers — writeHead(200) can't be undone if
      // computeImpact throws partway through building the response body.
      let report;
      try {
        report = computeImpact(file);
      } catch (err) {
        if (err instanceof CodeBlueprintError) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        throw err;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report));
      return;
    }

    // No query params — unlike /api/impact, the target is always "whatever git currently reports as
    // changed," computed fresh per request (git state can change between two requests in the same
    // --serve session, unlike the fixed project graph).
    if (req.url === "/api/diff-impact") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(computeDiffImpact()));
      return;
    }

    serveStatic(uiDir, req.url ?? "/", res);
  });
}

function openBrowser(url: string): void {
  const command =
    process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  // A failed open is non-fatal — the URL is already printed to the console for the user to open by hand.
  exec(command);
}

/** Starts listening and opens the user's browser. Exits the process on a port conflict rather
 * than hanging silently. */
export function startServer(rootDir: string, port: number = DEFAULT_PORT): void {
  const server = createServer(rootDir);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      process.stderr.write(`Error: port ${port} is already in use. Pick a different one with --port.\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    process.stdout.write(`CodeBlueprint Explorer running at ${url}\n`);
    openBrowser(url);
  });
}
