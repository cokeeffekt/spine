import { Database } from "bun:sqlite";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import type { NormalizedChapter } from "../types.js";
import { parseFolderName } from "./folder-name.js";
import { searchAudibleAsin } from "./audible.js";
import { fetchAudnexusBook, audnexusGenre, audnexusYear, audnexusSeries, audnexusTitle, audnexusAuthor } from "../scanner/enrichment.js";
import { downloadCover } from "../scanner/cover.js";
import { deriveChapters } from "./chapters.js";
import { buildFfmetadata } from "./ffmetadata.js";
import type { BookMetaTags } from "./ffmetadata.js";
import { materialize, buildOutputPath, buildConcatList } from "./transcode.js";
import type { SourceKind } from "./transcode.js";
import {
  getConvertOutputDir,
  getConvertBitrate,
  getConvertChannels,
  getMonolithicFileThreshold,
  getFixedChapterSec,
  isConvertEnabled,
  getConvertConcurrency,
} from "../config.js";

const TMP_ROOT = "/data/tmp";

export type ConvertProgressEvent =
  | { type: "start"; total: number }
  | { type: "job"; id: number; source: string; status: string; progress: number }
  | { type: "done"; completed: number; failed: number };

let _convertRunning = false;
export const convertEmitter = new EventEmitter();
export function isConvertRunning(): boolean {
  return _convertRunning;
}

interface BookRow {
  id: number;
  file_path: string;
  title: string | null;
  author: string | null;
  narrator: string | null;
  series_title: string | null;
  series_position: string | null;
  description: string | null;
  genre: string | null;
  year: string | null;
  language: string | null;
  publisher: string | null;
  duration_sec: number | null;
  cover_path: string | null;
  asin: string | null;
}

interface JobRow {
  id: number;
  source_path: string;
  source_kind: SourceKind;
  metadata_json: string | null;
}

/** A source book is mp3folder unless its path is a single .m4b file. */
function kindForPath(filePath: string): SourceKind {
  return filePath.toLowerCase().endsWith(".m4b") ? "m4b" : "mp3folder";
}

/** Heuristic: a single token containing digits looks like a ripped filename code. */
function looksLikeJunkTitle(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  if (!t) return true;
  return !/\s/.test(t) && /\d/.test(t);
}

/**
 * Enqueue every source book (in any non-converted root) that lacks a job.
 * Books that live under the output dir (the materialized .m4b themselves) are
 * never enqueued. Returns the number of new jobs created.
 */
export function enqueueUnmaterialized(db: Database, outputDir: string = getConvertOutputDir()): number {
  const outPrefix = outputDir.replace(/\/+$/, "") + "/";
  const candidates = db.query<{ id: number; file_path: string }, [string]>(
    `SELECT id, file_path FROM books
     WHERE is_missing = 0
       AND file_path NOT LIKE ?1
       AND file_path NOT IN (SELECT source_path FROM conversion_jobs)`
  ).all(outPrefix + "%");

  const insert = db.prepare(
    `INSERT OR IGNORE INTO conversion_jobs (source_path, source_kind, status)
     VALUES (?, ?, 'pending')`
  );
  let count = 0;
  for (const c of candidates) {
    const res = insert.run(c.file_path, kindForPath(c.file_path));
    if (res.changes > 0) count++;
  }
  if (count > 0) console.log(`[convert] Enqueued ${count} new conversion job(s)`);
  return count;
}

/** Map source chapter rows to NormalizedChapter (drop DB-only fields). */
function toNormalizedChapters(
  rows: Array<{ chapter_idx: number; title: string | null; start_sec: number; end_sec: number; duration_sec: number; file_path: string | null }>
): NormalizedChapter[] {
  return rows.map((r) => ({
    chapter_idx: r.chapter_idx,
    title: r.title,
    start_sec: r.start_sec,
    end_sec: r.end_sec,
    duration_sec: r.duration_sec,
    file_path: r.file_path ?? undefined,
  }));
}

/**
 * Process one conversion job end-to-end: resolve metadata + chapters, transcode/
 * remux into the output library, and ingest the result. Throws on failure.
 */
async function processJob(
  db: Database,
  job: JobRow,
  outputDir: string,
  onProgress: (fraction: number) => void
): Promise<{ outputPath: string; chapterSource: string; resolved: Record<string, unknown> }> {
  const book = db.query<BookRow, [string]>(
    `SELECT id, file_path, title, author, narrator, series_title, series_position,
            description, genre, year, language, publisher, duration_sec, cover_path, asin
     FROM books WHERE file_path = ?`
  ).get(job.source_path);
  if (!book) throw new Error(`Source book not found for ${job.source_path}`);

  const overrides = job.metadata_json ? safeParse(job.metadata_json) : {};

  // --- Title/author: prefer folder-name for mp3 (junk tags), embedded for m4b ---
  const base = job.source_kind === "m4b"
    ? path.basename(job.source_path, path.extname(job.source_path))
    : path.basename(job.source_path);
  const parsed = parseFolderName(base);

  let title: string | null;
  let author: string | null;
  if (job.source_kind === "mp3folder") {
    title = pick(overrides.title, looksLikeJunkTitle(book.title) ? null : book.title, parsed.title, book.title);
    author = pick(overrides.author, parsed.author, book.author);
  } else {
    title = pick(overrides.title, book.title, parsed.title);
    author = pick(overrides.author, book.author, parsed.author);
  }

  // --- Fill the rest from the scanned book, then admin overrides ---
  let narrator = pick(overrides.narrator, book.narrator);
  let series_title = pick(overrides.series_title, book.series_title);
  let series_position = pick(overrides.series_position, book.series_position);
  let description = pick(overrides.description, book.description);
  let genre = pick(overrides.genre, book.genre);
  let year = pick(overrides.year, book.year);
  let language = pick(overrides.language, book.language);
  let publisher = pick(overrides.publisher, book.publisher);
  let asin = pick(overrides.asin, book.asin);
  let coverImageUrl: string | null = null;

  // --- Resolve ASIN + enrich gaps from Audnexus ---
  // Search with the distinctive folder title (e.g. "10. Barbarians Hope" -> "Barbarians
  // Hope") and the file duration, so runtime disambiguation picks the right entry rather
  // than the series' book 1 / omnibus.
  const deNumberedTitle = parsed.title.replace(/^\s*\d+\s*[.)\-]\s*/, "").trim();
  const searchTitle = job.source_kind === "mp3folder" ? (deNumberedTitle || title) : (title || deNumberedTitle);
  if (!asin) asin = await searchAudibleAsin(searchTitle, author, { durationSec: book.duration_sec ?? undefined });
  let apiTitle: string | null = null;
  let apiAuthor: string | null = null;
  if (asin) {
    const data = await fetchAudnexusBook(asin);
    if (data) {
      const series = audnexusSeries(data);
      apiTitle = audnexusTitle(data);
      apiAuthor = audnexusAuthor(data);
      description = description ?? data.description ?? null;
      narrator = narrator ?? data.narrators?.[0]?.name ?? null;
      series_title = series_title ?? series?.name ?? null;
      series_position = series_position ?? series?.position ?? null;
      genre = genre ?? audnexusGenre(data);
      year = year ?? audnexusYear(data);
      language = language ?? data.language ?? null;
      publisher = publisher ?? data.publisherName ?? null;
      if (data.image) coverImageUrl = data.image;
    }
  }

  // Prefer the canonical Audnexus title/author over folder-name parsing (which keeps junk like
  // "Christine (read by Holter Graham)"). Admin overrides still win; folder values are the
  // fallback when there's no API match.
  title = pick(overrides.title, apiTitle, title);
  author = pick(overrides.author, apiAuthor, author);

  // --- Cover: local existing file wins; otherwise download the Audnexus image ---
  let coverPath: string | null = null;
  if (book.cover_path && !/^https?:\/\//i.test(book.cover_path) && fs.existsSync(book.cover_path)) {
    coverPath = book.cover_path;
  } else if (coverImageUrl) {
    coverPath = await downloadCover(coverImageUrl, `src-${book.id}`);
  } else if (book.cover_path && /^https?:\/\//i.test(book.cover_path)) {
    coverPath = await downloadCover(book.cover_path, `src-${book.id}`);
  }

  // --- Gather chapter inputs ---
  const chapterRows = db.query<{ chapter_idx: number; title: string | null; start_sec: number; end_sec: number; duration_sec: number; file_path: string | null }, [number]>(
    `SELECT chapter_idx, title, start_sec, end_sec, duration_sec, file_path
     FROM chapters WHERE book_id = ? ORDER BY chapter_idx`
  ).all(book.id);
  const sourceChapters = toNormalizedChapters(chapterRows);
  const totalDurationSec = book.duration_sec ?? sourceChapters.reduce((s, c) => s + c.duration_sec, 0);

  // --- Prepare working dir + concat list (mp3folder) ---
  const workDir = path.join(TMP_ROOT, `job-${job.id}`);
  fs.mkdirSync(workDir, { recursive: true });
  let concatListPath: string | undefined;
  let trackCount = 1;
  if (job.source_kind === "mp3folder") {
    const trackPaths = sourceChapters.map((c) => c.file_path!).filter(Boolean);
    trackCount = trackPaths.length;
    concatListPath = path.join(workDir, "concat.txt");
    fs.writeFileSync(concatListPath, buildConcatList(trackPaths));
  }

  // --- Derive chapters ---
  const derived = await deriveChapters({
    totalDurationSec,
    embeddedChapters: job.source_kind === "m4b" ? sourceChapters : undefined,
    perFileChapters: job.source_kind === "mp3folder" ? sourceChapters : undefined,
    fileCount: trackCount,
    asin,
    silenceInput: job.source_kind === "mp3folder" ? concatListPath : book.file_path,
    useConcatForSilence: job.source_kind === "mp3folder",
    monoThreshold: getMonolithicFileThreshold(),
    fixedChapterSec: getFixedChapterSec(),
  });

  // --- Build FFMETADATA ---
  const metaTags: BookMetaTags = { title, author, narrator, series_title, series_position, year, genre, description, language, publisher };
  const ffmetaPath = path.join(workDir, "ffmeta.txt");
  fs.writeFileSync(ffmetaPath, buildFfmetadata(metaTags, derived.chapters));

  // --- Transcode / remux ---
  const outPath = buildOutputPath(outputDir, author, title);
  await materialize({
    kind: job.source_kind,
    sourceFile: job.source_kind === "m4b" ? book.file_path : undefined,
    concatListPath,
    ffmetaPath,
    coverPath,
    outPath,
    totalDurationSec,
    bitrate: getConvertBitrate(),
    channels: getConvertChannels(),
    onProgress,
  });

  // --- Ingest the new m4b immediately (dynamic import avoids a static cycle) ---
  try {
    const { scanFile } = await import("../scanner/index.js");
    await scanFile(db, outPath);
    // Make the DB authoritative from our resolved metadata. ffmpeg's MP4 tag
    // round-trip is lossy for some fields (language lands on the stream, there is
    // no standard 'publisher' atom), so re-probing the output would drop them.
    const newBook = db.query<{ id: number }, [string]>(
      "SELECT id FROM books WHERE file_path = ?"
    ).get(outPath);
    if (newBook) {
      db.prepare(
        `UPDATE books SET title = ?, author = ?, narrator = ?, series_title = ?,
                series_position = ?, description = ?, genre = ?, year = ?,
                language = ?, publisher = ?, asin = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(title, author, narrator, series_title, series_position, description,
            genre, year, language, publisher, asin, newBook.id);
    }
  } catch (err) {
    console.warn(`[convert] Post-convert scan of ${outPath} failed: ${(err as Error).message}`);
  }

  // --- Cleanup working dir ---
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }

  const resolved = {
    title, author, narrator, series_title, series_position,
    year, genre, description, language, publisher, asin,
    chapter_source: derived.source, output_path: outPath,
  };
  return { outputPath: outPath, chapterSource: derived.source, resolved };
}

/**
 * Drain pending conversion jobs serially (CPU-heavy transcodes). Safe to call
 * repeatedly — does nothing if already running or disabled.
 */
export async function runConverter(db: Database, outputDir: string = getConvertOutputDir()): Promise<void> {
  if (_convertRunning) return;
  if (!isConvertEnabled()) return;
  _convertRunning = true;
  let completed = 0;
  let failed = 0;
  const concurrency = getConvertConcurrency();
  try {
    // Reclaim jobs orphaned by a restart/crash mid-transcode (nothing is
    // legitimately 'processing' when a fresh run starts).
    db.prepare(`UPDATE conversion_jobs SET status = 'pending', progress = 0 WHERE status = 'processing'`).run();

    const total = (db.query<{ c: number }, []>(`SELECT COUNT(*) AS c FROM conversion_jobs WHERE status = 'pending'`).get())?.c ?? 0;
    convertEmitter.emit("progress", { type: "start", total } as ConvertProgressEvent);
    console.log(`[convert] Draining ${total} pending job(s) at concurrency ${concurrency}`);

    // Atomically claim the next pending job (synchronous, so safe across the pool).
    const claim = (): JobRow | null => {
      const job = db.query<JobRow, []>(
        `SELECT id, source_path, source_kind, metadata_json FROM conversion_jobs
         WHERE status = 'pending' ORDER BY id LIMIT 1`
      ).get();
      if (!job) return null;
      db.prepare(`UPDATE conversion_jobs SET status = 'processing', progress = 0, error = NULL, updated_at = datetime('now') WHERE id = ?`).run(job.id);
      return job;
    };

    const processOne = async (job: JobRow): Promise<void> => {
      convertEmitter.emit("progress", { type: "job", id: job.id, source: job.source_path, status: "processing", progress: 0 } as ConvertProgressEvent);
      let lastPct = 0;
      const onProgress = (frac: number) => {
        const pct = Math.floor(frac * 100);
        if (pct >= lastPct + 2) {
          lastPct = pct;
          db.prepare(`UPDATE conversion_jobs SET progress = ?, updated_at = datetime('now') WHERE id = ?`).run(frac, job.id);
          convertEmitter.emit("progress", { type: "job", id: job.id, source: job.source_path, status: "processing", progress: frac } as ConvertProgressEvent);
        }
      };
      try {
        const { outputPath, chapterSource, resolved } = await processJob(db, job, outputDir, onProgress);
        db.prepare(
          `UPDATE conversion_jobs SET status = 'completed', progress = 1, output_path = ?, chapter_source = ?, asin = ?, metadata_json = ?, error = NULL, updated_at = datetime('now') WHERE id = ?`
        ).run(outputPath, chapterSource, (resolved as any).asin ?? null, JSON.stringify(resolved), job.id);
        completed++;
        convertEmitter.emit("progress", { type: "job", id: job.id, source: job.source_path, status: "completed", progress: 1 } as ConvertProgressEvent);
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`[convert] Job ${job.id} failed: ${msg}`);
        db.prepare(`UPDATE conversion_jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?`).run(msg, job.id);
        failed++;
        convertEmitter.emit("progress", { type: "job", id: job.id, source: job.source_path, status: "failed", progress: 0 } as ConvertProgressEvent);
      }
    };

    // Concurrency pool: keep up to `concurrency` conversions in flight.
    const active = new Set<Promise<void>>();
    const fill = () => {
      while (active.size < concurrency) {
        const job = claim();
        if (!job) break;
        const p = processOne(job).finally(() => active.delete(p));
        active.add(p);
      }
    };
    fill();
    while (active.size > 0) {
      await Promise.race(active);
      fill();
    }
  } finally {
    _convertRunning = false;
    convertEmitter.emit("progress", { type: "done", completed, failed } as ConvertProgressEvent);
    convertEmitter.emit("done");
    console.log(`[convert] Converter idle — ${completed} completed, ${failed} failed this run`);
  }
}

/**
 * Re-resolve metadata for already-converted books using the improved (runtime-aware)
 * Audible match, and OVERWRITE the Audnexus-sourced fields (title, author, series, narrator,
 * year, genre, language, publisher, description, asin) + a missing cover. Admin overrides
 * (conversion_jobs.metadata_json) still win. Used to backfill books converted before a
 * matching/metadata improvement — updates the DB row only (the embedded m4b tags keep their
 * original values until the book is reconverted, but the library reads the DB).
 */
export async function reEnrichConvertedBooks(db: Database, outputDir: string = getConvertOutputDir()): Promise<{ updated: number; checked: number }> {
  const jobs = db.query<{ source_path: string; output_path: string; metadata_json: string | null }, []>(
    `SELECT source_path, output_path, metadata_json FROM conversion_jobs WHERE status = 'completed' AND output_path IS NOT NULL`
  ).all();
  let updated = 0;
  let checked = 0;
  for (const j of jobs) {
    const book = db.query<{ id: number; title: string | null; author: string | null; duration_sec: number | null; cover_path: string | null }, [string]>(
      `SELECT id, title, author, duration_sec, cover_path FROM books WHERE file_path = ?`
    ).get(j.output_path);
    if (!book) continue;
    checked++;

    const base = j.source_path.toLowerCase().endsWith(".m4b")
      ? path.basename(j.source_path, path.extname(j.source_path))
      : path.basename(j.source_path);
    const deNum = parseFolderName(base).title.replace(/^\s*\d+\s*[.)\-]\s*/, "").trim();
    const searchTitle = deNum || book.title;

    const asin = await searchAudibleAsin(searchTitle, book.author, { durationSec: book.duration_sec ?? undefined });
    if (!asin) continue;
    const data = await fetchAudnexusBook(asin);
    if (!data) continue;

    const series = audnexusSeries(data);
    const overrides = j.metadata_json ? safeParse(j.metadata_json) : {};
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => {
      if (val !== null && val !== undefined && String(val).trim()) { sets.push(`${col} = ?`); params.push(String(val).trim()); }
    };
    // Canonical title/author from the API (admin overrides win); folder-derived names otherwise.
    set("title", pick(overrides.title, audnexusTitle(data)));
    set("author", pick(overrides.author, audnexusAuthor(data)));
    set("asin", asin);
    set("series_title", series?.name);
    set("series_position", series?.position);
    set("narrator", data.narrators?.[0]?.name);
    set("description", data.description);
    set("genre", audnexusGenre(data));
    set("year", audnexusYear(data));
    set("language", data.language);
    set("publisher", data.publisherName);
    if (sets.length > 0) {
      db.prepare(`UPDATE books SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...params, book.id);
      updated++;
    }

    const hasLocalCover = book.cover_path && !/^https?:\/\//i.test(book.cover_path) && fs.existsSync(book.cover_path);
    if (!hasLocalCover && data.image) {
      const local = await downloadCover(data.image, book.id);
      if (local) db.prepare(`UPDATE books SET cover_path = ? WHERE id = ?`).run(local, book.id);
    }
  }
  return { updated, checked };
}

// ─── small helpers ───────────────────────────────────────────────────────────

function safeParse(json: string): Record<string, any> {
  try { return JSON.parse(json) ?? {}; } catch { return {}; }
}

/** First non-empty (string) / non-null candidate, else null. */
function pick(...vals: Array<unknown>): string | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}
