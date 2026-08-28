import type { FileEdge, FileModel, ImpactReport } from "../types";
import { relativePath } from "../lib/paths";
import { incomingEdgeCount, outgoingEdgeCount } from "../lib/metrics";

interface InspectPanelProps {
  file: FileModel | undefined;
  edges: FileEdge[];
  rootDir: string;
  impact: ImpactReport | null;
  onShowImpact: (filePath: string) => void;
  onOpenSource: (file: string, line: number) => void;
}

export default function InspectPanel({ file, edges, rootDir, impact, onShowImpact, onOpenSource }: InspectPanelProps) {
  if (!file) {
    return (
      <aside className="inspect-panel">
        <p className="inspect-empty">Select a file to inspect it.</p>
      </aside>
    );
  }

  const incoming = incomingEdgeCount(edges, file.absolutePath);
  const outgoing = outgoingEdgeCount(edges, file.absolutePath);
  const impactForThisFile = impact?.targetFile === file.absolutePath ? impact : null;

  return (
    <aside className="inspect-panel">
      <h2 className="inspect-title" title={file.absolutePath}>
        {relativePath(file.absolutePath, rootDir)}
      </h2>
      {file.isEntryPoint && <p className="inspect-badge">Entry point</p>}
      <dl className="inspect-stats">
        <dt>Imports</dt>
        <dd>{file.importCount}</dd>
        <dt>Exports</dt>
        <dd>{file.exportCount}</dd>
        <dt>Functions</dt>
        <dd>{file.functionCount}</dd>
        <dt>Classes</dt>
        <dd>{file.classCount}</dd>
        <dt>Components</dt>
        <dd>{file.componentCount}</dd>
        <dt>Complexity</dt>
        <dd className={file.complexityTotal > 10 ? "stat-warn" : undefined}>{file.complexityTotal}</dd>
        <dt>Incoming edges</dt>
        <dd className="stat-cyan">{incoming}</dd>
        <dt>Outgoing edges</dt>
        <dd>{outgoing}</dd>
      </dl>

      <button type="button" className="show-impact-button" onClick={() => onShowImpact(file.absolutePath)}>
        Show impact
      </button>
      <button type="button" className="open-source-button" onClick={() => onOpenSource(file.absolutePath, 1)}>
        Open in editor
      </button>

      {impactForThisFile && (
        <div className="impact-result">
          <p>
            Potential impact: {impactForThisFile.impactedFiles.length} file{impactForThisFile.impactedFiles.length === 1 ? "" : "s"}
          </p>
          <p>
            {impactForThisFile.impactedRoutes.length} route{impactForThisFile.impactedRoutes.length === 1 ? "" : "s"} may be affected
          </p>
          {impactForThisFile.impactedRoutes.length > 0 && (
            <ul className="impact-route-list">
              {impactForThisFile.impactedRoutes.map((r) => (
                <li key={r}>{relativePath(r, rootDir)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
