export interface Row {
  label: string;
  value: number;
}

/** Right-aligns values in a column sized to fit every row across both groups. */
export function formatRows(rows: Row[], gutter = 4): string[] {
  const labelWidth = Math.max(...rows.map((r) => r.label.length));
  const valueWidth = Math.max(...rows.map((r) => String(r.value).length), 3);
  return rows.map((r) => r.label.padEnd(labelWidth + gutter) + String(r.value).padStart(valueWidth));
}

/** Renders value as a width-character block bar relative to max — display-only normalization; the
 * data model itself stays in raw numbers (see model.ts's HotspotReport/ModuleMetrics). */
export function formatBar(value: number, max: number, width = 10): string {
  if (max <= 0) return "░".repeat(width);
  const filled = Math.min(width, Math.max(0, Math.round((value / max) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}
