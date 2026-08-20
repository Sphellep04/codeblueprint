import type { ExplorerData, HotspotReport } from "../types";

export async function fetchExplorerData(): Promise<ExplorerData> {
  const res = await fetch("/api/explorer-data");
  if (!res.ok) {
    throw new Error(`Failed to load explorer data: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ExplorerData;
}

export async function fetchHotspotReport(): Promise<HotspotReport> {
  const res = await fetch("/api/hotspots");
  if (!res.ok) {
    throw new Error(`Failed to load hotspot report: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as HotspotReport;
}
