import { SourceFile, SyntaxKind } from "ts-morph";
import { FunctionCandidate } from "./analyzer";

const COMPONENT_NAME_RE = /^[A-Z]/;
const REACT_BASE_CLASS_RE = /^(React\.)?(Component|PureComponent)$/;

function hasJsx(candidate: FunctionCandidate): boolean {
  const node = candidate.node;
  return (
    node.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxFragment).length > 0
  );
}

/**
 * Heuristic React component detection: capitalized (or anonymous default-export)
 * functions/arrows that render JSX, plus classes extending React.Component /
 * PureComponent. Known false positives: capitalized non-component factory
 * functions. Known false negatives: React.memo(function foo(){}) with a
 * lowercase inner name, or components built via React.createElement without JSX.
 */
export function countComponents(sourceFile: SourceFile, functionCandidates: FunctionCandidate[]): number {
  let count = 0;

  for (const candidate of functionCandidates) {
    if (candidate.node.getKind() === SyntaxKind.MethodDeclaration) continue; // class methods aren't components
    const nameOk = candidate.name === undefined || COMPONENT_NAME_RE.test(candidate.name);
    if (nameOk && hasJsx(candidate)) {
      count++;
    }
  }

  for (const cls of sourceFile.getClasses()) {
    const extendsExpr = cls.getExtends();
    if (extendsExpr && REACT_BASE_CLASS_RE.test(extendsExpr.getExpression().getText())) {
      count++;
    }
  }

  return count;
}
