import type { HotspotReport } from "../types";
import { relativePath } from "../lib/paths";

interface HotspotsPanelProps {
  data: HotspotReport;
}

// Deliberately distinct per metric — three bars in one blue read as a repeated template; three
// colors read as three different signals (mirrors the app's design-token hex values, see
// GraphView.tsx's comment for why this can't reference --cb-* vars from a JS-computed style).
const METRIC_COLOR = { coupling: "#a78bfa", complexity: "#f5a524", dependencies: "#22d3ee" };

export default function HotspotsPanel({ data }: HotspotsPanelProps) {
  const maxDeps = Math.max(1, ...data.modules.map((m) => m.dependencyCount));
  const maxCoupling = Math.max(1, ...data.modules.map((m) => m.coupling));
  const maxComplexity = Math.max(1, ...data.modules.map((m) => m.complexityAverage));

  return (
    <div className="hotspots-panel">
      <section>
        <h2>Most connected files</h2>
        {data.hotspots.length === 0 ? (
          <p className="hotspots-empty">No files have incoming dependencies.</p>
        ) : (
          <ul className="hotspots-list">
            {data.hotspots.map((h, i) => (
              <li key={h.filePath}>
                <span className="hotspots-rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="hotspots-file">{relativePath(h.filePath, data.rootDir)}</span>
                <span className="hotspots-count">{h.dependents} dependents</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Circular dependencies</h2>
        {data.cycles.length === 0 ? (
          <p className="hotspots-empty">No circular dependencies detected.</p>
        ) : (
          <ul className="cycle-list">
            {data.cycles.map((cycle) => {
              const names = cycle.files.map((f) => relativePath(f, data.rootDir));
              const chain = [...names, names[0]].join(" → ");
              return (
                <li key={chain} className="cycle-chain">
                  {chain}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2>Modules</h2>
        <div className="module-list">
          {data.modules.map((m) => (
            <div key={m.name} className="module-card">
              <h3>{m.name}</h3>
              <BarRow label="Coupling" value={m.coupling} max={maxCoupling} display={String(m.coupling)} color={METRIC_COLOR.coupling} />
              <BarRow
                label="Complexity"
                value={m.complexityAverage}
                max={maxComplexity}
                display={m.complexityAverage.toFixed(1)}
                color={METRIC_COLOR.complexity}
              />
              <BarRow
                label="Dependencies"
                value={m.dependencyCount}
                max={maxDeps}
                display={String(m.dependencyCount)}
                color={METRIC_COLOR.dependencies}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BarRow({ label, value, max, display, color }: { label: string; value: number; max: number; display: string; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="bar-value">{display}</span>
    </div>
  );
}
