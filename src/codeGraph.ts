import { SourceFile, Node, SyntaxKind, Identifier } from "ts-morph";
import {
  getDependencyEdges,
  getFunctionCandidates,
  getBindingAnchor,
  isInternalDependency,
  getClassExpressionCandidates,
  FunctionCandidate,
} from "./analyzer";
import { getComponentNodes } from "./componentHeuristics";
import { CodeGraph, FileEdge, SymbolModel, SymbolKind, ImportEdge, SymbolUsageEdge, UsageKind } from "./model";

export function buildFileEdges(sourceFiles: SourceFile[], rootAbs: string): FileEdge[] {
  // isInternalDependency only checks that a resolved target is within rootAbs — it doesn't know
  // about files scanner.ts excluded afterward (e.g. gitignored files still resolvable via TS
  // module resolution because they exist on disk). Edges to such a file must be dropped here:
  // every consumer of FileEdge (Cytoscape in the Explorer included) assumes `to` is always one of
  // the files it already has as a node, and Cytoscape throws synchronously otherwise.
  const knownPaths = new Set<string>(sourceFiles.map((sf) => sf.getFilePath()));
  const edges: FileEdge[] = [];
  for (const sf of sourceFiles) {
    const from = sf.getFilePath();
    for (const edge of getDependencyEdges(sf, rootAbs)) {
      if (!knownPaths.has(edge.to)) continue;
      edges.push({ kind: edge.kind, from, to: edge.to });
    }
  }
  return edges;
}

export interface SymbolTable {
  symbols: SymbolModel[];
  /** Declaration node (and, for arrow/function-expression candidates, their binding anchor —
   * see getBindingAnchor) -> symbol id. Used to resolve go-to-definition results back to a symbol. */
  nodeToId: Map<Node, string>;
  /** JSON.stringify([filePath, exportName]) -> symbol id, where exportName is the name a symbol is
   * actually imported under ("default" for any default export, regardless of its declared local
   * name). Used to resolve import specifiers to symbols. JSON-encoding the composite key (rather
   * than joining filePath/exportName with a separator) avoids collisions when filePath itself
   * contains whatever separator character was chosen — a real risk here, since paths on this
   * project's own filesystem contain spaces. */
  byExportName: Map<string, string>;
}

function exportKey(filePath: string, exportName: string): string {
  return JSON.stringify([filePath, exportName]);
}

/** Maps each exported declaration node to the name it's exported under, straight from ts-morph's
 * own export resolution — avoids guessing from the declaration's local identifier name, which
 * diverges from the export name for any default export with a real local name (e.g. `export
 * default function App() {}` exports as "default", not "App"). */
function buildExportNameIndex(sf: SourceFile): Map<Node, string> {
  const index = new Map<Node, string>();
  for (const [exportName, decls] of sf.getExportedDeclarations()) {
    for (const decl of decls) {
      index.set(decl, exportName);
    }
  }
  return index;
}

function registerSymbol(
  node: Node,
  name: string,
  kind: SymbolKind,
  filePath: string,
  exported: boolean,
  table: SymbolTable
): SymbolModel {
  const line = node.getStartLineNumber();
  const symbol: SymbolModel = { id: `${filePath}#${name}:${line}`, name, kind, filePath, line, exported };
  table.symbols.push(symbol);
  table.nodeToId.set(node, symbol.id);
  return symbol;
}

export function buildSymbolTable(sourceFiles: SourceFile[]): SymbolTable {
  const table: SymbolTable = { symbols: [], nodeToId: new Map(), byExportName: new Map() };

  for (const sf of sourceFiles) {
    const filePath = sf.getFilePath();
    const functionCandidates: FunctionCandidate[] = getFunctionCandidates(sf);
    const componentNodes = getComponentNodes(sf, functionCandidates);
    const exportIndex = buildExportNameIndex(sf);

    for (const candidate of functionCandidates) {
      const anchor = getBindingAnchor(candidate.node);
      const exportName = exportIndex.get(candidate.node) ?? (anchor && exportIndex.get(anchor));
      const kind: SymbolKind =
        candidate.node.getKind() === SyntaxKind.MethodDeclaration
          ? "method"
          : componentNodes.has(candidate.node)
            ? "component"
            : "function";
      const name = candidate.name ?? "default";

      const symbol = registerSymbol(candidate.node, name, kind, filePath, exportName !== undefined, table);
      if (anchor) table.nodeToId.set(anchor, symbol.id);
      if (exportName !== undefined) table.byExportName.set(exportKey(filePath, exportName), symbol.id);
    }

    for (const cls of sf.getClasses()) {
      const exportName = exportIndex.get(cls);
      const kind: SymbolKind = componentNodes.has(cls) ? "component" : "class";
      const name = cls.getName() ?? "default";

      const symbol = registerSymbol(cls, name, kind, filePath, exportName !== undefined, table);
      if (exportName !== undefined) table.byExportName.set(exportKey(filePath, exportName), symbol.id);
    }

    // Class expressions (`const X = class {}`) aren't returned by sf.getClasses() — same reasoning
    // as arrow/function-expression candidates above: a usage resolves via go-to-definition to the
    // VariableDeclaration, not the ClassExpression itself, so the anchor needs registering too.
    for (const candidate of getClassExpressionCandidates(sf)) {
      const anchor = candidate.node.getParentIfKind(SyntaxKind.VariableDeclaration);
      const exportName = exportIndex.get(candidate.node) ?? (anchor && exportIndex.get(anchor));
      const kind: SymbolKind = componentNodes.has(candidate.node) ? "component" : "class";
      const name = candidate.name ?? "default";

      const symbol = registerSymbol(candidate.node, name, kind, filePath, exportName !== undefined, table);
      if (anchor) table.nodeToId.set(anchor, symbol.id);
      if (exportName !== undefined) table.byExportName.set(exportKey(filePath, exportName), symbol.id);
    }
  }

  // Second pass, after every file's own declarations are registered: attribute re-export barrels.
  // `import { greet } from "@scope/lib"` resolves targetPath to the *barrel* file (lib's index.ts),
  // but the loop above only ever registers byExportName entries keyed by the *originating* file
  // (greet.ts) — a barrel with no local declarations of its own (just `export * from "./greet"`)
  // never gets its own entries. sf.getExportedDeclarations() already resolves transitively through
  // such re-exports, straight from ts-morph's own export resolution — so for every file, register
  // its exported names against whatever symbol id the originating declaration already has. Purely
  // additive: a declaration nodeToId doesn't already know about (nothing this codebase's own
  // candidate-scanning above registers, e.g. a re-exported interface/type) is silently skipped, same
  // safe-failure-mode as everywhere else — this can only add attribution, never invent a wrong one.
  for (const sf of sourceFiles) {
    const filePath = sf.getFilePath();
    for (const [exportName, decls] of sf.getExportedDeclarations()) {
      for (const decl of decls) {
        const symbolId = table.nodeToId.get(decl);
        if (symbolId) table.byExportName.set(exportKey(filePath, exportName), symbolId);
      }
    }
  }

  return table;
}

export function buildImportEdges(sourceFiles: SourceFile[], rootAbs: string, table: SymbolTable): ImportEdge[] {
  const edges: ImportEdge[] = [];

  for (const sf of sourceFiles) {
    const filePath = sf.getFilePath();
    for (const imp of sf.getImportDeclarations()) {
      const resolved = imp.getModuleSpecifierSourceFile();
      if (!isInternalDependency(resolved, rootAbs)) continue;
      const targetPath = resolved.getFilePath();

      for (const spec of imp.getNamedImports()) {
        const symbolId = table.byExportName.get(exportKey(targetPath, spec.getName()));
        if (symbolId) edges.push({ file: filePath, symbol: symbolId });
      }

      if (imp.getDefaultImport()) {
        const symbolId = table.byExportName.get(exportKey(targetPath, "default"));
        if (symbolId) edges.push({ file: filePath, symbol: symbolId });
      }

      // Namespace imports (`import * as ns`) are not attributed to individual symbols — deferred,
      // see README's "Known Phase 2 limitations". File-level connectivity is preserved via FileEdge.
    }
  }

  return edges;
}

interface UsageSite {
  /** The call/JSX node itself, used to walk up to the enclosing symbol ("from"). */
  siteNode: Node;
  /** The identifier to resolve to a target symbol ("to"). */
  identifier: Identifier;
  kind: UsageKind;
}

function collectUsageSites(sf: SourceFile): UsageSite[] {
  const sites: UsageSite[] = [];

  const BOUND_CALL_METHODS = new Set(["bind", "call", "apply"]);

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (expr.getKind() === SyntaxKind.Identifier) {
      sites.push({ siteNode: call, identifier: expr.asKindOrThrow(SyntaxKind.Identifier), kind: "calls" });
    } else if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      const nameNode = propAccess.getNameNode();
      if (nameNode.getKind() === SyntaxKind.Identifier) {
        const methodName = nameNode.asKindOrThrow(SyntaxKind.Identifier).getText();
        if (BOUND_CALL_METHODS.has(methodName)) {
          // `foo.bind(x)`/`foo.call(x)`/`foo.apply(x)`: "bind"/"call"/"apply" itself never resolves
          // to a project symbol (nothing declares it), so the real target is one level in — the
          // object the method is being called on, not the method name.
          const inner = propAccess.getExpression();
          if (inner.getKind() === SyntaxKind.Identifier) {
            sites.push({ siteNode: call, identifier: inner.asKindOrThrow(SyntaxKind.Identifier), kind: "calls" });
          } else if (inner.getKind() === SyntaxKind.PropertyAccessExpression) {
            const innerName = inner.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getNameNode();
            if (innerName.getKind() === SyntaxKind.Identifier) {
              sites.push({ siteNode: call, identifier: innerName.asKindOrThrow(SyntaxKind.Identifier), kind: "calls" });
            }
          }
        } else {
          sites.push({ siteNode: call, identifier: nameNode.asKindOrThrow(SyntaxKind.Identifier), kind: "calls" });
        }
      }
      // Computed member calls (`obj[expr]()`) are not resolved — deferred, see README's
      // "Known Phase 2 limitations".
    }
  }

  const jsxTags = [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
  for (const tag of jsxTags) {
    const tagName = tag.getTagNameNode();
    if (tagName.getKind() === SyntaxKind.Identifier) {
      sites.push({ siteNode: tag, identifier: tagName.asKindOrThrow(SyntaxKind.Identifier), kind: "renders" });
    } else if (tagName.getKind() === SyntaxKind.PropertyAccessExpression) {
      // Dotted tag name (`<Foo.Bar/>`) — mirrors the call-expression PropertyAccessExpression
      // handling above: resolve the accessed name ("Bar"), not the namespace/object it's accessed on.
      const nameNode = tagName.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getNameNode();
      if (nameNode.getKind() === SyntaxKind.Identifier) {
        sites.push({ siteNode: tag, identifier: nameNode.asKindOrThrow(SyntaxKind.Identifier), kind: "renders" });
      }
    }
    // Namespaced JSX tag names (`<ns:tag/>`, rare/legacy JSX syntax) are not resolved — deferred,
    // same limitation.
  }

  return sites;
}

/**
 * Resolves a usage-site identifier to a known symbol id via ts-morph's go-to-definition. Native
 * lowercase JSX tags (`<div>`) resolve into JSX.IntrinsicElements lib typings, which never match a
 * project-declared symbol, so they're filtered out naturally without special-casing.
 */
function resolveUsageTarget(identifier: Identifier, nodeToId: Map<Node, string>): string | undefined {
  for (const def of identifier.getDefinitionNodes()) {
    const id = nodeToId.get(def);
    if (id) return id;
  }

  // Anonymous default exports (`export default () => {}`) have no direct definition node reachable
  // from a usage site — fall back to the aliased symbol's declarations (resolves to the
  // ExportAssignment, which getBindingAnchor also registers in nodeToId).
  const aliased = identifier.getSymbol()?.getAliasedSymbol();
  for (const decl of aliased?.getDeclarations() ?? []) {
    const id = nodeToId.get(decl);
    if (id) return id;
  }

  return undefined;
}

function findEnclosingSymbol(node: Node, nodeToId: Map<Node, string>): string | undefined {
  let current = node.getParent();
  while (current) {
    const id = nodeToId.get(current);
    if (id) return id;
    current = current.getParent();
  }
  return undefined;
}

export function buildUsageEdges(sourceFiles: SourceFile[], table: SymbolTable): SymbolUsageEdge[] {
  const seen = new Set<string>();
  const edges: SymbolUsageEdge[] = [];

  for (const sf of sourceFiles) {
    for (const site of collectUsageSites(sf)) {
      const to = resolveUsageTarget(site.identifier, table.nodeToId);
      if (!to) continue;

      // A usage site with no enclosing symbol (a bare module-top-level call, e.g. `mount();`) isn't
      // attributed to anything — deliberately not emitted as an edge.
      const from = findEnclosingSymbol(site.siteNode, table.nodeToId);
      if (!from) continue;

      // Symbol ids already contain a full file path, so JSON-encode the triple rather than joining
      // with a plain separator (see exportKey's comment for why that's not collision-safe here).
      const key = JSON.stringify([site.kind, from, to]);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ kind: site.kind, from, to });
    }
  }

  return edges;
}

export function buildCodeGraph(sourceFiles: SourceFile[], rootAbs: string): CodeGraph {
  const files = buildFileEdges(sourceFiles, rootAbs);
  const table = buildSymbolTable(sourceFiles);
  const imports = buildImportEdges(sourceFiles, rootAbs, table);
  const usages = buildUsageEdges(sourceFiles, table);
  return { files, symbols: table.symbols, imports, usages };
}
