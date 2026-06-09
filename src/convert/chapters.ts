import type { NormalizedChapter } from "../types.js";
import type { AudnexusChapters } from "../scanner/enrichment.js";
import { fetchAudnexusChapters } from "../scanner/enrichment.js";
import { detectSilenceChapters } from "./silence.js";

export type ChapterSource =
  | "embedded"
  | "perfile"
  | "audnexus"
  | "silence"
  | "fixed"
  | "single";

export interface DeriveChaptersInput {
  totalDurationSec: number;
  /** Embedded chapters parsed from the source file (only meaningful if >1). */
  embeddedChapters?: NormalizedChapter[];
  /** Per-file chapters (multi-file mp3 folders) — already cumulative. */
  perFileChapters?: NormalizedChapter[];
  /** Number of audio files in the source (routes monolithic books to derivation). */
  fileCount: number;
  asin?: string | null;
  /** Path passed to silencedetect (a single file, or a concat list when useConcat). */
  silenceInput?: string;
  useConcatForSilence?: boolean;
  /** A folder with <= this many files is "monolithic" and skips per-file chapters. */
  monoThreshold?: number;
  fixedChapterSec?: number;
  /** Tolerance (fraction) for Audnexus runtime vs actual duration. */
  runtimeTolerance?: number;

  // Injectable for testing
  fetchChaptersFn?: (asin: string) => Promise<AudnexusChapters | null>;
  detectSilenceFn?: (
    input: string,
    total: number,
    useConcat: boolean
  ) => Promise<NormalizedChapter[] | null>;
}

export interface DerivedChapters {
  chapters: NormalizedChapter[];
  source: ChapterSource;
}

/** Map an Audnexus chapters payload into cumulative NormalizedChapter[]. */
export function mapAudnexusChapters(data: AudnexusChapters): NormalizedChapter[] {
  return data.chapters.map((ch, idx) => {
    const start = ch.startOffsetSec ?? (ch.startOffsetMs ?? 0) / 1000;
    const next = data.chapters[idx + 1];
    const nextStart = next
      ? (next.startOffsetSec ?? (next.startOffsetMs ?? 0) / 1000)
      : start + (ch.lengthMs ?? 0) / 1000;
    return {
      chapter_idx: idx,
      title: ch.title ?? `Chapter ${idx + 1}`,
      start_sec: start,
      end_sec: nextStart,
      duration_sec: Math.max(0, nextStart - start),
    };
  });
}

/** Whether Audnexus chapter data is trustworthy for this file's runtime. */
export function audnexusMatches(
  data: AudnexusChapters,
  totalDurationSec: number,
  tolerance: number
): boolean {
  if (data.isAccurate === false) return false;
  const runtime = data.runtimeLengthSec ?? (data.runtimeLengthMs ?? 0) / 1000;
  if (!(runtime > 0) || !(totalDurationSec > 0)) return false;
  const diff = Math.abs(runtime - totalDurationSec) / totalDurationSec;
  return diff <= tolerance;
}

/** Build evenly-sized "Part N" chapters as a last resort. */
export function fixedChapters(totalDurationSec: number, intervalSec: number): NormalizedChapter[] {
  if (!(totalDurationSec > 0) || !(intervalSec > 0)) {
    return [{ chapter_idx: 0, title: "Part 1", start_sec: 0, end_sec: totalDurationSec, duration_sec: totalDurationSec }];
  }
  const chapters: NormalizedChapter[] = [];
  let idx = 0;
  for (let start = 0; start < totalDurationSec; start += intervalSec) {
    const end = Math.min(start + intervalSec, totalDurationSec);
    chapters.push({
      chapter_idx: idx,
      title: `Part ${idx + 1}`,
      start_sec: start,
      end_sec: end,
      duration_sec: end - start,
    });
    idx++;
  }
  return chapters;
}

/**
 * Resolve the best available chapter list using a priority chain:
 *   embedded → per-file (multi-file) → Audnexus → silence → fixed → single.
 */
export async function deriveChapters(input: DeriveChaptersInput): Promise<DerivedChapters> {
  const monoThreshold = input.monoThreshold ?? 2;
  const fixedChapterSec = input.fixedChapterSec ?? 900;
  const tolerance = input.runtimeTolerance ?? 0.03;
  const fetchFn = input.fetchChaptersFn ?? fetchAudnexusChapters;
  const detectFn = input.detectSilenceFn ?? detectSilenceChapters;

  // 1. Embedded chapters (real chapters already in the file).
  if (input.embeddedChapters && input.embeddedChapters.length > 1) {
    return { chapters: reindex(input.embeddedChapters), source: "embedded" };
  }

  const isMonolithic = input.fileCount <= monoThreshold;

  // 2. Per-file chapters for genuine multi-file folders.
  if (!isMonolithic && input.perFileChapters && input.perFileChapters.length > 1) {
    return { chapters: reindex(input.perFileChapters), source: "perfile" };
  }

  // 3. Authoritative Audnexus chapters (validated against runtime).
  if (input.asin) {
    const data = await fetchFn(input.asin);
    if (data && audnexusMatches(data, input.totalDurationSec, tolerance)) {
      const mapped = mapAudnexusChapters(data);
      if (mapped.length > 1) return { chapters: reindex(mapped), source: "audnexus" };
    }
  }

  // 4. Silence-detection split.
  if (input.silenceInput) {
    const silence = await detectFn(
      input.silenceInput,
      input.totalDurationSec,
      input.useConcatForSilence ?? false
    );
    if (silence && silence.length > 1) {
      return { chapters: reindex(silence), source: "silence" };
    }
  }

  // 5. Fixed "Part N" intervals.
  const fixed = fixedChapters(input.totalDurationSec, fixedChapterSec);
  if (fixed.length > 1) return { chapters: fixed, source: "fixed" };

  // 6. Single chapter spanning the whole book.
  return {
    chapters: [{
      chapter_idx: 0,
      title: null,
      start_sec: 0,
      end_sec: input.totalDurationSec,
      duration_sec: input.totalDurationSec,
    }],
    source: "single",
  };
}

/** Re-number chapter_idx 0..n preserving order. */
function reindex(chapters: NormalizedChapter[]): NormalizedChapter[] {
  return chapters.map((ch, idx) => ({ ...ch, chapter_idx: idx }));
}
