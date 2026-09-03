import type { ImpactReport, DiffImpactReport } from "../types";

/** GraphView/ImpactBanner render this, not ImpactReport/DiffImpactReport directly — the graph
 * highlight logic (fade everything except target(s) and their impact, pulse the target(s), reveal
 * impacted nodes in hop order) is identical for "impact of one picked file" and "impact of every
 * file git reports as changed"; only how many target files there are differs. */
export interface ImpactHighlight {
  label: string;
  targetFiles: string[];
  impactedFiles: string[];
  impactedRoutes: string[];
}

export function impactReportToHighlight(report: ImpactReport): ImpactHighlight {
  return {
    label: "BLAST RADIUS",
    targetFiles: [report.targetFile],
    impactedFiles: report.impactedFiles,
    impactedRoutes: report.impactedRoutes,
  };
}

export function diffImpactReportToHighlight(report: DiffImpactReport): ImpactHighlight {
  return {
    label: "DIFF IMPACT",
    targetFiles: report.changedFiles,
    impactedFiles: report.impactedFiles,
    impactedRoutes: report.impactedRoutes,
  };
}
