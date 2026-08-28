import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { loadMcpContext, CodeBlueprintError } from "./orchestrator";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const message = err instanceof CodeBlueprintError ? err.message : String(err);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

/**
 * Starts a stdio-transport MCP server so AI coding assistants (Claude Code, Cursor, etc.) can query
 * this project's dependency/symbol graph directly instead of grepping files. Read-only: every tool
 * here is a thin wrapper over loadMcpContext's existing analysis primitives.
 *
 * Stdio is the wire protocol — nothing may ever write to stdout on this path (unlike --serve's
 * console banner). If a startup message is ever needed here, it must go to stderr instead.
 */
export async function startMcpServer(rootDir: string): Promise<void> {
  const server = new McpServer({ name: "codeblueprint", version: "1.0.0" });

  // loadMcpContext does a full ts-morph parse — measured at several seconds even on a small
  // project, and it's synchronous, CPU-bound work with no internal await, so Node's single thread
  // can't make progress on anything else (including the MCP handshake itself) while it runs. An
  // earlier version tried kicking it off via Promise.resolve().then(...) right after registering
  // tools, hoping it would run "in the background" — it doesn't: that callback is still scheduled
  // as a microtask ahead of server.connect()'s own internal setup, so it blocked initialize/
  // tools/list exactly the same as calling it eagerly up front did. The only reliable fix is fully
  // lazy: don't create the promise at all until a tool handler actually needs it, guaranteeing the
  // handshake (which never touches ctx) can never be blocked behind this parse.
  let ctxPromise: Promise<Awaited<ReturnType<typeof loadMcpContext>>> | null = null;
  function getCtx() {
    if (!ctxPromise) ctxPromise = Promise.resolve().then(() => loadMcpContext(rootDir));
    return ctxPromise;
  }

  server.registerTool(
    "get_summary",
    { description: "Project-wide structural summary: file/component/function/class counts, circular deps, orphan files.", inputSchema: z.object({}) },
    async () => ok((await getCtx()).getSummary())
  );

  server.registerTool(
    "get_file_summary",
    {
      description: "Metrics for one file: imports/exports/functions/classes/components/complexity, entry-point status.",
      inputSchema: z.object({ file: z.string().describe("File path, relative to the project root or absolute.") }),
    },
    async ({ file }) => {
      try {
        return ok((await getCtx()).getFileSummary(file));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_dependencies",
    {
      description: "A file's direct internal dependencies (what it imports) and dependents (what imports it).",
      inputSchema: z.object({ file: z.string().describe("File path, relative to the project root or absolute.") }),
    },
    async ({ file }) => {
      try {
        return ok((await getCtx()).getDependencies(file));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "find_symbol",
    {
      description: "Find functions/classes/components by name (substring match, case-insensitive).",
      inputSchema: z.object({ query: z.string().describe("Name or partial name to search for.") }),
    },
    async ({ query }) => ok((await getCtx()).findSymbol(query))
  );

  server.registerTool(
    "get_impact",
    {
      description: "Full transitive blast radius of changing a file: every dependent file and affected route.",
      inputSchema: z.object({ file: z.string().describe("File path, relative to the project root or absolute.") }),
    },
    async ({ file }) => {
      try {
        return ok((await getCtx()).getImpact(file));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_hotspots",
    { description: "Most-connected files, circular-dependency chains, and per-module coupling/complexity.", inputSchema: z.object({}) },
    async () => ok((await getCtx()).getHotspots())
  );

  await server.connect(new StdioServerTransport());
}
