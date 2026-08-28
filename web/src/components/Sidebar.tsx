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

export default function Sidebar({ tree, codeGraph, selectedPath, onSelect }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Project files">
      {tree.children.map((child) => (
        <TreeItem key={child.path} node={child} codeGraph={codeGraph} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </nav>
  );
}

function TreeItem({
  node,
  codeGraph,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  codeGraph: CodeGraph;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const indent = { paddingLeft: `${depth * 14 + 8}px` };

  if (!node.isDirectory) {
    const isSelected = node.path === selectedPath;
    const kindColor = node.file ? FILE_KIND_COLOR[classifyFileKind(node.file, codeGraph)] : undefined;
    return (
      <div
        className={`tree-item tree-file${isSelected ? " tree-item--selected" : ""}`}
        style={indent}
        onClick={() => onSelect(node.path)}
      >
        {kindColor && <span className="tree-file-dot" style={{ backgroundColor: kindColor }} />}
        {node.name}
      </div>
    );
  }

  return (
    <div>
      <div className="tree-item tree-dir" style={indent} onClick={() => setCollapsed((c) => !c)}>
        {collapsed ? "▸" : "▾"} {node.name}
      </div>
      {!collapsed &&
        node.children.map((child) => (
          <TreeItem key={child.path} node={child} codeGraph={codeGraph} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
    </div>
  );
}
