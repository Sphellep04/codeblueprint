import type { ExplorerData, HotspotReport, ImpactReport } from "../types";

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

export async function fetchImpact(filePath: string): Promise<ImpactReport> {
  const res = await fetch(`/api/impact?file=${encodeURIComponent(filePath)}`);
  if (!res.ok) {
    throw new Error(`Failed to load impact data: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ImpactReport;
}
