import type { ExplorerData } from "../types";

export async function fetchExplorerData(): Promise<ExplorerData> {
  const res = await fetch("/api/explorer-data");
  if (!res.ok) {
    throw new Error(`Failed to load explorer data: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ExplorerData;
}
