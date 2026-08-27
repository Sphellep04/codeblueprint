import type { ExplorerData, HotspotReport } from "../types";
import { relativePath } from "../lib/paths";
import { orphanFiles } from "../lib/metrics";
import { computeArchitectureHealth, ScoreBreakdown } from "../lib/health";

interface OverviewPanelProps {
  data: ExplorerData;
  hotspots: HotspotReport;
  onSelectFile: (path: string) => void;
  onViewHotspots: () => void;
}

const TOP_COUPLED_MODULES = 3;

function sum(data: ExplorerData, pick: (f: ExplorerData["files"][number]) => number): number {
  return data.files.reduce((total, f) => total + pick(f), 0);
}

export default function OverviewPanel({ data, hotspots, onSelectFile, onViewHotspots }: OverviewPanelProps) {
  const metrics = [
    { label: "Files", value: data.files.length },
    { label: "Components", value: sum(data, (f) => f.componentCount) },
    { label: "Functions", value: sum(data, (f) => f.functionCount) },
    { label: "Classes", value: sum(data, (f) => f.classCount) },
    { label: "Imports", value: sum(data, (f) => f.importCount) },
    { label: "Exports", value: sum(data, (f) => f.exportCount) },
    { label: "Complexity", value: sum(data, (f) => f.complexityTotal) },
  ];

  const orphans = orphanFiles(data.files, data.edges);
  const topCoupledModules = hotspots.modules
    .filter((m) => m.coupling > 0)
    .sort((a, b) => b.coupling - a.coupling)
    .slice(0, TOP_COUPLED_MODULES);

  const hasAttentionItems = hotspots.cycles.length > 0 || orphans.length > 0 || topCoupledModules.length > 0;
  const health = computeArchitectureHealth(data, hotspots);

  return (
    <div className="overview-panel">
      <h1 className="overview-title">{data.projectName}</h1>

      <div className="health-score-card">
        <div className="health-score-headline">
          <div className="health-score-value">{health.overall}</div>
          <div className="health-score-label">
            ARCHITECTURE HEALTH
            <div className="health-score-sublabel">Average of the three scores below</div>
          </div>
        </div>
        <div className="health-sub-scores">
          {[health.modularity, health.dependencyHealth, health.complexity].map((s: ScoreBreakdown) => (
            <details className="health-sub-score" key={s.label}>
              <summary>
                <span className="health-sub-score-label">{s.label}</span>
                <span className="health-sub-score-value">{s.score}</span>
              </summary>
              <ul className="health-reasons">
                {s.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>

      <div className="overview-metrics-grid">
        {metrics.map((m) => (
          <div className="overview-metric-card" key={m.label}>
            <div className="overview-metric-value">{m.value}</div>
            <div className="overview-metric-label">{m.label}</div>
          </div>
        ))}
      </div>

      <section>
        <h2>Needs attention</h2>
        {!hasAttentionItems ? (
          <p className="hotspots-empty">Nothing flagged — no circular dependencies, orphan files, or highly coupled modules.</p>
        ) : (
          <ul className="attention-list">
            {hotspots.cycles.map((cycle) => {
              const names = cycle.files.map((f) => relativePath(f, data.rootDir));
              const chain = [...names, names[0]].join(" → ");
              return (
                <li key={chain} className="attention-item attention-item--risk" onClick={() => onSelectFile(cycle.files[0])}>
                  <span className="attention-item-tag">Circular dependency</span>
                  <span className="attention-item-detail">{chain}</span>
                </li>
              );
            })}
            {orphans.map((f) => (
              <li key={f.absolutePath} className="attention-item attention-item--warn" onClick={() => onSelectFile(f.absolutePath)}>
                <span className="attention-item-tag">Orphan file</span>
                <span className="attention-item-detail">{relativePath(f.absolutePath, data.rootDir)}</span>
              </li>
            ))}
            {topCoupledModules.map((m) => (
              <li key={m.name} className="attention-item attention-item--warn" onClick={onViewHotspots}>
                <span className="attention-item-tag">High coupling</span>
                <span className="attention-item-detail">
                  Module &ldquo;{m.name}&rdquo; — coupling {m.coupling}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
