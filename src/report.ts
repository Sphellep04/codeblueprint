import { Summary, HotspotReport, ImpactReport } from "./model";
import { formatRows, formatBar, Row } from "./utils/format";

/**
 * The only module that knows about stdout, padding, or column widths.
 * Everything upstream deals in plain Summary data.
 */
export function formatReport(summary: Summary): string {
  const groupA: Row[] = [
    { label: "Files", value: summary.files },
    { label: "Components", value: summary.components },
    { label: "Functions", value: summary.functions },
    { label: "Classes", value: summary.classes },
    { label: "Imports", value: summary.imports },
    { label: "Exports", value: summary.exports },
  ];
  const groupB: Row[] = [
    { label: "Circular deps", value: summary.circularDeps },
    { label: "Orphan files", value: summary.orphanFiles },
  ];

  const formatted = formatRows([...groupA, ...groupB]);
  const groupALines = formatted.slice(0, groupA.length);
  const groupBLines = formatted.slice(groupA.length);

  return [
    "CodeBlueprint",
    "",
    `Project: ${summary.projectName}`,
    "",
    ...groupALines,
    "",
    ...groupBLines,
  ].join("\n");
}

export function printReport(summary: Summary): void {
  process.stdout.write(formatReport(summary) + "\n");
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

// Deliberately mirrors web/src/lib/paths.ts's relativePath — same hand-kept-duplicate tradeoff
// already established for web/src/types.ts (separate compilation contexts); not worth a shared
// package for one four-line function.
function relativeToRoot(absolutePath: string, rootDir: string): string {
  const rootPosix = rootDir.replace(/\\/g, "/").replace(/\/$/, "");
  const filePosix = absolutePath.replace(/\\/g, "/");
  return filePosix.startsWith(rootPosix + "/") ? filePosix.slice(rootPosix.length + 1) : filePosix;
}

export function formatHotspotReport(report: HotspotReport): string {
  const lines: string[] = ["CodeBlueprint — Architecture Intelligence", "", `Project: ${report.projectName}`, "", "Most connected files"];

  if (report.hotspots.length === 0) {
    lines.push("  (none)");
  } else {
    const rows: Row[] = report.hotspots.map((h) => ({ label: relativeToRoot(h.filePath, report.rootDir), value: h.dependents }));
    formatRows(rows).forEach((line) => lines.push("  " + line + " dependents"));
  }

  lines.push("", "Circular dependencies");
  if (report.cycles.length === 0) {
    lines.push("  (none)");
  } else {
    for (const cycle of report.cycles) {
      const names = cycle.files.map((f) => relativeToRoot(f, report.rootDir));
      lines.push("  " + [...names, names[0]].join(" → "));
    }
  }

  lines.push("", "Modules");
  const maxDeps = Math.max(1, ...report.modules.map((m) => m.dependencyCount));
  const maxCoupling = Math.max(1, ...report.modules.map((m) => m.coupling));
  const maxComplexity = Math.max(1, ...report.modules.map((m) => m.complexityAverage));
  for (const m of report.modules) {
    lines.push(`  Module: ${m.name}`);
    lines.push(`    Coupling      ${formatBar(m.coupling, maxCoupling)} (${m.coupling})`);
    lines.push(`    Complexity    ${formatBar(m.complexityAverage, maxComplexity)} (${m.complexityAverage.toFixed(1)})`);
    lines.push(`    Dependencies  ${formatBar(m.dependencyCount, maxDeps)} (${m.dependencyCount})`);
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

export function printHotspotReport(report: HotspotReport): void {
  process.stdout.write(formatHotspotReport(report) + "\n");
}

export function formatImpactReport(report: ImpactReport): string {
  const target = relativeToRoot(report.targetFile, report.rootDir);
  const fileCount = report.impactedFiles.length;
  const routeCount = report.impactedRoutes.length;

  const lines: string[] = [
    "CodeBlueprint — Impact Analysis",
    "",
    `Project: ${report.projectName}`,
    `Target: ${target}`,
    "",
    `Potential impact: ${fileCount} file${fileCount === 1 ? "" : "s"}`,
  ];

  if (fileCount === 0) {
    lines.push("  (no files depend on this one)");
  } else {
    for (const f of report.impactedFiles) lines.push("  " + relativeToRoot(f, report.rootDir));
  }

  lines.push("", `${routeCount} route${routeCount === 1 ? "" : "s"} may be affected`);
  for (const r of report.impactedRoutes) lines.push("  " + relativeToRoot(r, report.rootDir));

  return lines.join("\n");
}

export function printImpactReport(report: ImpactReport): void {
  process.stdout.write(formatImpactReport(report) + "\n");
}
