# CodeAtlas

Codebase intelligence CLI — turns a JS/TS/React/Next.js project into a structural summary. Phase 1 of a larger roadmap toward an interactive architecture explorer.

## Usage

```
codeatlas <path>
codeatlas <path> --json
codeatlas <path> --graph
codeatlas --version
```

Local development (not yet published to npm):

```
npm install
npm run build
npm link          # makes `codeatlas`/`npx codeatlas` resolve globally
codeatlas ./my-project
```

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

`--graph` prints a `CodeGraph` object instead: file-level import/re-export edges, every function/method/class/component declaration as a `SymbolModel`, which files import which specific symbols, and symbol-to-symbol `calls`/`renders` usage edges (e.g. `authService.ts#login` calls `db.ts#query`, `App.tsx#App` renders `Header.tsx#Header`). This is the relationship data Phase 3's graph explorer will render — see "Known Phase 2 limitations" below for what it deliberately doesn't resolve. It's a separate flag from `--json` (not merged into `Summary`) so existing `--json` scripting consumers don't see their payload shape change, and so the extra language-service work it does is only paid when actually asked for.

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

## Project layout

`analyzer.ts`/`graph.ts`/`componentHeuristics.ts` produce plain data (`ProjectModel`/`Summary` in `model.ts`); `report.ts` is the only module that knows about stdout formatting. `codeGraph.ts` builds the `CodeGraph` data (`--graph`) on top of the same `analyzer.ts`/`componentHeuristics.ts` primitives, so file-level edges and function/component detection aren't computed twice. This split is deliberate — a future `--json`/`--graph`-consuming web UI (Phase 3's graph explorer) can call `orchestrator.runAnalysis()`/`runGraphAnalysis()` directly without touching analysis code.

## Testing

```
npm test
```

Runs `node:test` against `graph.ts`, `utils/format.ts`, `codeGraph.ts`, and an integration suite that asserts exact metric values against `fixtures/basic-react-app` — a hand-built fixture with a known circular pair, a barrel-style re-export cycle, a second disjoint cycle, a genuinely orphaned file, a CommonJS-only file (demonstrating the limitation above), Next.js `pages/*` entry points, a tsconfig path-alias import, a `memo`-wrapped and an anonymous-default-exported component, and a typed class/method pair (demonstrating `--graph`'s call-resolution through a `PropertyAccessExpression`).
