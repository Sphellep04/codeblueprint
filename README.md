# CodeAtlas

Codebase intelligence CLI — turns a JS/TS/React/Next.js project into a structural summary, a relationship graph, and a local web Explorer to browse it visually.

## Usage

```
codeatlas <path>
codeatlas <path> --json
codeatlas <path> --graph
codeatlas <path> --serve [--port <number>]
codeatlas --version
```

Local development (not yet published to npm):

```
npm install
npm run build
npm link          # makes `codeatlas`/`npx codeatlas` resolve globally
codeatlas ./my-project
```

`npm install` also installs the `web/` Explorer frontend's dependencies (it's an npm workspace), and `npm run build` builds both the CLI and `web/`, copying the built Explorer into `dist/ui` so `--serve` has something to serve. See "Explorer (`--serve`)" below for the frontend dev workflow.

Or without linking: `node dist/cli.js ./my-project`, or `npm run dev -- ./my-project` for fast iteration via ts-node.

## Output

```
CodeAtlas

Project: my-project

Files             184
Components        73
Functions         612
Classes            18
Imports           924
Exports           431

Circular deps       3
Orphan files        8
```

`--json` prints the same data as a `Summary` object (see `src/model.ts`), including the raw file lists for each circular-dependency cluster and each orphan file — useful for scripting or as a stepping stone for Phase 2's graph visualization.

`--graph` prints a `CodeGraph` object instead: file-level import/re-export edges, every function/method/class/component declaration as a `SymbolModel`, which files import which specific symbols, and symbol-to-symbol `calls`/`renders` usage edges (e.g. `authService.ts#login` calls `db.ts#query`, `App.tsx#App` renders `Header.tsx#Header`). It's a separate flag from `--json` (not merged into `Summary`) so existing `--json` scripting consumers don't see their payload shape change, and so the extra language-service work it does is only paid when actually asked for. See "Known Phase 2 limitations" below for what it deliberately doesn't resolve.

## Explorer (`--serve`)

```
codeatlas ./my-project --serve
codeatlas ./my-project --serve --port 5000
```

Starts a local HTTP server (default port `4787`) and opens your browser to a graphical Explorer: a file-tree sidebar, a pan/zoom/click dependency graph (Cytoscape.js), a search box that highlights matching files and fades the rest, and an inspect panel showing the selected file's metrics (imports/exports/functions/classes/components, entry-point status, incoming/outgoing edge counts). Unlike `--json`/`--graph`, `--serve` doesn't print anything machine-readable to stdout — it's meant to be looked at, not piped — so it's mutually exclusive with `--json`/`--graph` (combining them is a usage error, not a silently-ignored combination).

The Explorer's node set includes every scanned file, including orphans with zero edges — deliberately different from `CodeGraph.files`' edges-only shape (`--graph`), since a graph UI needs every file to draw as a node, not just the ones with a visible edge. This is `ExplorerData` (see `src/model.ts`): `ProjectModel.files` for the complete file list plus `codeGraph.ts`'s file-level edges, assembled by `orchestrator.runExplorerData()` in a single project parse.

**MVP scope**: file-level graph only. The roadmap's further Phase 3 features — hiding edges by dependency type, "focus on this module," jump-from-graph-to-source, and a symbol/call-graph view (the data for the last one already exists via `--graph`, just not wired into the UI yet) — are deferred, not designed away: `FileEdge.kind` is already tagged in the graph data specifically so "hide re-export edges" is a future CSS class toggle, not a rework.

**Frontend dev workflow**: the Explorer lives in `web/` (Vite + React + TypeScript + Cytoscape.js), a separate npm workspace from the CLI with its own `tsconfig.json` — it targets the browser (ESNext modules, DOM lib) where the CLI targets Node (CommonJS). `web/src/types.ts` is a small hand-kept mirror of the relevant `src/model.ts` types, since the two packages don't share a compilation context. To iterate on the UI with hot reload: run `codeatlas <path> --serve` in one terminal (serves the API on port 4787), then `npm run dev --workspace=web` in another (`web/vite.config.ts` proxies `/api` to port 4787).

## Metrics — what's actually counted

- **Files**: `.js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts` files, excluding `node_modules`, `dist`, `build`, `.next`, `out`, `.git`, `coverage`, and anything matched by the project's own `.gitignore`. `.d.ts` files are excluded.
- **Imports**: counted per `import` statement (not per named specifier), including `import type`. Dynamic `import()` and `require()` calls are **not** counted.
- **Exports**: counted per uniquely-named exported symbol per file (named, default, and re-exports via `export * from`/`export {x} from`).
- **Functions**: function declarations, arrow/function expressions bound to a variable (`const f = () => {}`) — including through one or two layers of `memo`/`forwardRef` wrapping — anonymous default exports (`export default () => {}`), and class methods (excluding constructors/getters/setters). Inline callbacks with no such binding (e.g. `arr.map(x => ...)`) are deliberately excluded to avoid noise. **Components intentionally double-count as Functions** — a component is a function; "Components" is a tag on a subset, not a disjoint partition.
- **Classes**: `class` declarations, including anonymous `export default class {}`. Class *expressions* assigned to a variable (`const X = class {}`) are not currently counted — a known limitation.
- **Components** (heuristic): capitalized (or anonymous-default-exported) functions/arrows whose body contains JSX, plus classes extending `React.Component`/`PureComponent`. Known false positives: a capitalized non-component factory function that happens to return JSX. Known false negatives: `React.createElement(...)`-based components with no JSX syntax; HOC wrapping beyond `memo`/`forwardRef` (e.g. `connect(...)`, `observer(...)`, `styled(...)`).
- **Circular deps**: the number of distinct strongly-connected clusters (Tarjan's SCC) in the file-level import/re-export graph — not the number of raw edges, and not the number of files involved. A 5-file cycle counts as 1, not 5.
- **Orphan files**: files with zero internal importers that also aren't recognized as an entry point. Entry points include `package.json`'s `main`/`module`/`browser`/`exports["."]`/`bin` fields, `index.*`/`main.*` at the project root or in `src/`, Next.js `pages/**` and `app/**/{page,layout,loading,error,not-found,route,template,default}.*` + `middleware.*`, test files (`*.test.*`, `*.spec.*`, `__tests__/**`), and root-level `*.config.{js,ts,cjs,mjs}` files. Known false positives: files only reached via `require()`, dynamically-constructed `import()` strings, or Storybook `.stories.*` files.

## Known Phase 1 limitations

- **Monorepo/workspace-unaware**: a single scan is treated as one flat project. A file only imported from a sibling workspace package (`packages/*`) outside the scanned root will be misreported as an orphan — and, in `--graph` output, will simply be absent from the graph rather than shown as a connected node. Deferred to a later phase.
- **CommonJS-only files** (`module.exports`/`require()`) show 0 imports/exports and contribute no graph edges — they'll typically surface as false-positive orphans even when actually used, and as disconnected nodes in `--graph` output. The `fixtures/basic-react-app/src/legacyHelper.js` fixture demonstrates this deliberately. Treating `require("./x")` calls as file-level edges (without full CommonJS export/symbol modeling) would be a cheap, worthwhile follow-up — deferred for now since no current fixture case exercises it.
- **`tsconfig.json` `exports` field**: only the top-level `"."` entry is resolved; full conditional-exports maps are not.

## Known Phase 2 limitations

`--graph`'s symbol-usage resolution (`calls`/`renders` edges) is built on ts-morph's go-to-definition, which is real but not exhaustive static analysis. Known gaps, none of which produce a wrong edge — they simply produce no edge, which is the safe failure mode for a tool whose job is showing real relationships:

- **Dynamic dispatch / reassigned function references** (`let f = a; if (x) f = b; f()`): resolves to the variable binding, not to `a` or `b`.
- **Higher-order functions returning functions** (`const handler = makeHandler(); handler()`): resolves to the `handler` binding, not into `makeHandler`'s return statement.
- **Method calls through interface-typed values**: resolve to the interface's method signature, not a concrete class implementation — the same ambiguity TypeScript's own go-to-definition has.
- **Calls via `.bind()`/`.call()`/`.apply()`**, and calls through array/object literals of functions, are not walked.
- **Namespace imports** (`import * as ns from "./x"`) aren't attributed to individual symbols in `imports`/`usages` — the file-level edge in `files` is still emitted, so connectivity isn't lost, only per-symbol attribution.
- **Dotted/namespaced JSX tag names** (`<Foo.Bar />`) aren't resolved to a symbol.

## Known Phase 3 limitations

- **MVP graph is file-level only** — no symbol/call-graph view in the UI yet (see "Explorer" above). `FileEdge.kind` is already tagged so a dependency-type filter is a small follow-up, not a rework.
- **CommonJS files render as disconnected nodes** in the Explorer graph, same root cause as the Phase 1/2 CommonJS limitation above.
- **`npm audit` flags a moderate esbuild advisory** (via Vite's dev server, which allows cross-origin requests to read its responses) in `web/`'s dev dependencies. It affects `vite dev`/`npm run dev --workspace=web` only — the *built* static bundle `--serve` actually ships has no dev server in it. Not force-upgraded to Vite 8 yet since that's a breaking change; worth revisiting later.

## Project layout

`analyzer.ts`/`graph.ts`/`componentHeuristics.ts` produce plain data (`ProjectModel`/`Summary` in `model.ts`); `report.ts` is the only module that knows about stdout formatting. `codeGraph.ts` builds the `CodeGraph` data (`--graph`) on top of the same `analyzer.ts`/`componentHeuristics.ts` primitives, so file-level edges and function/component detection aren't computed twice. `server.ts` (`--serve`) reuses the same primitives again via `orchestrator.runExplorerData()`, and serves the prebuilt `web/` frontend as static assets plus a `/api/explorer-data` JSON endpoint. This split is deliberate — `orchestrator.ts`'s three entry points (`runAnalysis`/`runGraphAnalysis`/`runExplorerData`) are the only things any consumer (CLI, server, or a future scripting use) needs to call; none of them touch ts-morph or stdout formatting directly.

## Testing

```
npm test
```

Runs `node:test` against `graph.ts`, `utils/format.ts`, `codeGraph.ts`, `orchestrator.ts`'s `runExplorerData`, `server.ts` (API shape and static serving, both against hermetic fixtures rather than the real `web/dist`), and an integration suite that asserts exact metric values against `fixtures/basic-react-app` — a hand-built fixture with a known circular pair, a barrel-style re-export cycle, a second disjoint cycle, a genuinely orphaned file, a CommonJS-only file (demonstrating the limitation above), Next.js `pages/*` entry points, a tsconfig path-alias import, a `memo`-wrapped and an anonymous-default-exported component, and a typed class/method pair (demonstrating `--graph`'s call-resolution through a `PropertyAccessExpression`). `npm test` never requires `web/` to be built first.

The Explorer frontend (`web/`) has no automated tests — the project has no UI-render test infrastructure prior to this, and the fixture's known cycles/orphan/entry-points make it a good manual test bed. Verify frontend changes by running `codeatlas ./fixtures/basic-react-app --serve` and checking the result in a browser, not just `tsc`/`vite build` succeeding.
