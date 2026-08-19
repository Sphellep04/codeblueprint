# CodeAtlas

Codebase intelligence CLI — turns a JS/TS/React/Next.js project into a structural summary. Phase 1 of a larger roadmap toward an interactive architecture explorer.

## Usage

```
codeatlas <path>
codeatlas <path> --json
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

- **Monorepo/workspace-unaware**: a single scan is treated as one flat project. A file only imported from a sibling workspace package (`packages/*`) outside the scanned root will be misreported as an orphan. Deferred to a later phase.
- **CommonJS-only files** (`module.exports`/`require()`) show 0 imports/exports and contribute no graph edges — they'll typically surface as false-positive orphans even when actually used. The `fixtures/basic-react-app/src/legacyHelper.js` fixture demonstrates this deliberately.
- **`tsconfig.json` `exports` field**: only the top-level `"."` entry is resolved; full conditional-exports maps are not.

## Project layout

`analyzer.ts`/`graph.ts`/`componentHeuristics.ts` produce plain data (`ProjectModel`/`Summary` in `model.ts`); `report.ts` is the only module that knows about stdout formatting. This split is deliberate — a future `--json`-consuming web UI or Phase 2's graph explorer can call `orchestrator.runAnalysis()` directly without touching analysis code.

## Testing

```
npm test
```

Runs `node:test` against `graph.ts`, `utils/format.ts`, and an integration suite that asserts exact metric values against `fixtures/basic-react-app` — a hand-built fixture with a known circular pair, a barrel-style re-export cycle, a second disjoint cycle, a genuinely orphaned file, a CommonJS-only file (demonstrating the limitation above), Next.js `pages/*` entry points, a tsconfig path-alias import, and both a `memo`-wrapped and an anonymous-default-exported component.
