import * as fs from "fs";
import * as path from "path";
import { Database } from "bun:sqlite";
import { EventEmitter } from 'events'
import { probeFile, normalizeMetadata } from "./probe.js";
import { extractCoverArt, resolveCoverPath } from "./cover.js";
import { walkLibrary } from "./walk.js";
import type { ScanItem } from "./walk.js";
import { applyFallbackMetadata } from "./fallback.js";
import { fetchAudnexusBook, applyEnrichment } from "./enrichment.js";
import { parseTrackNumber, sortTracks, parseDiscNumber } from "./mp3-sort.js";
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

// ─── MP3 folder scanner helpers ──────────────────────────────────────────────

/**
 * Collect all .mp3 files for an MP3 audiobook folder, handling multi-disc layouts.
 *
 * Per D-12/D-13/D-14:
 * - If disc subdirectories exist, ignore loose .mp3 files.
 * - Disc subfolders are any whose names match DISC_FOLDER_RE (e.g. "Disc 1", "CD 2").
 * - Returns { filePath, discNumber } for each track (discNumber=0 for flat layouts).
 */
function resolveMp3Files(
  folderPath: string
): Array<{ filePath: string; discNumber: number }> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const discSubdirs: Array<{ name: string; discNumber: number }> = [];
  const looseMp3s: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const discNum = parseDiscNumber(entry.name);
      if (discNum !== null) {
        discSubdirs.push({ name: entry.name, discNumber: discNum });
      }
    } else if (entry.isFile() && entry.name.endsWith(".mp3")) {
      looseMp3s.push(path.join(folderPath, entry.name));
    }
  }

  // D-14: If disc subdirectories exist, ignore loose .mp3 files
  if (discSubdirs.length > 0) {
    const result: Array<{ filePath: string; discNumber: number }> = [];
    for (const disc of discSubdirs) {
      const discPath = path.join(folderPath, disc.name);
      // Collect all .mp3 files from the disc subfolder (flat read)
      try {
        const discEntries = fs.readdirSync(discPath, { withFileTypes: true });
        for (const e of discEntries) {
          if (e.isFile() && e.name.endsWith(".mp3")) {
            result.push({ filePath: path.join(discPath, e.name), discNumber: disc.discNumber });
          }
        }
      } catch {
        // skip inaccessible disc folder
      }
    }
    return result;
  }

  // No disc subfolders — collect loose .mp3 files with discNumber = 0
  return looseMp3s.map((fp) => ({ filePath: fp, discNumber: 0 }));
}

/**
 * Merge metadata from multiple tracks into a single NormalizedMetadata.
 *
 * Uses the first track's metadata as base, fills null fields from subsequent tracks.
 * Per Pitfall 5: nulls out series_position if it looks like a TRCK value (e.g. "3" or "3/12").
 */
function mergeTrackMetadata(metas: NormalizedMetadata[]): NormalizedMetadata {
  if (metas.length === 0) {
    return {
      title: null, author: null, narrator: null,
      series_title: null, series_position: null,
      description: null, genre: null, publisher: null,
      year: null, language: null, duration_sec: null,
      codec: null, asin: null, has_cover_stream: false,
      chapters: [],
    };
  }

  const result: NormalizedMetadata = {
    ...metas[0],
    chapters: [],
  };

  // Merge null fields from subsequent tracks
  for (let i = 1; i < metas.length; i++) {
    const m = metas[i];
    if (result.title === null && m.title !== null) result.title = m.title;
    if (result.author === null && m.author !== null) result.author = m.author;
    if (result.narrator === null && m.narrator !== null) result.narrator = m.narrator;
    if (result.series_title === null && m.series_title !== null) result.series_title = m.series_title;
    if (result.series_position === null && m.series_position !== null) result.series_position = m.series_position;
    if (result.description === null && m.description !== null) result.description = m.description;
    if (result.genre === null && m.genre !== null) result.genre = m.genre;
    if (result.publisher === null && m.publisher !== null) result.publisher = m.publisher;
    if (result.year === null && m.year !== null) result.year = m.year;
    if (result.language === null && m.language !== null) result.language = m.language;
    if (result.asin === null && m.asin !== null) result.asin = m.asin;
    // OR: any track with cover = true
    if (m.has_cover_stream) result.has_cover_stream = true;
  }

  // Duration is sum of all tracks
  result.duration_sec = metas.reduce((sum, m) => sum + (m.duration_sec ?? 0), 0);

  // Pitfall 5: if series_position looks like a TRCK tag value (e.g. "3" or "3/12"),
  // null it out — it was the track number, not a real series position.
  if (result.series_position !== null && /^\d+(?:\/\d+)?$/.test(result.series_position)) {
    result.series_position = null;
  }

  return result;
}

/**
 * Scan a folder of .mp3 files as a single audiobook and upsert into SQLite.
 *
 * - Probes all .mp3 tracks in parallel (semaphore MAX_CONCURRENT=4)
 * - Sorts tracks by disc number then TRCK tag (with filename natural sort fallback)
 * - Builds cumulative chapter timestamps with file_path references
 * - Merges metadata across all tracks; falls back to folder name (title) and grandparent (author)
 * - Incremental: skips if folder mtime + sizeSum unchanged
 */
export async function scanFolder(
  db: Database,
  folderPath: string,
  probeFn: ProbeFn = defaultProbeFn
): Promise<void> {
  // a. Collect tracks
  const mp3Files = resolveMp3Files(folderPath);
  if (mp3Files.length === 0) return;

  // c. Stat the folder for incremental check
  let folderStat: fs.Stats;
  try {
    folderStat = fs.statSync(folderPath);
  } catch {
    console.warn(`[scanner] Could not stat folder, skipping: ${folderPath}`);
    return;
  }
  const mtime = folderStat.mtimeMs;

  // d. Compute sizeSum
  const sizeSum = mp3Files.reduce((sum, f) => {
    try {
      return sum + fs.statSync(f.filePath).size;
    } catch {
      return sum;
    }
  }, 0);

  // e. Incremental check
  const existing = db
    .query("SELECT id, file_mtime, file_size, is_missing, cover_path FROM books WHERE file_path = ?")
    .get(folderPath) as { id: number; file_mtime: number; file_size: number; is_missing: number; cover_path: string | null } | null;

  if (existing && existing.file_mtime === mtime && existing.file_size === sizeSum) {
    if (existing.is_missing === 1) {
      db.prepare(
        "UPDATE books SET is_missing = 0, updated_at = datetime('now') WHERE file_path = ?"
      ).run(folderPath);
    }
    return;
  }

  // f. Probe all tracks in parallel with semaphore
  const MAX_CONCURRENT = 4;
  const active = new Set<Promise<void>>();
  const probedTracks: Array<{
    filePath: string;
    discNumber: number;
    trackNumber: number | null;
    metadata: NormalizedMetadata;
  }> = [];

  for (const mp3File of mp3Files) {
    const task = (async () => {
      let meta: NormalizedMetadata;
      try {
        meta = await probeFn(mp3File.filePath);
      } catch (err) {
        console.warn(`[scanner] Failed to probe "${mp3File.filePath}": ${(err as Error).message}. Skipping.`);
        return;
      }
      // Extract track number from series_position (which maps from TRCK tag)
      const trackNumber = parseTrackNumber(meta.series_position);
      probedTracks.push({
        filePath: mp3File.filePath,
        discNumber: mp3File.discNumber,
        trackNumber,
        metadata: meta,
      });
    })();
    active.add(task);
    task.then(() => active.delete(task));
    if (active.size >= MAX_CONCURRENT) await Promise.race(active);
  }
  await Promise.all(active);

  if (probedTracks.length === 0) return;

  // g. Sort: by discNumber, then by sortTracks within each disc group
  // Group by discNumber
  const discGroups = new Map<number, typeof probedTracks>();
  for (const t of probedTracks) {
    const existing = discGroups.get(t.discNumber);
    if (existing) {
      existing.push(t);
    } else {
      discGroups.set(t.discNumber, [t]);
    }
  }

  // Sort disc numbers
  const sortedDiscNumbers = [...discGroups.keys()].sort((a, b) => a - b);

  const sortedTracks: typeof probedTracks = [];
  for (const discNum of sortedDiscNumbers) {
    const group = discGroups.get(discNum)!;
    const sortInput = group.map((t) => ({ ...t }));
    const sorted = sortTracks(sortInput);
    sortedTracks.push(...sorted);
  }

  // h. Merge metadata
  let merged = mergeTrackMetadata(sortedTracks.map((t) => t.metadata));

  // h2. MP3 convention: album tag = book title, title tag = track/chapter name.
  //     If album is consistent across tracks, promote it to the book title.
  if (merged.series_title !== null) {
    const albumValues = sortedTracks.map((t) => t.metadata.series_title).filter(Boolean);
    const allSame = albumValues.length > 0 && albumValues.every((v) => v === albumValues[0]);
    if (allSame) {
      merged.title = merged.series_title;
      merged.series_title = null;
    }
  }

  // i. Apply fallback (folder mode — title=folder name, author=grandparent)
  merged = applyFallbackMetadata(merged, folderPath, true);

  // j. Build chapter list with cumulative timestamps
  let cumulativeSec = 0;
  merged.chapters = sortedTracks.map((track, idx) => {
    const duration = track.metadata.duration_sec ?? 0;
    const chapter = {
      chapter_idx: idx,
      title: track.metadata.title ?? path.basename(track.filePath, path.extname(track.filePath)),
      start_sec: cumulativeSec,
      end_sec: cumulativeSec + duration,
      duration_sec: duration,
      file_path: track.filePath,
    };
    cumulativeSec += duration;
    return chapter;
  });
  merged.duration_sec = cumulativeSec;

  // k. UPSERT into books
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
    folderPath,
    mtime,
    sizeSum,
    merged.title,
    merged.author,
    merged.narrator,
    merged.series_title,
    merged.series_position,
    merged.description,
    merged.genre,
    merged.publisher,
    merged.year,
    merged.language,
    merged.duration_sec,
    merged.codec,
    null,  // cover_path updated below after we have the book ID
    merged.asin
  );

  // l. Get book_id
  const bookRow = db
    .query("SELECT id FROM books WHERE file_path = ?")
    .get(folderPath) as { id: number };

  // m. Cover art
  let coverPath: string | null = null;

  // Find first track with embedded cover
  const trackWithCover = sortedTracks.find((t) => t.metadata.has_cover_stream);
  if (trackWithCover) {
    try {
      coverPath = await extractCoverArt(trackWithCover.filePath, true, bookRow.id);
    } catch {
      coverPath = null;
    }
  }

  // Scan folder directly for cover images
  if (!coverPath) {
    const imageNames = ["cover.jpg", "cover.jpeg", "cover.png", "folder.jpg", "folder.png"];
    for (const name of imageNames) {
      const p = path.join(folderPath, name);
      if (fs.existsSync(p)) { coverPath = p; break; }
    }
    if (!coverPath) {
      try {
        const files = fs.readdirSync(folderPath);
        for (const f of files) {
          if (/\.(jpe?g|png)$/i.test(f)) { coverPath = path.join(folderPath, f); break; }
        }
      } catch { /* ignore */ }
    }
  }

  // n. Update cover_path
  db.prepare("UPDATE books SET cover_path = ? WHERE id = ?").run(coverPath, bookRow.id);

  // o. Atomically replace chapters WITH file_path
  db.transaction(() => {
    db.prepare("DELETE FROM chapters WHERE book_id = ?").run(bookRow.id);
    const insertChapter = db.prepare(
      `INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec, file_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const ch of merged.chapters) {
      insertChapter.run(bookRow.id, ch.chapter_idx, ch.title, ch.start_sec, ch.end_sec, ch.duration_sec, ch.file_path ?? null);
    }
  })();
}

/**
 * Walk a library directory, scan all .m4b files and MP3 folders, mark missing items.
 *
 * - Full walk on every call (D-01)
 * - Incremental: unchanged files/folders skip ffprobe (D-02)
 * - Items not in current walk get is_missing=1 (D-03)
 * - Items that reappear get is_missing=0 via upsert (D-04)
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
  let items: ScanItem[];
  try {
    items = walkLibrary(libraryRoot);
  } catch (err) {
    console.warn(
      `[scanner] Could not walk library "${libraryRoot}": ${(err as Error).message}. Skipping scan.`
    );
    return;
  }

  // Build allPaths for missing-books query
  const allPaths = items.map((item) => (item.kind === "file" ? item.path : item.folderPath));

  console.log(`[scanner] Scanning ${items.length} items in ${libraryRoot}`);

  // Emit start event
  onProgress?.({ type: 'start', total: items.length })

  // Semaphore: limit concurrency to 4
  const MAX_CONCURRENT = 4;
  const active = new Set<Promise<void>>();

  // Count rows before scanning to track new books
  const beforeCount = (
    db.query("SELECT COUNT(*) as cnt FROM books").get() as { cnt: number }
  ).cnt;

  let scanned = 0;

  for (const item of items) {
    const currentPath = item.kind === "file" ? item.path : item.folderPath;
    const task = (item.kind === "file"
      ? scanFile(db, item.path, probeFn)
      : scanFolder(db, item.folderPath, probeFn)
    ).then(() => {
      scanned++;
      onProgress?.({ type: 'file', scanned, total: items.length, current: currentPath });
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

  if (allPaths.length === 0) {
    // All previously tracked files are now missing
    const result = db
      .prepare(
        "UPDATE books SET is_missing = 1, updated_at = datetime('now') WHERE is_missing = 0"
      )
      .run();
    missingCount = result.changes;
  } else {
    // Build parameterized IN clause
    const placeholders = allPaths.map(() => "?").join(", ");
    const result = db
      .prepare(
        `UPDATE books SET is_missing = 1, updated_at = datetime('now')
         WHERE file_path NOT IN (${placeholders}) AND is_missing = 0`
      )
      .run(...allPaths);
    missingCount = result.changes;
  }

  console.log(`[scanner] File scan phase complete: ${items.length} scanned, ${newBooks} new, ${missingCount} marked missing`)

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
    `[scanner] Scan complete: ${items.length} items found, ${newBooks} new, ${missingCount} marked missing, ${notEnriched} not enriched`
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
