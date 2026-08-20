import { useState } from "react";
import type { TreeNode } from "../lib/tree";

interface SidebarProps {
  tree: TreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export default function Sidebar({ tree, selectedPath, onSelect }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Project files">
      {tree.children.map((child) => (
        <TreeItem key={child.path} node={child} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </nav>
  );
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const indent = { paddingLeft: `${depth * 14 + 8}px` };

  if (!node.isDirectory) {
    const isSelected = node.path === selectedPath;
    return (
      <div
        className={`tree-item tree-file${isSelected ? " tree-item--selected" : ""}`}
        style={indent}
        onClick={() => onSelect(node.path)}
      >
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
          <TreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
    </div>
  );
}
