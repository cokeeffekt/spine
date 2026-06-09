import { describe, test, expect } from "bun:test";
import {
  deriveChapters,
  mapAudnexusChapters,
  audnexusMatches,
  fixedChapters,
} from "./chapters.js";
import type { AudnexusChapters } from "../scanner/enrichment.js";
import type { NormalizedChapter } from "../types.js";

const audnexus: AudnexusChapters = {
  asin: "B000",
  runtimeLengthSec: 1000,
  isAccurate: true,
  chapters: [
    { title: "Opening", startOffsetSec: 0, lengthMs: 400000 },
    { title: "Chapter 1", startOffsetSec: 400, lengthMs: 600000 },
  ],
};

function perFile(n: number): NormalizedChapter[] {
  return Array.from({ length: n }, (_, i) => ({
    chapter_idx: i,
    title: `Track ${i + 1}`,
    start_sec: i * 100,
    end_sec: (i + 1) * 100,
    duration_sec: 100,
  }));
}

describe("mapAudnexusChapters", () => {
  test("maps offsets to cumulative start/end", () => {
    const mapped = mapAudnexusChapters(audnexus);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({ title: "Opening", start_sec: 0, end_sec: 400 });
    expect(mapped[1]).toMatchObject({ title: "Chapter 1", start_sec: 400, end_sec: 1000 });
  });
});

describe("audnexusMatches", () => {
  test("accepts when runtime within tolerance", () => {
    expect(audnexusMatches(audnexus, 1005, 0.03)).toBe(true);
  });
  test("rejects when runtime mismatches beyond tolerance", () => {
    expect(audnexusMatches(audnexus, 2000, 0.03)).toBe(false);
  });
  test("rejects when isAccurate is false", () => {
    expect(audnexusMatches({ ...audnexus, isAccurate: false }, 1000, 0.03)).toBe(false);
  });
});

describe("fixedChapters", () => {
  test("splits into evenly sized parts", () => {
    const ch = fixedChapters(1000, 400);
    expect(ch).toHaveLength(3);
    expect(ch[0]).toMatchObject({ title: "Part 1", start_sec: 0, end_sec: 400 });
    expect(ch[2]).toMatchObject({ title: "Part 3", start_sec: 800, end_sec: 1000 });
  });
});

describe("deriveChapters priority chain", () => {
  const noNet = async () => null;

  test("prefers embedded chapters", async () => {
    const res = await deriveChapters({
      totalDurationSec: 1000,
      fileCount: 1,
      embeddedChapters: perFile(3),
      fetchChaptersFn: noNet,
    });
    expect(res.source).toBe("embedded");
    expect(res.chapters).toHaveLength(3);
  });

  test("uses per-file chapters for multi-file folders", async () => {
    const res = await deriveChapters({
      totalDurationSec: 1000,
      fileCount: 10,
      perFileChapters: perFile(10),
      fetchChaptersFn: noNet,
    });
    expect(res.source).toBe("perfile");
    expect(res.chapters).toHaveLength(10);
  });

  test("monolithic (<=2 files) skips per-file and uses Audnexus", async () => {
    const res = await deriveChapters({
      totalDurationSec: 1000,
      fileCount: 1,
      perFileChapters: perFile(1),
      asin: "B000",
      fetchChaptersFn: async () => audnexus,
    });
    expect(res.source).toBe("audnexus");
    expect(res.chapters).toHaveLength(2);
  });

  test("falls back to silence when Audnexus mismatches", async () => {
    const res = await deriveChapters({
      totalDurationSec: 5000, // far from audnexus runtime → rejected
      fileCount: 1,
      asin: "B000",
      fetchChaptersFn: async () => audnexus,
      silenceInput: "/tmp/list.txt",
      detectSilenceFn: async () => perFile(4),
    });
    expect(res.source).toBe("silence");
    expect(res.chapters).toHaveLength(4);
  });

  test("falls back to fixed when nothing else yields chapters", async () => {
    const res = await deriveChapters({
      totalDurationSec: 1000,
      fileCount: 1,
      fixedChapterSec: 400,
      fetchChaptersFn: noNet,
      detectSilenceFn: async () => null,
      silenceInput: "/tmp/list.txt",
    });
    expect(res.source).toBe("fixed");
    expect(res.chapters).toHaveLength(3);
  });

  test("single chapter when duration too short for fixed split", async () => {
    const res = await deriveChapters({
      totalDurationSec: 300,
      fileCount: 1,
      fixedChapterSec: 900,
      fetchChaptersFn: noNet,
    });
    expect(res.source).toBe("single");
    expect(res.chapters).toHaveLength(1);
  });
});
