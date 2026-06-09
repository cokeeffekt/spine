import { describe, test, expect } from "bun:test";
import { buildFfmetadata } from "./ffmetadata.js";
import type { NormalizedChapter } from "../types.js";

const chapters: NormalizedChapter[] = [
  { chapter_idx: 0, title: "Intro", start_sec: 0, end_sec: 12.816, duration_sec: 12.816 },
  { chapter_idx: 1, title: "Chapter 1", start_sec: 12.816, end_sec: 2169.108, duration_sec: 2156.292 },
];

describe("buildFfmetadata", () => {
  test("starts with the FFMETADATA1 header", () => {
    const out = buildFfmetadata({ title: "Accelerando" }, []);
    expect(out.startsWith(";FFMETADATA1\n")).toBe(true);
  });

  test("maps global tags to ffmpeg keys", () => {
    const out = buildFfmetadata(
      {
        title: "Accelerando",
        author: "Charles Stross",
        narrator: "George Newbern",
        series_title: "Singularity",
        series_position: "3",
        year: "2005",
        genre: "Sci-Fi",
        language: "eng",
        publisher: "Recorded Books",
      },
      []
    );
    expect(out).toContain("title=Accelerando\n");
    expect(out).toContain("publisher=Recorded Books\n");
    expect(out).toContain("artist=Charles Stross\n");
    expect(out).toContain("album_artist=Charles Stross\n");
    expect(out).toContain("album=Singularity\n");
    expect(out).toContain("composer=George Newbern\n");
    expect(out).toContain("track=3\n");
    expect(out).toContain("date=2005\n");
    expect(out).toContain("genre=Sci-Fi\n");
    expect(out).toContain("language=eng\n");
  });

  test("omits empty/null fields", () => {
    const out = buildFfmetadata({ title: "X", author: null, genre: "" }, []);
    expect(out).not.toContain("artist=");
    expect(out).not.toContain("genre=");
  });

  test("emits one [CHAPTER] block per chapter with ms START/END", () => {
    const out = buildFfmetadata({ title: "X" }, chapters);
    const blocks = out.split("[CHAPTER]").length - 1;
    expect(blocks).toBe(2);
    expect(out).toContain("TIMEBASE=1/1000\n");
    expect(out).toContain("START=0\n");
    expect(out).toContain("END=12816\n");
    expect(out).toContain("START=12816\n");
    expect(out).toContain("END=2169108\n");
    expect(out).toContain("title=Intro\n");
  });

  test("escapes ffmetadata special characters", () => {
    const out = buildFfmetadata({ title: "A=B; C#D" }, []);
    expect(out).toContain("title=A\\=B\\; C\\#D\n");
  });
});
