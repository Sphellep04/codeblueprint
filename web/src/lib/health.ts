import type { ExplorerData, HotspotReport } from "../types";
import { orphanFiles } from "./metrics";
import { relativePath } from "./paths";

export interface ScoreBreakdown {
  label: string;
  score: number;
  /** Each entry is either a concrete penalty line-item ("-N: reason") or, when nothing was
   * deducted, a plain statement of why the score is clean — always non-empty, so "why is my score
   * X" always has a real, visible answer rather than an empty list. */
  reasons: string[];
}

export interface ArchitectureHealth {
  overall: number;
  modularity: ScoreBreakdown;
  dependencyHealth: ScoreBreakdown;
  complexity: ScoreBreakdown;
}

const CYCLE_PENALTY = 15;
const HIGH_COUPLING_PENALTY = 5;
const ORPHAN_PENALTY = 4;
/** The commonly-cited McCabe cyclomatic-complexity threshold above which a function is considered
 * "moderate risk" rather than simple (see NIST's structured-testing guidance) — an external,
 * documented convention, not a number invented for this feature. */
const COMPLEXITY_THRESHOLD = 10;
const COMPLEXITY_PENALTY_PER_POINT = 5;

// Mirrors the app's design-token hex values (see GraphView.tsx's comment on why components using
// inline styles/canvas rendering can't reference index.css's --cb-* custom properties directly).
const SCORE_COLOR = { good: "#22d3ee", warn: "#f5a524", bad: "#ef4444" };

/** Severity color for a 0-100 score — same three-band read as the rest of the app's amber/red
 * "needs attention" language (Overview's attention items, InspectPanel's entry badge). */
export function scoreColor(score: number): string {
  if (score >= 80) return SCORE_COLOR.good;
  if (score >= 50) return SCORE_COLOR.warn;
  return SCORE_COLOR.bad;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Three independently-justified scores, not four: an earlier draft included a fourth
 * "Maintainability" composite, but the only available signal for it (dependency concentration
 * among a few files) wasn't distinct or well-justified enough to stand on its own under time
 * pressure — better three scores that are each fully explainable than a fourth built on a shaky
 * proxy. Overall is the plain average of the three; every deduction below is a real, visible
 * line-item so "why is my score X" always has a concrete, drillable answer.
 */
export function computeArchitectureHealth(data: ExplorerData, hotspots: HotspotReport): ArchitectureHealth {
  const cycleReasons = hotspots.cycles.map((c) => {
    const names = c.files.map((f) => relativePath(f, data.rootDir));
    return `-${CYCLE_PENALTY}: circular dependency (${[...names, names[0]].join(" → ")})`;
  });
  const averageCoupling = hotspots.modules.length > 0 ? hotspots.modules.reduce((sum, m) => sum + m.coupling, 0) / hotspots.modules.length : 0;
  const highCouplingModules = hotspots.modules.filter((m) => m.coupling > 0 && m.coupling >= averageCoupling);
  const couplingReasons = highCouplingModules.map((m) => `-${HIGH_COUPLING_PENALTY}: module "${m.name}" has above-average coupling (${m.coupling})`);
  const modularityScore = clampScore(100 - cycleReasons.length * CYCLE_PENALTY - couplingReasons.length * HIGH_COUPLING_PENALTY);

  const orphans = orphanFiles(data.files, data.edges);
  const orphanReasons = orphans.map((f) => `-${ORPHAN_PENALTY}: orphan file (${relativePath(f.absolutePath, data.rootDir)})`);
  const dependencyHealthScore = clampScore(100 - orphans.length * ORPHAN_PENALTY);

  const totalFunctions = data.files.reduce((sum, f) => sum + f.functionCount, 0);
  const totalComplexity = data.files.reduce((sum, f) => sum + f.complexityTotal, 0);
  const avgComplexity = totalFunctions > 0 ? totalComplexity / totalFunctions : 0;
  let complexityScore = 100;
  const complexityReasons: string[] = [];
  if (totalFunctions === 0) {
    complexityReasons.push("No functions to measure — score defaults to 100.");
  } else if (avgComplexity > COMPLEXITY_THRESHOLD) {
    const penalty = (avgComplexity - COMPLEXITY_THRESHOLD) * COMPLEXITY_PENALTY_PER_POINT;
    complexityScore = clampScore(100 - penalty);
    complexityReasons.push(
      `-${Math.round(penalty)}: average function complexity ${avgComplexity.toFixed(1)} exceeds the McCabe "moderate complexity" threshold of ${COMPLEXITY_THRESHOLD}`
    );
  } else {
    complexityReasons.push(`Average function complexity ${avgComplexity.toFixed(1)} is at or below the McCabe threshold of ${COMPLEXITY_THRESHOLD}.`);
  }

  const overall = clampScore((modularityScore + dependencyHealthScore + complexityScore) / 3);

  return {
    overall,
    modularity: {
      label: "Modularity",
      score: modularityScore,
      reasons: [...cycleReasons, ...couplingReasons].length > 0 ? [...cycleReasons, ...couplingReasons] : ["No circular dependencies or high-coupling modules detected."],
    },
    dependencyHealth: {
      label: "Dependency Health",
      score: dependencyHealthScore,
      reasons: orphanReasons.length > 0 ? orphanReasons : ["No orphan files detected."],
    },
    complexity: { label: "Complexity", score: complexityScore, reasons: complexityReasons },
  };
}
