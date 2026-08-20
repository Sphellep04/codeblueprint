import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchExplorerData } from "./lib/api";
import { buildFileTree } from "./lib/tree";
import Sidebar from "./components/Sidebar";
import GraphView from "./components/GraphView";
import SearchBox from "./components/SearchBox";
import InspectPanel from "./components/InspectPanel";
import type { ExplorerData } from "./types";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: ExplorerData };

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchExplorerData()
      .then((data) => setState({ status: "ready", data }))
      .catch((err: unknown) => setState({ status: "error", message: err instanceof Error ? err.message : String(err) }));
  }, []);

  const tree = useMemo(() => {
    if (state.status !== "ready") return null;
    return buildFileTree(state.data.files, state.data.rootDir);
  }, [state]);

  const onSelect = useCallback((path: string) => setSelectedPath(path), []);

  if (state.status === "loading") {
    return <div className="app-placeholder">Loading…</div>;
  }

  if (state.status === "error") {
    return <div className="app-placeholder">Failed to load project data: {state.message}</div>;
  }

  const { data } = state;
  const selectedFile = selectedPath ? data.files.find((f) => f.absolutePath === selectedPath) : undefined;

  return (
    <div className="app-layout">
      <header className="app-header">
        <span>
          CodeAtlas Explorer — {data.projectName} ({data.files.length} files, {data.edges.length} edges)
        </span>
        <SearchBox value={searchTerm} onChange={setSearchTerm} />
      </header>
      <div className="app-body">
        {tree && <Sidebar tree={tree} selectedPath={selectedPath} onSelect={onSelect} />}
        <GraphView data={data} selectedPath={selectedPath} searchTerm={searchTerm} onSelect={onSelect} />
        <InspectPanel file={selectedFile} edges={data.edges} rootDir={data.rootDir} />
      </div>
    </div>
  );
}
