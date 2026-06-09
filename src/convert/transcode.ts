import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export type SourceKind = "mp3folder" | "m4b";

export interface MaterializeOptions {
  kind: SourceKind;
  /** Source .m4b file (kind='m4b'). */
  sourceFile?: string;
  /** Path to a concat list file of ordered .mp3 tracks (kind='mp3folder'). */
  concatListPath?: string;
  /** Path to the FFMETADATA1 file (global tags + chapters). */
  ffmetaPath: string;
  /** Local cover image to embed (optional). */
  coverPath?: string | null;
  /** Destination .m4b path. */
  outPath: string;
  /** Total duration in seconds, for progress reporting. */
  totalDurationSec: number;
  /** AAC bitrate for transcode (ignored for m4b copy). */
  bitrate?: string;
  /** AAC channel count for transcode (ignored for m4b copy). */
  channels?: number;
  onProgress?: (fraction: number) => void;
}

/** Make a string safe to use as a single filesystem path segment. */
export function sanitizePathSegment(s: string | null | undefined, fallback: string): string {
  const cleaned = (s ?? "")
    .replace(/[\/\\:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

/** Deterministic output path: <outputDir>/<author>/<title>.m4b (idempotent across re-runs). */
export function buildOutputPath(outputDir: string, author: string | null, title: string | null): string {
  const a = sanitizePathSegment(author, "Unknown Author");
  const t = sanitizePathSegment(title, "Unknown Title");
  return path.join(outputDir, a, `${t}.m4b`);
}

/** Build an ffmpeg concat-demuxer list. Single quotes in paths are escaped as '\''. */
export function buildConcatList(trackPaths: string[]): string {
  return trackPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'\n`)
    .join("");
}

/**
 * Build the ffmpeg argument vector. Pure — exported for testing.
 *
 * Input order: [0]=audio source, [1]=ffmetadata, [2]=cover (if present).
 * Chapters & global tags always come from the ffmetadata input (index 1), so any
 * stale chapters/tags in the source are dropped.
 */
export function buildFfmpegArgs(opts: MaterializeOptions): string[] {
  const args: string[] = ["-y", "-hide_banner", "-nostats"];

  if (opts.kind === "mp3folder") {
    args.push("-f", "concat", "-safe", "0", "-i", opts.concatListPath!);
  } else {
    args.push("-i", opts.sourceFile!);
  }
  args.push("-i", opts.ffmetaPath);

  const hasCover = !!opts.coverPath;
  if (hasCover) args.push("-i", opts.coverPath!);

  args.push("-map", "0:a");
  if (hasCover) args.push("-map", "2:v");
  args.push("-map_metadata", "1", "-map_chapters", "1");

  if (opts.kind === "mp3folder") {
    args.push("-c:a", "aac", "-b:a", opts.bitrate ?? "64k", "-ac", String(opts.channels ?? 1));
  } else {
    args.push("-c:a", "copy");
  }

  if (hasCover) args.push("-c:v", "mjpeg", "-disposition:v", "attached_pic");

  // Drop stray data streams (e.g. timed-ID3 carried in via the mp3 concat demuxer).
  args.push("-dn");
  args.push("-movflags", "+faststart", "-progress", "pipe:1", opts.outPath);
  return args;
}

/** Parse `hh:mm:ss.xxx` from ffmpeg -progress `out_time=` into seconds. */
function parseOutTime(token: string): number | null {
  const m = token.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

/**
 * Run ffmpeg to produce the materialized .m4b. Resolves with the output path on
 * success; rejects with an Error (including stderr tail) on failure.
 */
export function materialize(opts: MaterializeOptions): Promise<string> {
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  const args = buildFfmpegArgs(opts);

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderrTail = "";

    proc.stdout.on("data", (d: Buffer) => {
      if (!opts.onProgress || !(opts.totalDurationSec > 0)) return;
      const text = d.toString();
      for (const lineStr of text.split("\n")) {
        if (lineStr.startsWith("out_time=")) {
          const sec = parseOutTime(lineStr.slice("out_time=".length));
          if (sec !== null) {
            const frac = Math.max(0, Math.min(1, sec / opts.totalDurationSec));
            opts.onProgress(frac);
          }
        }
      }
    });

    proc.stderr.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000);
    });

    proc.on("close", (code: number | null) => {
      if (code === 0) {
        resolve(opts.outPath);
      } else {
        reject(new Error(`ffmpeg exited with code ${code} for "${opts.outPath}". stderr: ${stderrTail.trim()}`));
      }
    });

    proc.on("error", (err: Error) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}
