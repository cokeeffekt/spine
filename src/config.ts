/**
 * Centralized environment configuration for Spine.
 *
 * Library roots: Spine can scan multiple roots — typically a read-only source
 * library (`/books`) plus a writable materialized library (`/converted`) where
 * the conversion pipeline writes clean .m4b files.
 */

/**
 * Parsed list of library roots, in scan order.
 * `LIBRARY_ROOTS` (comma-separated) takes precedence; falls back to the legacy
 * single `LIBRARY_ROOT`; defaults to `/books`.
 */
export function getLibraryRoots(): string[] {
  const multi = process.env["LIBRARY_ROOTS"];
  if (multi && multi.trim()) {
    return multi.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [process.env["LIBRARY_ROOT"] ?? "/books"];
}

/** Writable directory where materialized .m4b files are written. */
export function getConvertOutputDir(): string {
  return process.env["CONVERT_OUTPUT_DIR"] ?? "/converted";
}

/** Whether the materialization pipeline is enabled (default on). */
export function isConvertEnabled(): boolean {
  return (process.env["CONVERT_ENABLED"] ?? "true").toLowerCase() !== "false";
}

/**
 * When true, the library list shows ONLY converted books (those under
 * CONVERT_OUTPUT_DIR) — un-converted sources are hidden until materialized.
 * Default off to preserve the show-everything behaviour.
 */
export function isLibraryConvertedOnly(): boolean {
  return (process.env["LIBRARY_CONVERTED_ONLY"] ?? "false").toLowerCase() === "true";
}

/** AAC target bitrate for mp3→m4b transcodes (m4b remux uses copy and ignores this). */
export function getConvertBitrate(): string {
  return process.env["CONVERT_BITRATE"] ?? "64k";
}

/** AAC channel count for transcodes (1 = mono, typical for spoken word). */
export function getConvertChannels(): number {
  return parseInt(process.env["CONVERT_CHANNELS"] ?? "1", 10);
}

/** A folder with at most this many audio files is treated as "monolithic" (derive chapters). */
export function getMonolithicFileThreshold(): number {
  return parseInt(process.env["CONVERT_MONO_FILES"] ?? "2", 10);
}

/** Fixed-interval chapter length (seconds) used as the last-resort chapterizer. */
export function getFixedChapterSec(): number {
  return parseInt(process.env["CONVERT_FIXED_CHAPTER_SEC"] ?? "900", 10);
}
