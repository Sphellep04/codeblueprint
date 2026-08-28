interface ShortcutsOverlayProps {
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const GROUPS: ShortcutGroup[] = [
  {
    title: "Views",
    rows: [
      { keys: ["O"], label: "Overview" },
      { keys: ["G"], label: "Graph" },
      { keys: ["A"], label: "Architecture" },
      { keys: ["B"], label: "Blueprint" },
      { keys: ["S"], label: "Symbols" },
      { keys: ["H"], label: "Hotspots" },
    ],
  },
  {
    title: "Navigate",
    rows: [
      { keys: [MOD, "K"], label: "Jump to any file or symbol" },
      { keys: ["/"], label: "Focus search (Graph view)" },
      { keys: ["Esc"], label: "Close palette or this panel" },
      { keys: ["?"], label: "Show this panel" },
    ],
  },
];

export default function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-panel-header">
          <span>Keyboard shortcuts</span>
          <button type="button" className="shortcuts-panel-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="shortcuts-panel-body">
          {GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <div className="shortcuts-group-title">{group.title}</div>
              {group.rows.map((row) => (
                <div key={row.label} className="shortcuts-row">
                  <span className="shortcuts-keys">
                    {row.keys.map((k) => (
                      <kbd key={k} className="shortcuts-kbd">
                        {k}
                      </kbd>
                    ))}
                  </span>
                  <span className="shortcuts-label">{row.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
