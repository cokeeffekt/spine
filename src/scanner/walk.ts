import * as fs from "fs";
import * as path from "path";

/**
 * Recursively walk a directory and return all absolute paths to .m4b files.
 * Results are sorted for deterministic output.
 */
export function walkLibrary(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true, recursive: true });

  const m4bPaths: string[] = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".m4b"))
    .map((entry) => {
      // Bun/Node 22: parentPath is preferred, but fall back to path for compatibility
      const dir = (entry as fs.Dirent & { parentPath?: string }).parentPath ?? (entry as unknown as { path: string }).path;
      return path.join(dir, entry.name);
    });

  return m4bPaths.sort();
}
