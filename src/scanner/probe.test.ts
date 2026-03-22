import { describe, test, expect } from "bun:test";
import { normalizeTag, normalizeChapters, normalizeMetadata, probeFile } from "./probe";
import type { FfprobeOutput } from "../types";

import fullFixture from "../../tests/fixtures/sample-ffprobe-output.json";
import noChaptersFixture from "../../tests/fixtures/sample-no-chapters.json";
import noMetadataFixture from "../../tests/fixtures/sample-no-metadata.json";

describe("normalizeTag", () => {
  test("returns value for exact key match", () => {
    expect(normalizeTag({ title: "My Book" }, "title")).toBe("My Book");
  });

  test("returns value for UPPERCASE key variant", () => {
    expect(normalizeTag({ TITLE: "My Book" }, "title")).toBe("My Book");
  });

  test("returns null when key not found", () => {
    expect(normalizeTag({}, "title")).toBeNull();
  });

  test("trims whitespace from value", () => {
    expect(normalizeTag({ title: "  spaced  " }, "title")).toBe("spaced");
  });

  test("returns value for first matching key in multiple keys", () => {
    expect(normalizeTag({ artist: "Author Name" }, "artist", "album_artist")).toBe("Author Name");
  });

  test("falls back to second key when first is missing", () => {
    expect(normalizeTag({ album_artist: "Fallback Author" }, "artist", "album_artist")).toBe("Fallback Author");
  });

  test("returns null when none of multiple keys found", () => {
    expect(normalizeTag({}, "artist", "album_artist")).toBeNull();
  });
});

describe("normalizeChapters", () => {
  test("returns single implicit chapter for empty chapters array", () => {
    const result = normalizeChapters([], 3600);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      chapter_idx: 0,
      title: null,
      start_sec: 0,
      end_sec: 3600,
      duration_sec: 3600,
    });
  });

  test("maps chapters with correct parsed float values", () => {
    const rawChapters: FfprobeOutput["chapters"] = [
      { id: 0, time_base: "1/1000", start: 0, start_time: "0.000000", end: 1800000, end_time: "1800.000000", tags: { title: "Ch 1" } },
      { id: 1, time_base: "1/1000", start: 1800000, start_time: "1800.000000", end: 3600000, end_time: "3600.000000", tags: { title: "Ch 2" } },
    ];
    const result = normalizeChapters(rawChapters, 3600);
    expect(result).toHaveLength(2);
    expect(result[0].chapter_idx).toBe(0);
    expect(result[0].title).toBe("Ch 1");
    expect(result[0].start_sec).toBe(0);
    expect(result[0].end_sec).toBe(1800);
    expect(result[0].duration_sec).toBe(1800);
    expect(result[1].chapter_idx).toBe(1);
    expect(result[1].title).toBe("Ch 2");
    expect(result[1].start_sec).toBe(1800);
    expect(result[1].end_sec).toBe(3600);
    expect(result[1].duration_sec).toBe(1800);
  });
});

describe("normalizeMetadata", () => {
  test("maps all fields from full fixture", () => {
    const result = normalizeMetadata(fullFixture as FfprobeOutput);
    expect(result.title).toBe("Test Audiobook");
    expect(result.author).toBe("Test Author");
    expect(result.narrator).toBe("Test Narrator");
    expect(result.series_title).toBe("Test Series");
    expect(result.description).toBe("A test description");
    expect(result.genre).toBe("Fiction");
    expect(result.year).toBe("2024");
    expect(result.publisher).toBe("Test Publisher");
    expect(result.language).toBe("eng");
    expect(result.has_cover_stream).toBe(true);
    expect(result.chapters).toHaveLength(2);
  });

  test("produces single implicit chapter for no-chapters fixture", () => {
    const result = normalizeMetadata(noChaptersFixture as FfprobeOutput);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].start_sec).toBe(0);
    expect(result.chapters[0].end_sec).toBeCloseTo(3600.123456, 4);
  });

  test("all text fields are null for no-metadata fixture", () => {
    const result = normalizeMetadata(noMetadataFixture as FfprobeOutput);
    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
    expect(result.narrator).toBeNull();
    expect(result.series_title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.genre).toBeNull();
    expect(result.year).toBeNull();
    expect(result.publisher).toBeNull();
    expect(result.language).toBeNull();
    expect(result.has_cover_stream).toBe(false);
  });

  test("handles UPPERCASE tag keys", () => {
    const uppercaseFixture: FfprobeOutput = {
      format: {
        duration: "1800.0",
        size: "10000000",
        tags: { TITLE: "Caps Title", ARTIST: "Caps Author" },
      },
      streams: [{ codec_type: "audio", codec_name: "aac" }],
      chapters: [],
    };
    const result = normalizeMetadata(uppercaseFixture);
    expect(result.title).toBe("Caps Title");
    expect(result.author).toBe("Caps Author");
  });

  test("detects codec from first audio stream", () => {
    const result = normalizeMetadata(fullFixture as FfprobeOutput);
    expect(result.codec).toBe("aac");
  });

  test("duration_sec is parsed float", () => {
    const result = normalizeMetadata(fullFixture as FfprobeOutput);
    expect(result.duration_sec).toBeCloseTo(3600.123456, 4);
  });
});

describe("probeFile", () => {
  test("rejects with descriptive error for non-existent file", async () => {
    await expect(probeFile("/nonexistent/path/file.m4b")).rejects.toThrow();
  });
});
