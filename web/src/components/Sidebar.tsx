import { useState } from "react";
import type { TreeNode } from "../lib/tree";
import type { CodeGraph } from "../types";
import { classifyFileKind, FILE_KIND_COLOR } from "../lib/fileKind";

interface SidebarProps {
  tree: TreeNode;
  codeGraph: CodeGraph;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className={`tree-chevron${open ? " tree-chevron--open" : ""}`} aria-hidden="true">
      <path d="M3 2 L7 5 L3 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Sidebar({ tree, codeGraph, selectedPath, onSelect }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Project files">
      <div className="sidebar-header">{tree.name}</div>
      <div className="tree-root">
        {tree.children.map((child) => (
          <TreeItem key={child.path} node={child} codeGraph={codeGraph} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    </nav>
  );
}

function TreeItem({
  node,
  codeGraph,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  codeGraph: CodeGraph;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (!node.isDirectory) {
    const isSelected = node.path === selectedPath;
    const kindColor = node.file ? FILE_KIND_COLOR[classifyFileKind(node.file, codeGraph)] : undefined;
    return (
      <div className={`tree-item tree-file${isSelected ? " tree-item--selected" : ""}`} onClick={() => onSelect(node.path)}>
        <span className={`tree-file-dot${kindColor ? "" : " tree-file-dot--empty"}`} style={kindColor ? { backgroundColor: kindColor } : undefined} />
        <span className="tree-item-label">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="tree-item tree-dir" onClick={() => setCollapsed((c) => !c)}>
        <ChevronIcon open={!collapsed} />
        <span className="tree-item-label">{node.name}</span>
      </div>
      {!collapsed && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeItem key={child.path} node={child} codeGraph={codeGraph} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
