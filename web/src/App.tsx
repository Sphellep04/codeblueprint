import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchExplorerData, fetchHotspotReport, fetchImpact, fetchCodeGraph, openInEditor } from "./lib/api";
import { buildFileTree } from "./lib/tree";
import Sidebar from "./components/Sidebar";
import GraphView from "./components/GraphView";
import SymbolGraphView from "./components/SymbolGraphView";
import SearchBox from "./components/SearchBox";
import InspectPanel from "./components/InspectPanel";
import HotspotsPanel from "./components/HotspotsPanel";
import type { ExplorerData, HotspotReport, ImpactReport, CodeGraph } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ExplorerData; hotspots: HotspotReport; codeGraph: CodeGraph };

type View = "graph" | "symbols" | "hotspots";

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState<View>("graph");
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [hideReExports, setHideReExports] = useState(false);

  // Guards against a stale /api/impact response: if the user re-selects (or searches) before an
  // in-flight "Show impact" fetch resolves, the late response must not overwrite the newer state.
  const selectedPathRef = useRef<string | null>(null);
  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    Promise.all([fetchExplorerData(), fetchHotspotReport(), fetchCodeGraph()])
      .then(([data, hotspots, codeGraph]) => setState({ status: "ready", data, hotspots, codeGraph }))
      .catch((err: unknown) => setState({ status: "error", message: err instanceof Error ? err.message : String(err) }));
  }, []);

  const tree = useMemo(() => {
    if (state.status !== "ready") return null;
    return buildFileTree(state.data.files, state.data.rootDir);
  }, [state]);

  const onSelect = useCallback((path: string) => {
    setSelectedPath(path);
    setImpact(null); // a new selection invalidates whatever impact set was showing
  }, []);

  const onSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
    setImpact(null); // search and impact highlighting never coexist — the new search takes over
  }, []);

  const onShowImpact = useCallback(async (filePath: string) => {
    try {
      const report = await fetchImpact(filePath);
      if (selectedPathRef.current !== filePath) return; // selection moved on while this was in flight
      setImpact(report);
    } catch (err) {
      // Non-fatal — the inspect panel just won't show an impact result; log for diagnosis.
      console.error("Failed to load impact data:", err);
    }
  }, []);

  const onOpenSource = useCallback((file: string, line: number) => {
    openInEditor(file, line).catch((err: unknown) => console.error("Failed to open in editor:", err));
  }, []);

  if (state.status === "loading") {
    return <div className="app-placeholder">Loading…</div>;
  }

  if (state.status === "error") {
    return <div className="app-placeholder">Failed to load project data: {state.message}</div>;
  }

  const { data, hotspots, codeGraph } = state;
  const selectedFile = selectedPath ? data.files.find((f) => f.absolutePath === selectedPath) : undefined;

  return (
    <div className="app-layout">
      <header className="app-header">
        <span>
          CodeBlueprint Explorer — {data.projectName} ({data.files.length} files, {data.edges.length} edges)
        </span>
        <div className="app-header-controls">
          <div className="view-toggle" role="tablist">
            <button type="button" className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>
              Graph
            </button>
            <button type="button" className={view === "symbols" ? "active" : ""} onClick={() => setView("symbols")}>
              Symbols
            </button>
            <button type="button" className={view === "hotspots" ? "active" : ""} onClick={() => setView("hotspots")}>
              Hotspots
            </button>
          </div>
          {view === "graph" && (
            <label className="hide-reexports-toggle">
              <input type="checkbox" checked={hideReExports} onChange={(e) => setHideReExports(e.target.checked)} />
              Hide re-exports
            </label>
          )}
          {view === "graph" && <SearchBox value={searchTerm} onChange={onSearchChange} />}
        </div>
      </header>
      {view === "hotspots" ? (
        <HotspotsPanel data={hotspots} />
      ) : (
        <div className="app-body">
          {tree && <Sidebar tree={tree} selectedPath={selectedPath} onSelect={onSelect} />}
          {view === "graph" ? (
            <GraphView
              data={data}
              selectedPath={selectedPath}
              searchTerm={searchTerm}
              impact={impact}
              onSelect={onSelect}
              hideReExports={hideReExports}
            />
          ) : (
            <SymbolGraphView codeGraph={codeGraph} selectedPath={selectedPath} rootDir={data.rootDir} onOpenSource={onOpenSource} />
          )}
          <InspectPanel
            file={selectedFile}
            edges={data.edges}
            rootDir={data.rootDir}
            impact={impact}
            onShowImpact={onShowImpact}
            onOpenSource={onOpenSource}
          />
        </div>
      )}
    </div>
  );
}
