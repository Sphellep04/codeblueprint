export function relativePath(absolutePath: string, rootDir: string): string {
  const rootPosix = rootDir.replace(/\\/g, "/").replace(/\/$/, "");
  const filePosix = absolutePath.replace(/\\/g, "/");
  return filePosix.startsWith(rootPosix + "/") ? filePosix.slice(rootPosix.length + 1) : filePosix;
}
