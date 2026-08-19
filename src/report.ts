import { Summary } from "./model";
import { formatRows, Row } from "./utils/format";

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
    "CodeAtlas",
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
