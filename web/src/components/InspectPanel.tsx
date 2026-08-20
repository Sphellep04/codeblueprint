import type { FileEdge, FileModel } from "../types";
import { relativePath } from "../lib/paths";

interface InspectPanelProps {
  file: FileModel | undefined;
  edges: FileEdge[];
  rootDir: string;
}

export default function InspectPanel({ file, edges, rootDir }: InspectPanelProps) {
  if (!file) {
    return (
      <aside className="inspect-panel">
        <p className="inspect-empty">Select a file to inspect it.</p>
      </aside>
    );
  }

  const incoming = edges.filter((e) => e.to === file.absolutePath).length;
  const outgoing = edges.filter((e) => e.from === file.absolutePath).length;

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
        <dd>{file.complexityTotal}</dd>
        <dt>Incoming edges</dt>
        <dd>{incoming}</dd>
        <dt>Outgoing edges</dt>
        <dd>{outgoing}</dd>
      </dl>
    </aside>
  );
}
