import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchExplorerData, fetchHotspotReport, fetchImpact, fetchDiffImpact, fetchCodeGraph, openInEditor } from "./lib/api";
import { impactReportToHighlight, diffImpactReportToHighlight } from "./lib/impactHighlight";
import { buildFileTree } from "./lib/tree";
import Sidebar from "./components/Sidebar";
import GraphView from "./components/GraphView";
import SymbolGraphView from "./components/SymbolGraphView";
import SearchBox from "./components/SearchBox";
import InspectPanel from "./components/InspectPanel";
import HotspotsPanel from "./components/HotspotsPanel";
import OverviewPanel from "./components/OverviewPanel";
import CommandPalette from "./components/CommandPalette";
import ShortcutsOverlay from "./components/ShortcutsOverlay";
import ArchitectureView from "./components/ArchitectureView";
import BlueprintView from "./components/BlueprintView";
import Logo from "./components/Logo";
import { OverviewIcon, GraphIcon, ArchitectureIcon, BlueprintIcon, SymbolsIcon, HotspotsIcon } from "./components/Icons";
import type { ExplorerData, HotspotReport, ImpactReport, DiffImpactReport, CodeGraph } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ExplorerData; hotspots: HotspotReport; codeGraph: CodeGraph };

type View = "overview" | "graph" | "architecture" | "blueprint" | "symbols" | "hotspots";

export default function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState<View>("overview");
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [diffImpact, setDiffImpact] = useState<DiffImpactReport | null>(null);
  const [hideReExports, setHideReExports] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    setDiffImpact(null);
  }, []);

  const onSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
    setImpact(null); // search and impact highlighting never coexist — the new search takes over
    setDiffImpact(null);
  }, []);

  const onShowImpact = useCallback(async (filePath: string) => {
    try {
      const report = await fetchImpact(filePath);
      if (selectedPathRef.current !== filePath) return; // selection moved on while this was in flight
      setImpact(report);
      setDiffImpact(null);
    } catch (err) {
      // Non-fatal — the inspect panel just won't show an impact result; log for diagnosis.
      console.error("Failed to load impact data:", err);
    }
  }, []);

  const onShowDiffImpact = useCallback(async () => {
    setView("graph");
    try {
      const report = await fetchDiffImpact();
      setDiffImpact(report);
      setImpact(null);
    } catch (err) {
      console.error("Failed to load diff impact data:", err);
    }
  }, []);

  const onOpenSource = useCallback((file: string, line: number) => {
    openInEditor(file, line).catch((err: unknown) => console.error("Failed to open in editor:", err));
  }, []);

  const onNavigateToFile = useCallback(
    (path: string) => {
      onSelect(path);
      setView("graph");
    },
    [onSelect]
  );

  const onViewHotspots = useCallback(() => setView("hotspots"), []);

  const onNavigateToSymbolFile = useCallback(
    (path: string) => {
      onSelect(path);
      setView("symbols");
    },
    [onSelect]
  );

  // Global shortcuts: Cmd/Ctrl+K always works (standard command-palette convention, even while
  // typing elsewhere); the single-letter shortcuts only fire outside of text inputs so they never
  // hijack normal typing in the search box or the palette's own input.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        setShortcutsOpen(false);
        return;
      }

      if (e.key === "Escape" && shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }

      const target = e.target as HTMLElement | null;
      // SELECT is included here too: without it, using the Symbols view's "Trace flow from…"
      // dropdown's native type-ahead (e.g. pressing "s" to jump to a symbol starting with S) would
      // simultaneously trigger the global view-switch shortcut for that same letter.
      const isTyping = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (paletteOpen || isTyping) return;

      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((open) => !open);
        return;
      }
      if (shortcutsOpen) return;

      if (e.key === "/") {
        e.preventDefault();
        setView("graph");
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else if (e.key === "g") {
        setView("graph");
      } else if (e.key === "a") {
        setView("architecture");
      } else if (e.key === "b") {
        setView("blueprint");
      } else if (e.key === "s") {
        setView("symbols");
      } else if (e.key === "h") {
        setView("hotspots");
      } else if (e.key === "o") {
        setView("overview");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, shortcutsOpen]);

  if (state.status === "loading") {
    return (
      <div className="app-placeholder app-placeholder--loading">
        <div className="boot-sequence">
          <Logo />
          <div className="boot-label">Analyzing codebase…</div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return <div className="app-placeholder">Failed to load project data: {state.message}</div>;
  }

  const { data, hotspots, codeGraph } = state;
  const selectedFile = selectedPath ? data.files.find((f) => f.absolutePath === selectedPath) : undefined;
  // impact/diffImpact are mutually exclusive (each clears the other on set) — GraphView/ImpactBanner
  // render whichever is active through one shared shape, see lib/impactHighlight.ts.
  const graphHighlight = impact ? impactReportToHighlight(impact) : diffImpact ? diffImpactReportToHighlight(diffImpact) : null;

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-brand">
          <Logo />
          <span className="app-brand-name">CodeBlueprint</span>
          <span className="app-brand-project">
            {data.projectName} <span className="app-brand-stats">· {data.files.length} files · {data.edges.length} edges</span>
          </span>
        </div>
        <div className="app-header-controls">
          <div className="view-toggle" role="tablist">
            <button type="button" className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>
              <OverviewIcon />
              Overview
            </button>
            <button type="button" className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>
              <GraphIcon />
              Graph
            </button>
            <button type="button" className={view === "architecture" ? "active" : ""} onClick={() => setView("architecture")}>
              <ArchitectureIcon />
              Architecture
            </button>
            <button type="button" className={view === "blueprint" ? "active" : ""} onClick={() => setView("blueprint")}>
              <BlueprintIcon />
              Blueprint
            </button>
            <button type="button" className={view === "symbols" ? "active" : ""} onClick={() => setView("symbols")}>
              <SymbolsIcon />
              Symbols
            </button>
            <button type="button" className={view === "hotspots" ? "active" : ""} onClick={() => setView("hotspots")}>
              <HotspotsIcon />
              Hotspots
            </button>
          </div>
          <button type="button" className="diff-impact-button" onClick={onShowDiffImpact} title="Blast radius of every file git reports as changed">
            Diff Impact
          </button>
          {view === "graph" && (
            <label className="hide-reexports-toggle">
              <input type="checkbox" checked={hideReExports} onChange={(e) => setHideReExports(e.target.checked)} />
              Hide re-exports
            </label>
          )}
          {view === "graph" && <SearchBox ref={searchInputRef} value={searchTerm} onChange={onSearchChange} />}
          <button
            type="button"
            className="shortcuts-trigger"
            onClick={() => setShortcutsOpen((open) => !open)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </header>
      {view === "blueprint" ? (
        <div className="view-fade" key={view}>
          <BlueprintView data={data} codeGraph={codeGraph} />
        </div>
      ) : (
        <div className="app-body">
          {/* The sidebar (and, on the three graph-like views, the inspector) stay mounted across
              every view switch — they're shared chrome, not per-view content — so folder
              expand/collapse state survives switching tabs, and every view gets consistent
              navigation instead of Overview/Hotspots being oddly full-width with no file tree. */}
          {tree && (
            <Sidebar
              tree={tree}
              codeGraph={codeGraph}
              selectedPath={selectedPath}
              onSelect={view === "overview" || view === "hotspots" ? onNavigateToFile : onSelect}
            />
          )}
          <div className="view-fade" key={view}>
            {view === "overview" ? (
              <OverviewPanel data={data} hotspots={hotspots} onSelectFile={onNavigateToFile} onViewHotspots={onViewHotspots} />
            ) : view === "hotspots" ? (
              <HotspotsPanel data={hotspots} />
            ) : view === "graph" ? (
              <GraphView
                data={data}
                codeGraph={codeGraph}
                hotspots={hotspots}
                selectedPath={selectedPath}
                searchTerm={searchTerm}
                impact={graphHighlight}
                onSelect={onSelect}
                hideReExports={hideReExports}
              />
            ) : view === "architecture" ? (
              <ArchitectureView data={data} codeGraph={codeGraph} selectedPath={selectedPath} onSelect={onSelect} />
            ) : (
              <SymbolGraphView codeGraph={codeGraph} selectedPath={selectedPath} rootDir={data.rootDir} onOpenSource={onOpenSource} />
            )}
          </div>
          {(view === "graph" || view === "architecture" || view === "symbols") && (
            <InspectPanel
              file={selectedFile}
              edges={data.edges}
              rootDir={data.rootDir}
              impact={impact}
              onShowImpact={onShowImpact}
              onOpenSource={onOpenSource}
            />
          )}
        </div>
      )}
      {paletteOpen && (
        <CommandPalette
          files={data.files}
          symbols={codeGraph.symbols}
          rootDir={data.rootDir}
          onSelectFile={onNavigateToFile}
          onSelectSymbolFile={onNavigateToSymbolFile}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
