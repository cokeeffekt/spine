import * as fs from "fs";
import * as path from "path";
import { isSectionFolder } from "./mp3-sort.js";

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
 * Rules (top-down classification):
 * - D-03: If a folder has .m4b files, the .m4b wins — no mp3folder is emitted for it.
 * - Loose-file book root: a folder with direct .mp3 files IS one book, and it ABSORBS every
 *   .mp3 in its subfolders (prologue/epilogue at the root + parts/discs in subfolders all
 *   belong to the same book). Its subfolders are never emitted as standalone books.
 * - Section-only book root: a folder with NO direct .mp3 files whose mp3-bearing children are
 *   ALL section subfolders (Disc N / CD N / Part N / "…Part…") IS the book; children are not.
 * - Container: a folder with NO direct .mp3 files whose mp3-bearing children are NOT all
 *   sections (e.g. an author/series folder) is skipped — we descend into each child instead.
 * - Single-file MP3 audiobooks (one .mp3 in a folder) ARE emitted as a book.
 *
 * Results are sorted for deterministic output.
 */
export function walkLibrary(root: string): ScanItem[] {
  const entries = fs.readdirSync(root, { withFileTypes: true, recursive: true });

  const m4bPaths: string[] = [];
  const mp3ByDir = new Map<string, string[]>(); // dir → direct .mp3 files
  const childDirs = new Map<string, Set<string>>(); // dir → immediate child directories

  for (const entry of entries) {
    const dir =
      (entry as fs.Dirent & { parentPath?: string }).parentPath ??
      (entry as unknown as { path: string }).path;
    const absPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const set = childDirs.get(dir);
      if (set) set.add(absPath);
      else childDirs.set(dir, new Set([absPath]));
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".m4b")) {
        m4bPaths.push(absPath);
      } else if (entry.name.endsWith(".mp3")) {
        const existing = mp3ByDir.get(dir);
        if (existing) existing.push(absPath);
        else mp3ByDir.set(dir, [absPath]);
      }
    }
  }

  const m4bDirs = new Set<string>(m4bPaths.map((p) => path.dirname(p)));

  // Memoized "does this directory's subtree contain any .mp3?"
  const subtreeHasMp3 = new Map<string, boolean>();
  function hasMp3(dir: string): boolean {
    const cached = subtreeHasMp3.get(dir);
    if (cached !== undefined) return cached;
    let has = (mp3ByDir.get(dir)?.length ?? 0) > 0;
    if (!has) {
      for (const child of childDirs.get(dir) ?? []) {
        if (hasMp3(child)) {
          has = true;
          break;
        }
      }
    }
    subtreeHasMp3.set(dir, has);
    return has;
  }

  const items: ScanItem[] = [];
  for (const p of m4bPaths) items.push({ kind: "file", path: p });

  function classify(dir: string): void {
    const kidsWithMp3 = [...(childDirs.get(dir) ?? [])].filter(hasMp3);

    // D-03: .m4b in this folder wins. Its loose .mp3 and any section subfolders are duplicate
    // sources of the same book and are ignored. Non-section subfolders are unrelated books,
    // so we still descend into those.
    if (m4bDirs.has(dir)) {
      for (const child of kidsWithMp3) {
        if (!isSectionFolder(path.basename(child))) classify(child);
      }
      return;
    }

    const loose = mp3ByDir.get(dir) ?? [];
    if (loose.length > 0) {
      // Loose .mp3 here → this folder is one book; its subfolders are sections it absorbs.
      items.push({ kind: "mp3folder", folderPath: dir });
      return;
    }

    if (kidsWithMp3.length === 0) return;

    // No loose files: if every mp3-bearing child is a section (disc/part), this folder is the
    // book. Otherwise it's a container (author/series) — descend into each child.
    if (kidsWithMp3.every((k) => isSectionFolder(path.basename(k)))) {
      items.push({ kind: "mp3folder", folderPath: dir });
      return;
    }
    for (const child of kidsWithMp3) classify(child);
  }
  classify(root);

  // Sort for deterministic output
  return items.sort((a, b) => {
    const aPath = a.kind === "file" ? a.path : a.folderPath;
    const bPath = b.kind === "file" ? b.path : b.folderPath;
    return aPath.localeCompare(bPath);
  });
}
