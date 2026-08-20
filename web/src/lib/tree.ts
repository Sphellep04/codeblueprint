import type { FileModel } from "../types";
import { relativePath } from "./paths";

export interface TreeNode {
  name: string;
  /** Absolute path — matches FileModel.absolutePath / FileEdge.from/to, used as the selection key. */
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
  file?: FileModel;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Nests a flat file list into a directory tree, relative to rootDir. Pure — no I/O. */
export function buildFileTree(files: FileModel[], rootDir: string): TreeNode {
  const root: TreeNode = { name: toPosix(rootDir).split("/").filter(Boolean).pop() ?? "/", path: rootDir, isDirectory: true, children: [] };
  const rootPosix = toPosix(rootDir).replace(/\/$/, "");

  for (const file of files) {
    const segments = relativePath(file.absolutePath, rootDir).split("/").filter(Boolean);

    let cursor = root;
    let pathSoFar = rootPosix;
    segments.forEach((segment, i) => {
      pathSoFar = `${pathSoFar}/${segment}`;
      const isLast = i === segments.length - 1;
      let child = cursor.children.find((c) => c.name === segment && c.isDirectory === !isLast);
      if (!child) {
        child = { name: segment, path: pathSoFar, isDirectory: !isLast, children: [] };
        cursor.children.push(child);
      }
      if (isLast) child.file = file;
      cursor = child;
    });
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}
