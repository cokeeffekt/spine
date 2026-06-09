import { spawn } from "child_process";
import type { NormalizedChapter } from "../types.js";

export interface SilenceOptions {
  /** Silence threshold in dB (more negative = quieter required). */
  noiseDb?: number;
  /** Minimum silence duration (seconds) to count as a chapter gap. */
  minSilenceSec?: number;
  /** Minimum resulting chapter length (seconds); shorter segments merge into the previous. */
  minChapterSec?: number;
}

/**
 * Parse ffmpeg `silencedetect` stderr output into chapter boundaries.
 *
 * Pure (no I/O) so it can be unit-tested. A chapter boundary is placed at the
 * midpoint of each detected silence; segments shorter than `minChapterSec` are
 * merged into the previous chapter. Returns null if fewer than 2 chapters result
 * (i.e. no useful split was found).
 */
export function parseSilenceLog(
  stderr: string,
  totalDurationSec: number,
  opts: SilenceOptions = {}
): NormalizedChapter[] | null {
  const minChapterSec = opts.minChapterSec ?? 60;
  if (!(totalDurationSec > 0)) return null;

  const starts: number[] = [];
  const ends: number[] = [];
  const startRe = /silence_start:\s*([0-9.]+)/g;
  const endRe = /silence_end:\s*([0-9.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(stderr)) !== null) starts.push(parseFloat(m[1]));
  while ((m = endRe.exec(stderr)) !== null) ends.push(parseFloat(m[1]));

  // Boundary = midpoint of each silence interval (pair start with its end).
  const boundaries: number[] = [];
  const n = Math.min(starts.length, ends.length);
  for (let i = 0; i < n; i++) {
    const mid = (starts[i] + ends[i]) / 2;
    if (mid > 0 && mid < totalDurationSec) boundaries.push(mid);
  }
  boundaries.sort((a, b) => a - b);
  if (boundaries.length === 0) return null;

  // Build raw segment edges: 0, ...boundaries..., total
  const edges = [0, ...boundaries, totalDurationSec];

  // Merge segments shorter than minChapterSec into the previous segment by
  // dropping the trailing edge of the short segment.
  const kept: number[] = [edges[0]];
  for (let i = 1; i < edges.length; i++) {
    const prev = kept[kept.length - 1];
    const cur = edges[i];
    const isLast = i === edges.length - 1;
    if (cur - prev >= minChapterSec || isLast) {
      kept.push(cur);
    }
    // else: skip this edge → merges into the previous segment
  }
  // Ensure the final edge is exactly total
  kept[kept.length - 1] = totalDurationSec;

  const chapters: NormalizedChapter[] = [];
  for (let i = 0; i < kept.length - 1; i++) {
    const start = kept[i];
    const end = kept[i + 1];
    chapters.push({
      chapter_idx: i,
      title: `Chapter ${i + 1}`,
      start_sec: start,
      end_sec: end,
      duration_sec: end - start,
    });
  }

  return chapters.length >= 2 ? chapters : null;
}

/**
 * Run ffmpeg silencedetect over an input (a file or a concat list) and derive
 * chapters. `useConcat` routes the input through the concat demuxer (for mp3
 * folders). Returns null on any failure or if no useful split was found.
 */
export function detectSilenceChapters(
  inputPath: string,
  totalDurationSec: number,
  useConcat: boolean,
  opts: SilenceOptions = {}
): Promise<NormalizedChapter[] | null> {
  const noiseDb = opts.noiseDb ?? -30;
  const minSilenceSec = opts.minSilenceSec ?? 1.0;

  const args: string[] = ["-hide_banner", "-nostats"];
  if (useConcat) args.push("-f", "concat", "-safe", "0");
  args.push(
    "-i", inputPath,
    "-af", `silencedetect=noise=${noiseDb}dB:d=${minSilenceSec}`,
    "-f", "null", "-"
  );

  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", () => {
      try {
        resolve(parseSilenceLog(stderr, totalDurationSec, opts));
      } catch {
        resolve(null);
      }
    });
    proc.on("error", () => resolve(null));
  });
}
