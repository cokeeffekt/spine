import { spawn } from "child_process";
import type { FfprobeOutput, NormalizedMetadata, NormalizedChapter } from "../types";

/**
 * Normalize a tag value from a tags record, checking key, KEY, and Key casing variants.
 * Accepts multiple key names; returns first non-empty trimmed match or null.
 */
export function normalizeTag(
  tags: Record<string, string | undefined>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    // Try exact, uppercase, and lowercase variants
    const variants = [key, key.toUpperCase(), key.toLowerCase()];
    for (const variant of variants) {
      const val = tags[variant];
      if (val !== undefined && val !== null) {
        const trimmed = val.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
  }
  return null;
}

/**
 * Normalize chapters from ffprobe output.
 * If no chapters exist, returns a single implicit chapter spanning the full duration.
 */
export function normalizeChapters(
  raw: FfprobeOutput["chapters"],
  durationSec: number
): NormalizedChapter[] {
  if (raw.length === 0) {
    return [
      {
        chapter_idx: 0,
        title: null,
        start_sec: 0,
        end_sec: durationSec,
        duration_sec: durationSec,
      },
    ];
  }

  return raw.map((ch, idx) => {
    const start_sec = parseFloat(ch.start_time);
    const end_sec = parseFloat(ch.end_time);
    return {
      chapter_idx: idx,
      title: ch.tags?.title ?? null,
      start_sec,
      end_sec,
      duration_sec: end_sec - start_sec,
    };
  });
}

/**
 * Normalize all metadata fields from ffprobe output into a structured object.
 */
export function normalizeMetadata(output: FfprobeOutput): NormalizedMetadata {
  const tags = output.format.tags;
  const durationSec = parseFloat(output.format.duration);

  const audioStream = output.streams.find((s) => s.codec_type === "audio");
  const has_cover_stream = output.streams.some(
    (s) => s.codec_type === "video" && s.disposition?.attached_pic === 1
  );

  const chapters = normalizeChapters(output.chapters, durationSec);

  return {
    title: normalizeTag(tags, "title"),
    author: normalizeTag(tags, "artist", "album_artist"),
    narrator: normalizeTag(tags, "narrator", "composer"),
    series_title: normalizeTag(tags, "album", "series"),
    series_position: normalizeTag(tags, "track", "series-part"),
    description: normalizeTag(tags, "comment", "description", "synopsis"),
    genre: normalizeTag(tags, "genre"),
    publisher: normalizeTag(tags, "publisher"),
    year: normalizeTag(tags, "date", "year"),
    language: normalizeTag(tags, "language"),
    duration_sec: isNaN(durationSec) ? null : durationSec,
    codec: audioStream?.codec_name ?? null,
    asin: normalizeTag(tags, "asin", "ASIN", "audible_asin", "AUDIBLE_ASIN"),
    has_cover_stream,
    chapters,
  };
}

/**
 * Spawn ffprobe to probe a .m4b file and return the parsed JSON output.
 */
export function probeFile(filePath: string): Promise<FfprobeOutput> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "fatal",
      "-show_format",
      "-show_streams",
      "-show_chapters",
      "-print_format",
      "json",
      filePath,
    ];

    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            `ffprobe exited with code ${code} for file "${filePath}". stderr: ${stderr.trim()}`
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as FfprobeOutput;
        resolve(parsed);
      } catch (err) {
        reject(
          new Error(
            `Failed to parse ffprobe JSON output for file "${filePath}": ${(err as Error).message}`
          )
        );
      }
    });

    proc.on("error", (err: Error) => {
      reject(
        new Error(
          `Failed to spawn ffprobe for file "${filePath}": ${err.message}`
        )
      );
    });
  });
}
