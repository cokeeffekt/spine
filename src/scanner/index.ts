import * as fs from "fs";
import { Database } from "bun:sqlite";
import { probeFile, normalizeMetadata } from "./probe.js";
import { extractCoverArt, resolveCoverPath } from "./cover.js";
import { walkLibrary } from "./walk.js";
import { applyFallbackMetadata } from "./fallback.js";
import type { NormalizedMetadata } from "../types.js";

/**
 * Type for an injectable probe function.
 * In production, calls probeFile + normalizeMetadata.
 * In tests, can be replaced with a fixture factory.
 */
export type ProbeFn = (filePath: string) => Promise<NormalizedMetadata>;

const defaultProbeFn: ProbeFn = async (filePath: string): Promise<NormalizedMetadata> => {
  const output = await probeFile(filePath);
  return normalizeMetadata(output);
};

/**
 * Scan a single .m4b file and upsert into SQLite.
 *
 * - Skips ffprobe if file is unchanged (same mtime + size) — D-02
 * - Sets is_missing=0 on upsert (handles D-04 reappearance)
 * - Applies fallback metadata from metadata.json and folder name — SCAN-05
 * - Wraps chapter delete + insert in a transaction for atomicity
 * - On error: logs warning with file path, skips file, does not stop scan
 */
export async function scanFile(
  db: Database,
  filePath: string,
  probeFn: ProbeFn = defaultProbeFn
): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    console.warn(`[scanner] Could not stat file, skipping: ${filePath}`);
    return;
  }

  const mtime = stat.mtimeMs;
  const size = stat.size;

  // D-02: incremental scan — skip if mtime and size unchanged
  const existing = db
    .query("SELECT file_mtime, file_size, is_missing FROM books WHERE file_path = ?")
    .get(filePath) as { file_mtime: number; file_size: number; is_missing: number } | null;

  if (existing && existing.file_mtime === mtime && existing.file_size === size) {
    // D-04: If the file was previously marked missing but is now present, unflag it
    if (existing.is_missing === 1) {
      db.prepare(
        "UPDATE books SET is_missing = 0, updated_at = datetime('now') WHERE file_path = ?"
      ).run(filePath);
    }
    return; // unchanged — skip ffprobe
  }

  let metadata: NormalizedMetadata;
  try {
    metadata = await probeFn(filePath);
  } catch (err) {
    console.warn(
      `[scanner] Failed to probe "${filePath}": ${(err as Error).message}. Skipping.`
    );
    return;
  }

  // SCAN-05: apply fallback metadata from metadata.json / folder name
  metadata = applyFallbackMetadata(metadata, filePath);

  // Determine cover path
  let coverPath: string | null = null;
  if (metadata.has_cover_stream) {
    try {
      coverPath = await extractCoverArt(filePath, true);
    } catch {
      coverPath = null;
    }
  } else {
    coverPath = resolveCoverPath(filePath, false);
  }

  // UPSERT into books — ON CONFLICT handles both insert and update paths
  // is_missing = 0 in both branches handles D-04 (reappearance unflagging)
  const upsert = db.prepare(`
    INSERT INTO books (
      file_path, file_mtime, file_size, is_missing,
      title, author, narrator, series_title, series_position,
      description, genre, publisher, year, language,
      duration_sec, codec, cover_path, updated_at
    ) VALUES (
      ?, ?, ?, 0,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, datetime('now')
    )
    ON CONFLICT(file_path) DO UPDATE SET
      file_mtime      = excluded.file_mtime,
      file_size       = excluded.file_size,
      is_missing      = 0,
      title           = excluded.title,
      author          = excluded.author,
      narrator        = excluded.narrator,
      series_title    = excluded.series_title,
      series_position = excluded.series_position,
      description     = excluded.description,
      genre           = excluded.genre,
      publisher       = excluded.publisher,
      year            = excluded.year,
      language        = excluded.language,
      duration_sec    = excluded.duration_sec,
      codec           = excluded.codec,
      cover_path      = excluded.cover_path,
      updated_at      = datetime('now')
  `);

  upsert.run(
    filePath,
    mtime,
    size,
    metadata.title,
    metadata.author,
    metadata.narrator,
    metadata.series_title,
    metadata.series_position,
    metadata.description,
    metadata.genre,
    metadata.publisher,
    metadata.year,
    metadata.language,
    metadata.duration_sec,
    metadata.codec,
    coverPath
  );

  // Get book_id for chapter insertion
  const bookRow = db
    .query("SELECT id FROM books WHERE file_path = ?")
    .get(filePath) as { id: number };

  // Atomically replace chapters
  db.transaction(() => {
    db.prepare("DELETE FROM chapters WHERE book_id = ?").run(bookRow.id);

    const insertChapter = db.prepare(`
      INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const ch of metadata.chapters) {
      insertChapter.run(
        bookRow.id,
        ch.chapter_idx,
        ch.title,
        ch.start_sec,
        ch.end_sec,
        ch.duration_sec
      );
    }
  })();
}

/**
 * Walk a library directory, scan all .m4b files, mark missing files.
 *
 * - Full walk on every call (D-01)
 * - Incremental: unchanged files skip ffprobe (D-02)
 * - Files not in current walk get is_missing=1 (D-03)
 * - Files that reappear get is_missing=0 via scanFile upsert (D-04)
 * - Concurrency limited to max 4 simultaneous ffprobe calls
 *
 * @param probeFn - injectable for testing; defaults to real ffprobe
 */
export async function scanLibrary(
  db: Database,
  libraryRoot: string,
  probeFn: ProbeFn = defaultProbeFn
): Promise<void> {
  let paths: string[];
  try {
    paths = walkLibrary(libraryRoot);
  } catch (err) {
    console.warn(
      `[scanner] Could not walk library "${libraryRoot}": ${(err as Error).message}. Skipping scan.`
    );
    return;
  }

  console.log(`[scanner] Scanning ${paths.length} .m4b files in ${libraryRoot}`);

  // Semaphore: limit concurrency to 4
  const MAX_CONCURRENT = 4;
  const active = new Set<Promise<void>>();
  let newOrUpdated = 0;

  // Count rows before scanning to track new/updated
  const beforeCount = (
    db.query("SELECT COUNT(*) as cnt FROM books").get() as { cnt: number }
  ).cnt;

  for (const filePath of paths) {
    const task = scanFile(db, filePath, probeFn).then(() => {
      active.delete(task);
    });
    active.add(task);

    if (active.size >= MAX_CONCURRENT) {
      await Promise.race(active);
    }
  }

  // Wait for all remaining tasks
  await Promise.all(active);

  const afterCount = (
    db.query("SELECT COUNT(*) as cnt FROM books").get() as { cnt: number }
  ).cnt;
  newOrUpdated = afterCount - beforeCount;

  // Mark missing files — D-03
  // Files in DB but not in current walk → is_missing = 1
  let missingCount = 0;

  if (paths.length === 0) {
    // All previously tracked files are now missing
    const result = db
      .prepare(
        "UPDATE books SET is_missing = 1, updated_at = datetime('now') WHERE is_missing = 0"
      )
      .run();
    missingCount = result.changes;
  } else {
    // Build parameterized IN clause
    const placeholders = paths.map(() => "?").join(", ");
    const result = db
      .prepare(
        `UPDATE books SET is_missing = 1, updated_at = datetime('now')
         WHERE file_path NOT IN (${placeholders}) AND is_missing = 0`
      )
      .run(...paths);
    missingCount = result.changes;
  }

  console.log(
    `[scanner] Scan complete: ${paths.length} files found, ${newOrUpdated} new/updated, ${missingCount} marked missing`
  );
}
