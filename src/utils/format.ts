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
