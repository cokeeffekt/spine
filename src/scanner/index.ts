import * as fs from "fs";
import { Database } from "bun:sqlite";
import { EventEmitter } from 'events'
import { probeFile, normalizeMetadata } from "./probe.js";
import { extractCoverArt, resolveCoverPath } from "./cover.js";
import { walkLibrary } from "./walk.js";
import { applyFallbackMetadata } from "./fallback.js";
import { fetchAudnexusBook, applyEnrichment } from "./enrichment.js";
import type { NormalizedMetadata } from "../types.js";

/**
 * Type for an injectable probe function.
 * In production, calls probeFile + normalizeMetadata.
 * In tests, can be replaced with a fixture factory.
 */
export type ProbeFn = (filePath: string) => Promise<NormalizedMetadata>;

export type ScanProgressEvent =
  | { type: 'start'; total: number }
  | { type: 'file'; scanned: number; total: number; current: string }
  | { type: 'done'; newBooks: number; updatedBooks: number; missing: number; notEnriched: number }

export type ProgressCallback = (event: ScanProgressEvent) => void

// Module-level scan lock and event bridge
let _scanInProgress = false
export const scanEmitter = new EventEmitter()
export function isScanRunning(): boolean { return _scanInProgress }

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
    .query("SELECT id, file_mtime, file_size, is_missing, cover_path FROM books WHERE file_path = ?")
    .get(filePath) as { id: number; file_mtime: number; file_size: number; is_missing: number; cover_path: string | null } | null;

  if (existing && existing.file_mtime === mtime && existing.file_size === size) {
    // D-04: If the file was previously marked missing but is now present, unflag it
    if (existing.is_missing === 1) {
      db.prepare(
        "UPDATE books SET is_missing = 0, updated_at = datetime('now') WHERE file_path = ?"
      ).run(filePath);
    }

    // Re-attempt cover extraction if cover_path is missing (e.g. first scan wrote to read-only mount)
    if (!existing.cover_path) {
      let coverPath: string | null = null;
      try {
        const output = await probeFile(filePath);
        const meta = normalizeMetadata(output);
        if (meta.has_cover_stream) {
          coverPath = await extractCoverArt(filePath, true, existing.id);
        } else {
          coverPath = resolveCoverPath(filePath, false, existing.id);
        }
      } catch {
        coverPath = resolveCoverPath(filePath, false, existing.id);
      }
      if (coverPath) {
        db.prepare("UPDATE books SET cover_path = ? WHERE id = ?").run(coverPath, existing.id);
      }
    }

    return; // unchanged — skip full re-scan
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

  // UPSERT into books first to get the book ID, then extract cover using that ID.
  // Cover extraction writes to /data/covers/{bookId}.jpg (writable volume).
  // is_missing = 0 in both branches handles D-04 (reappearance unflagging)
  const upsert = db.prepare(`
    INSERT INTO books (
      file_path, file_mtime, file_size, is_missing,
      title, author, narrator, series_title, series_position,
      description, genre, publisher, year, language,
      duration_sec, codec, cover_path, asin, updated_at
    ) VALUES (
      ?, ?, ?, 0,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, datetime('now')
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
      asin            = excluded.asin,
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
    null,  // cover_path updated below after we have the book ID
    metadata.asin
  );

  // Get book_id for chapter insertion and cover extraction
  const bookRow = db
    .query("SELECT id FROM books WHERE file_path = ?")
    .get(filePath) as { id: number };

  // Determine cover path — extract AFTER insert so we have the book ID
  let coverPath: string | null = null;
  if (metadata.has_cover_stream) {
    try {
      coverPath = await extractCoverArt(filePath, true, bookRow.id);
    } catch {
      coverPath = null;
    }
  } else {
    coverPath = resolveCoverPath(filePath, false, bookRow.id);
  }

  // Update cover_path now that we have it
  db.prepare("UPDATE books SET cover_path = ? WHERE id = ?").run(coverPath, bookRow.id);

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
 * - Enrichment pass: fills metadata gaps from Audnexus for books with ASIN (D-08)
 *
 * @param probeFn - injectable for testing; defaults to real ffprobe
 * @param onProgress - optional callback for real-time progress events
 */
export async function scanLibrary(
  db: Database,
  libraryRoot: string,
  probeFn: ProbeFn = defaultProbeFn,
  onProgress?: ProgressCallback
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

  // Emit start event
  onProgress?.({ type: 'start', total: paths.length })

  // Semaphore: limit concurrency to 4
  const MAX_CONCURRENT = 4;
  const active = new Set<Promise<void>>();

  // Count rows before scanning to track new books
  const beforeCount = (
    db.query("SELECT COUNT(*) as cnt FROM books").get() as { cnt: number }
  ).cnt;

  let scanned = 0;

  for (const filePath of paths) {
    const task = scanFile(db, filePath, probeFn).then(() => {
      scanned++
      onProgress?.({ type: 'file', scanned, total: paths.length, current: filePath })
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
  const newBooks = afterCount - beforeCount;

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

  console.log(`[scanner] File scan phase complete: ${paths.length} scanned, ${newBooks} new, ${missingCount} marked missing`)

  // Enrichment pass — only for books with ASIN and missing fields (D-08)
  const enrichCandidates = db.query<{ id: number; asin: string }, []>(
    `SELECT id, asin FROM books WHERE asin IS NOT NULL AND (
      description IS NULL OR narrator IS NULL OR series_title IS NULL OR cover_path IS NULL
    )`
  ).all()

  let notEnriched = 0
  if (enrichCandidates.length > 0) {
    console.log(`[scanner] Enrichment: ${enrichCandidates.length} books with ASIN need metadata`)
    for (let i = 0; i < enrichCandidates.length; i++) {
      const candidate = enrichCandidates[i]
      console.log(`[scanner] Enriching ${i + 1}/${enrichCandidates.length}: ASIN ${candidate.asin}`)
      const data = await fetchAudnexusBook(candidate.asin)
      if (data) {
        const applied = applyEnrichment(db, candidate.id, data)
        if (!applied) notEnriched++
      } else {
        console.log(`[scanner] Enrichment failed for ASIN ${candidate.asin} — skipping`)
        notEnriched++
      }
    }
    console.log(`[scanner] Enrichment complete: ${enrichCandidates.length - notEnriched} enriched, ${notEnriched} failed/skipped`)
  } else {
    console.log(`[scanner] Enrichment: no candidates with ASIN and missing fields`)
  }

  // Books without ASIN that are also missing enrichable fields are counted as not enriched
  const noAsinCount = (db.query<{ cnt: number }, []>(
    `SELECT COUNT(*) as cnt FROM books WHERE asin IS NULL AND (
      description IS NULL OR narrator IS NULL OR series_title IS NULL OR cover_path IS NULL
    )`
  ).get())?.cnt ?? 0
  notEnriched += noAsinCount

  console.log(
    `[scanner] Scan complete: ${paths.length} files found, ${newBooks} new, ${missingCount} marked missing, ${notEnriched} not enriched`
  );

  onProgress?.({ type: 'done', newBooks, updatedBooks: 0, missing: missingCount, notEnriched })
}

/**
 * Run a library scan with the scan lock held.
 * Guarantees lock release even if scanLibrary throws (try/finally).
 * Bridges scan progress to the scanEmitter for SSE consumers.
 */
export async function runScan(db: Database, libraryRoot: string): Promise<void> {
  console.log(`[scan] runScan started, lock acquired`)
  _scanInProgress = true
  try {
    await scanLibrary(db, libraryRoot, defaultProbeFn, (event) => {
      console.log(`[scan] progress event: ${event.type}${event.type === 'file' ? ` (${event.scanned}/${event.total})` : ''}`)
      scanEmitter.emit('progress', event)
      if (event.type === 'done') scanEmitter.emit('done')
    })
    console.log(`[scan] runScan finished successfully`)
  } finally {
    _scanInProgress = false
    console.log(`[scan] lock released`)
  }
}
