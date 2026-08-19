import * as path from "path";
import { SourceFile, SyntaxKind, Node } from "ts-morph";

export interface FunctionCandidate {
  node: Node;
  name: string | undefined;
}

/** True if the resolved specifier source file is a real project file (not node_modules, within rootDir). */
export function isInternalDependency(resolved: SourceFile | undefined, rootAbs: string): resolved is SourceFile {
  if (!resolved) return false;
  const p = resolved.getFilePath();
  if (p.includes("/node_modules/") || p.includes("\\node_modules\\")) return false;
  const resolvedAbs = path.resolve(p);
  // Guard against a bare prefix match (e.g. rootAbs "proj" matching sibling "proj-other").
  return resolvedAbs === rootAbs || resolvedAbs.startsWith(rootAbs + path.sep);
}

/** Internal file-level dependency edges from both imports and re-export declarations. */
export function getInternalDependencies(sourceFile: SourceFile, rootAbs: string): string[] {
  const deps = new Set<string>();

  for (const imp of sourceFile.getImportDeclarations()) {
    const resolved = imp.getModuleSpecifierSourceFile();
    if (isInternalDependency(resolved, rootAbs)) {
      deps.add(resolved.getFilePath());
    }
  }

  for (const exp of sourceFile.getExportDeclarations()) {
    const resolved = exp.getModuleSpecifierSourceFile();
    if (isInternalDependency(resolved, rootAbs)) {
      deps.add(resolved.getFilePath());
    }
  }

  return Array.from(deps);
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
function unwrapKnownHocCalls(node: Node): Node {
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
  const unwrapped = unwrapKnownHocCalls(node);

  const varDecl = unwrapped.getParentIfKind(SyntaxKind.VariableDeclaration);
  if (varDecl) return { include: true, name: varDecl.getName() };

  const exportAssignment = unwrapped.getParentIfKind(SyntaxKind.ExportAssignment);
  if (exportAssignment) return { include: true, name: undefined };

  return { include: false, name: undefined };
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

export function countClasses(sourceFile: SourceFile): number {
  return sourceFile.getClasses().length;
}
