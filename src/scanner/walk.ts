import * as fs from "fs";
import * as path from "path";
import { parseDiscNumber } from "./mp3-sort.js";

/**
 * Discriminated union representing one scannable item from the library walk.
 *
 * - kind='file'      → a single .m4b file
 * - kind='mp3folder' → a folder of .mp3 files that represents one audiobook
 */
export type ScanItem =
  | { kind: "file"; path: string }
  | { kind: "mp3folder"; folderPath: string };

/**
 * Recursively walk a directory and return all scannable items:
 * - .m4b files as { kind: 'file', path }
 * - folders containing .mp3 files as { kind: 'mp3folder', folderPath }
 *
 * Rules:
 * - D-03: If a folder has both .m4b and .mp3 files, the .m4b wins — no mp3folder emitted.
 * - D-12/D-13: Disc subfolders (Disc 1/, CD 2/, etc.) are NOT emitted as standalone books.
 *   Their parent folder is the mp3folder.
 * - D-04: If a folder has child directories with .mp3 files that are NOT disc subfolders,
 *   the parent is skipped (only the children are candidates).
 * - Multi-disc: If a folder has NO direct .mp3 files but ALL child dirs with .mp3 files
 *   are disc subfolders, the parent IS emitted as the mp3folder.
 *
 * Results are sorted for deterministic output.
 */
export function walkLibrary(root: string): ScanItem[] {
  const entries = fs.readdirSync(root, { withFileTypes: true, recursive: true });

  // Collect .m4b file paths
  const m4bPaths: string[] = [];

  // Build map: directory path → list of .mp3 absolute file paths
  const mp3ByDir = new Map<string, string[]>();

  for (const entry of entries) {
    const dir =
      (entry as fs.Dirent & { parentPath?: string }).parentPath ??
      (entry as unknown as { path: string }).path;
    const absPath = path.join(dir, entry.name);

    if (entry.isFile()) {
      if (entry.name.endsWith(".m4b")) {
        m4bPaths.push(absPath);
      } else if (entry.name.endsWith(".mp3")) {
        const existing = mp3ByDir.get(dir);
        if (existing) {
          existing.push(absPath);
        } else {
          mp3ByDir.set(dir, [absPath]);
        }
      }
    }
  }

  // Build a Set of all directories containing .m4b files (for D-03 check)
  const m4bDirs = new Set<string>(m4bPaths.map((p) => path.dirname(p)));

  // Build the result items
  const items: ScanItem[] = [];

  // Add all .m4b files
  for (const p of m4bPaths) {
    items.push({ kind: "file", path: p });
  }

  // Determine which directories are MP3 book roots
  // Collect all directories that have .mp3 files
  const mp3Dirs = new Set(mp3ByDir.keys());

  for (const [dir, mp3Files] of mp3ByDir) {
    // Standalone .mp3 rule: a folder with only 1 direct .mp3 and no disc subfolders
    // is not treated as a book. Require at least 2 direct .mp3 files for a standalone folder.
    // (Disc subfolders are handled separately via the multi-disc parent logic.)
    const folderName = path.basename(dir);
    const isDiscFolder = parseDiscNumber(folderName) !== null;
    if (!isDiscFolder && mp3Files.length < 2) continue;

    // D-03: If the folder contains .m4b files, skip — m4b wins
    if (m4bDirs.has(dir)) continue;

    // D-12/D-13: If this directory is a disc subfolder, skip it as standalone
    if (isDiscFolder) continue;

    // D-04: Check if this folder has child directories that also have .mp3 files
    // and those children are NOT disc subfolders.
    // If so, this folder is NOT a leaf — skip it.
    let hasNonDiscChildWithMp3 = false;
    for (const otherDir of mp3Dirs) {
      if (otherDir === dir) continue;
      // Is otherDir a direct child of dir?
      if (path.dirname(otherDir) === dir) {
        const childName = path.basename(otherDir);
        if (parseDiscNumber(childName) === null) {
          // This child has mp3 files and is NOT a disc subfolder
          hasNonDiscChildWithMp3 = true;
          break;
        }
      }
    }
    if (hasNonDiscChildWithMp3) continue;

    // This directory is a valid MP3 book root
    items.push({ kind: "mp3folder", folderPath: dir });
  }

  // Handle "parent with disc subfolders only" case:
  // If a directory has NO direct .mp3 files but ALL its child directories
  // with .mp3 files are disc subfolders → the parent is the mp3folder.
  // (These parents won't appear in mp3ByDir since they have no direct .mp3 files)
  const emittedFolders = new Set(
    items
      .filter((i): i is { kind: "mp3folder"; folderPath: string } => i.kind === "mp3folder")
      .map((i) => i.folderPath)
  );

  // Collect all potential parent directories of disc subfolders
  const parentDirsOfDiscFolders = new Set<string>();
  for (const dir of mp3Dirs) {
    const folderName = path.basename(dir);
    if (parseDiscNumber(folderName) !== null) {
      parentDirsOfDiscFolders.add(path.dirname(dir));
    }
  }

  for (const parentDir of parentDirsOfDiscFolders) {
    // Skip if already emitted
    if (emittedFolders.has(parentDir)) continue;
    // Skip if parent itself has .mp3 files (it's already handled above or skipped)
    if (mp3ByDir.has(parentDir)) continue;
    // Skip if parent contains .m4b files (D-03)
    if (m4bDirs.has(parentDir)) continue;
    // Skip if parent is itself a disc subfolder
    if (parseDiscNumber(path.basename(parentDir)) !== null) continue;

    // Verify ALL child dirs with .mp3 files under parentDir are disc subfolders
    let allChildrenAreDiscs = true;
    let hasAnyDiscChild = false;
    for (const otherDir of mp3Dirs) {
      if (path.dirname(otherDir) === parentDir) {
        const childName = path.basename(otherDir);
        if (parseDiscNumber(childName) !== null) {
          hasAnyDiscChild = true;
        } else {
          allChildrenAreDiscs = false;
          break;
        }
      }
    }

    if (hasAnyDiscChild && allChildrenAreDiscs) {
      items.push({ kind: "mp3folder", folderPath: parentDir });
    }
  }

  // Sort for deterministic output
  return items.sort((a, b) => {
    const aPath = a.kind === "file" ? a.path : a.folderPath;
    const bPath = b.kind === "file" ? b.path : b.folderPath;
    return aPath.localeCompare(bPath);
  });
}
