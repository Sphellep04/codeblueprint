import * as fs from "fs";
import * as path from "path";
import { SourceFile, SyntaxKind, Node, ClassExpression } from "ts-morph";

export interface FunctionCandidate {
  node: Node;
  name: string | undefined;
}

/** True if the resolved specifier source file is a real project file (not node_modules, within rootDir). */
export function isInternalDependency(resolved: SourceFile | undefined, rootAbs: string): resolved is SourceFile {
  if (!resolved) return false;
  return isInternalPath(resolved.getFilePath(), rootAbs);
}

/** Same rootDir-containment + not-node_modules check as isInternalDependency, but for a plain path
 * string rather than a ts-morph-resolved SourceFile — used by the require() resolution below, which
 * has no SourceFile to check against since ts-morph never resolves a bare require() specifier. */
function isInternalPath(p: string, rootAbs: string): boolean {
  if (p.includes("/node_modules/") || p.includes("\\node_modules\\")) return false;
  const resolvedAbs = path.resolve(p);
  // Guard against a bare prefix match (e.g. rootAbs "proj" matching sibling "proj-other").
  return resolvedAbs === rootAbs || resolvedAbs.startsWith(rootAbs + path.sep);
}

export interface DependencyEdge {
  to: string;
  kind: "import" | "reExport" | "require";
}

const REQUIRE_RESOLVABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
const REQUIRE_INDEX_CANDIDATES = REQUIRE_RESOLVABLE_EXTENSIONS.map((ext) => `index${ext}`);

/**
 * Resolves a require("./x") call's string argument to a scanned file on disk — the same
 * extension/index-file candidate approach entrypoints.ts's resolveModuleField uses for
 * package.json entry fields, done by hand here since ts-morph has no API to resolve an arbitrary
 * string specifier outside an actual import/export declaration. Only relative/absolute specifiers
 * are attempted; a bare package name (require("react")) is already out of scope the same way import
 * resolution excludes node_modules. Returns undefined — never throws — if nothing on disk matches,
 * the same safe-failure-mode as every other soft edge case in this codebase.
 */
function resolveRequireSpecifier(sourceFile: SourceFile, specifier: string, rootAbs: string): string | undefined {
  if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) return undefined;
  const base = path.resolve(path.dirname(sourceFile.getFilePath()), specifier);
  const candidates = [base, ...REQUIRE_RESOLVABLE_EXTENSIONS.map((ext) => base + ext), ...REQUIRE_INDEX_CANDIDATES.map((f) => path.join(base, f))];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const normalized = candidate.replace(/\\/g, "/");
      return isInternalPath(normalized, rootAbs) ? normalized : undefined;
    }
  }
  return undefined;
}

function getRequireEdges(sourceFile: SourceFile, rootAbs: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.Identifier || expr.getText() !== "require") continue;
    const args = call.getArguments();
    if (args.length !== 1 || args[0].getKind() !== SyntaxKind.StringLiteral) continue;
    const specifier = args[0].asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
    const resolved = resolveRequireSpecifier(sourceFile, specifier, rootAbs);
    if (resolved) edges.push({ to: resolved, kind: "require" });
  }
  return edges;
}

/** Internal file-level dependency edges from imports, re-export declarations, and require() calls
 * (treated as file-level edges only — no export/symbol modeling for CommonJS, see README), kind-tagged. */
export function getDependencyEdges(sourceFile: SourceFile, rootAbs: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  for (const imp of sourceFile.getImportDeclarations()) {
    const resolved = imp.getModuleSpecifierSourceFile();
    if (isInternalDependency(resolved, rootAbs)) {
      edges.push({ to: resolved.getFilePath(), kind: "import" });
    }
  }

  for (const exp of sourceFile.getExportDeclarations()) {
    const resolved = exp.getModuleSpecifierSourceFile();
    if (isInternalDependency(resolved, rootAbs)) {
      edges.push({ to: resolved.getFilePath(), kind: "reExport" });
    }
  }

  edges.push(...getRequireEdges(sourceFile, rootAbs));

  return edges;
}

/** Internal file-level dependency edges from both imports and re-export declarations. */
export function getInternalDependencies(sourceFile: SourceFile, rootAbs: string): string[] {
  return Array.from(new Set(getDependencyEdges(sourceFile, rootAbs).map((e) => e.to)));
}

export function countImports(sourceFile: SourceFile): number {
  return sourceFile.getImportDeclarations().length;
}

export function countExports(sourceFile: SourceFile): number {
  return sourceFile.getExportedDeclarations().size;
}

const HOC_WRAPPER_RE = /^(React\.)?(memo|forwardRef)$/;

/**
 * Climbs up through up to two layers of known component-HOC call wrappers
 * (e.g. `memo(fn)`, `memo(forwardRef(fn))`) so the wrapped function can still
 * be traced back to its binding. Only unwraps calls where the function is the
 * sole argument to a whitelisted callee (memo/forwardRef) — this deliberately
 * does NOT generalize to arbitrary call expressions, or every array callback
 * assigned to a variable (`const x = arr.map(fn)`) would count as a function.
 */
export function unwrapKnownHocCalls(node: Node): Node {
  let current: Node = node;
  for (let i = 0; i < 2; i++) {
    const call = current.getParentIfKind(SyntaxKind.CallExpression);
    if (!call) break;
    const args = call.getArguments();
    if (args.length !== 1 || args[0] !== current) break;
    if (!HOC_WRAPPER_RE.test(call.getExpression().getText())) break;
    current = call;
  }
  return current;
}

/**
 * Resolves whether a function-like node should be counted as a top-level
 * function/component: it's bound to a variable (`const Foo = ...`, optionally
 * through a memo/forwardRef wrapper) or is an anonymous default export
 * (`export default () => {}`). Inline callbacks with no such binding are
 * deliberately excluded to avoid noise from every array callback.
 */
function resolveBinding(node: Node): { include: boolean; name: string | undefined } {
  const anchor = getBindingAnchor(node);
  if (!anchor) return { include: false, name: undefined };
  if (anchor.getKind() === SyntaxKind.VariableDeclaration) {
    return { include: true, name: anchor.asKindOrThrow(SyntaxKind.VariableDeclaration).getName() };
  }
  return { include: true, name: undefined };
}

/**
 * The VariableDeclaration or ExportAssignment a function-like node is bound to (through up to two
 * layers of memo/forwardRef wrapping), if any. ts-morph's go-to-definition resolves references to
 * this anchor node rather than to the function-like node itself — e.g. `getDefinitionNodes()` on a
 * usage of `const Header = () => {}` returns the VariableDeclaration, not the ArrowFunction; a usage
 * of an anonymously default-exported `export default () => {}` resolves (via the aliased symbol,
 * since there's no direct definition for an anonymous declaration) to the ExportAssignment. Callers
 * that need to match a resolved definition node back to a FunctionCandidate should key on this
 * anchor node in addition to the candidate's own node.
 */
export function getBindingAnchor(node: Node): Node | undefined {
  const unwrapped = unwrapKnownHocCalls(node);

  const varDecl = unwrapped.getParentIfKind(SyntaxKind.VariableDeclaration);
  if (varDecl) return varDecl;

  const exportAssignment = unwrapped.getParentIfKind(SyntaxKind.ExportAssignment);
  if (exportAssignment) return exportAssignment;

  return undefined;
}

/**
 * Function-like candidates: declared functions, function expressions/arrow
 * functions bound to a variable (including through a memo/forwardRef
 * wrapper) or anonymously default-exported, and class methods (excluding
 * constructors/getters/setters). Inline callbacks are deliberately excluded.
 */
export function getFunctionCandidates(sourceFile: SourceFile): FunctionCandidate[] {
  const candidates: FunctionCandidate[] = [];

  for (const fn of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    candidates.push({ node: fn, name: fn.getName() });
  }

  for (const arrow of sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction)) {
    const binding = resolveBinding(arrow);
    if (binding.include) {
      candidates.push({ node: arrow, name: binding.name });
    }
  }

  for (const fnExpr of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression)) {
    const binding = resolveBinding(fnExpr);
    if (binding.include) {
      candidates.push({ node: fnExpr, name: binding.name });
    }
  }

  for (const cls of sourceFile.getClasses()) {
    for (const method of cls.getMethods()) {
      candidates.push({ node: method, name: method.getName() });
    }
  }

  return candidates;
}

export function countFunctions(sourceFile: SourceFile): number {
  return getFunctionCandidates(sourceFile).length;
}

export interface ClassExpressionCandidate {
  node: ClassExpression;
  name: string | undefined;
}

/** `getClasses()` only returns class *declarations* — a class expression bound to a variable
 * (`const X = class {}`) is a ClassExpression node instead, mirroring how ArrowFunction/
 * FunctionExpression candidates above need their own binding check. Only the VariableDeclaration
 * case applies here (unlike functions, there's no anonymous-default-export class-expression form —
 * `export default class {}` is already a named-or-anonymous ClassDeclaration, already covered by
 * getClasses()). */
export function getClassExpressionCandidates(sourceFile: SourceFile): ClassExpressionCandidate[] {
  const candidates: ClassExpressionCandidate[] = [];
  for (const cls of sourceFile.getDescendantsOfKind(SyntaxKind.ClassExpression)) {
    const varDecl = cls.getParentIfKind(SyntaxKind.VariableDeclaration);
    if (varDecl) candidates.push({ node: cls, name: varDecl.getName() });
  }
  return candidates;
}

export function countClasses(sourceFile: SourceFile): number {
  return sourceFile.getClasses().length + getClassExpressionCandidates(sourceFile).length;
}

const COMPLEXITY_BOUNDARY_KINDS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.Constructor,
]);

const COMPLEXITY_DECISION_KINDS = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
]);

/**
 * McCabe cyclomatic complexity for one function-like node: 1 + decision points in its own body.
 * Decision points inside a nested function/method/accessor/constructor are NOT counted here — that
 * nested scope has its own complexity, computed separately when it's itself a FunctionCandidate;
 * an inline callback with no such binding (already excluded from getFunctionCandidates) simply
 * doesn't contribute anywhere, consistent with that existing exclusion.
 */
export function getCyclomaticComplexity(node: Node): number {
  let complexity = 1;

  node.forEachDescendant((descendant, traversal) => {
    const kind = descendant.getKind();

    if (COMPLEXITY_BOUNDARY_KINDS.has(kind)) {
      traversal.skip();
      return;
    }

    if (COMPLEXITY_DECISION_KINDS.has(kind)) {
      complexity++;
      return;
    }

    if (kind === SyntaxKind.BinaryExpression) {
      const operator = descendant.asKindOrThrow(SyntaxKind.BinaryExpression).getOperatorToken().getKind();
      if (operator === SyntaxKind.AmpersandAmpersandToken || operator === SyntaxKind.BarBarToken) {
        complexity++;
      }
    }
  });

  return complexity;
}
