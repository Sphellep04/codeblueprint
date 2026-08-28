import { useEffect, useMemo, useRef, useState } from "react";
import type { FileModel, SymbolModel } from "../types";
import { relativePath } from "../lib/paths";

interface CommandPaletteProps {
  files: FileModel[];
  symbols: SymbolModel[];
  rootDir: string;
  onSelectFile: (path: string) => void;
  onSelectSymbolFile: (path: string) => void;
  onClose: () => void;
}

interface ResultItem {
  kind: "file" | "symbol";
  label: string;
  detail: string;
  path: string;
}

const MAX_RESULTS_PER_KIND = 8;

export default function CommandPalette({ files, symbols, rootDir, onSelectFile, onSelectSymbolFile, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();

    const fileResults: ResultItem[] = files
      .filter((f) => !q || relativePath(f.absolutePath, rootDir).toLowerCase().includes(q))
      .slice(0, MAX_RESULTS_PER_KIND)
      .map((f) => ({ kind: "file", label: relativePath(f.absolutePath, rootDir), detail: "File", path: f.absolutePath }));

    const symbolResults: ResultItem[] = symbols
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS_PER_KIND)
      .map((s) => ({ kind: "symbol", label: s.name, detail: relativePath(s.filePath, rootDir), path: s.filePath }));

    return [...fileResults, ...symbolResults];
  }, [query, files, symbols, rootDir]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (item: ResultItem) => {
    if (item.kind === "file") onSelectFile(item.path);
    else onSelectSymbolFile(item.path);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIndex]) choose(results[activeIndex]);
    }
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Jump to a file or symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="command-palette-results">
          {results.length === 0 && <li className="command-palette-empty">No matches.</li>}
          {results.map((item, i) => (
            <li
              key={`${item.kind}-${item.path}-${item.label}`}
              className={`command-palette-result${i === activeIndex ? " command-palette-result--active" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => choose(item)}
            >
              <span className={`command-palette-result-kind command-palette-result-kind--${item.kind}`}>
                {item.kind === "file" ? "FILE" : "SYMBOL"}
              </span>
              <span className="command-palette-result-label">{item.label}</span>
              {item.kind === "symbol" && <span className="command-palette-result-detail">{item.detail}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
