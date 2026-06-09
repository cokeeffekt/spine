import type { NormalizedChapter } from "../types.js";

/**
 * Metadata fields embedded into the materialized .m4b via an FFMETADATA1 file.
 * All optional — only non-empty values are written.
 */
export interface BookMetaTags {
  title?: string | null;
  author?: string | null;
  narrator?: string | null;
  series_title?: string | null;
  series_position?: string | null;
  year?: string | null;
  genre?: string | null;
  description?: string | null;
  language?: string | null;
  publisher?: string | null;
}

/**
 * Escape a value for the FFMETADATA1 format: =, ;, #, \ and newlines must be
 * backslash-escaped. https://ffmpeg.org/ffmpeg-formats.html#Metadata
 */
function esc(value: string): string {
  return value.replace(/([=;#\\])/g, "\\$1").replace(/\n/g, "\\\n");
}

function line(key: string, value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const v = String(value).trim();
  if (!v) return "";
  return `${key}=${esc(v)}\n`;
}

/**
 * Build an FFMETADATA1 document containing global tags plus one [CHAPTER] block
 * per chapter (TIMEBASE 1/1000, START/END in milliseconds).
 */
export function buildFfmetadata(meta: BookMetaTags, chapters: NormalizedChapter[]): string {
  let out = ";FFMETADATA1\n";
  out += line("title", meta.title);
  out += line("artist", meta.author);
  out += line("album_artist", meta.author);
  out += line("album", meta.series_title);
  out += line("composer", meta.narrator);
  out += line("track", meta.series_position);
  out += line("date", meta.year);
  out += line("genre", meta.genre);
  out += line("language", meta.language);
  out += line("publisher", meta.publisher);
  out += line("description", meta.description);
  out += line("comment", meta.description);

  for (const ch of chapters) {
    const start = Math.max(0, Math.round(ch.start_sec * 1000));
    const end = Math.max(start, Math.round(ch.end_sec * 1000));
    out += "\n[CHAPTER]\n";
    out += "TIMEBASE=1/1000\n";
    out += `START=${start}\n`;
    out += `END=${end}\n`;
    if (ch.title) out += line("title", ch.title);
  }

  return out;
}
