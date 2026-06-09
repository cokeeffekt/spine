import { describe, test, expect } from "bun:test";
import { parseTrackNumber, sortTracks, parseDiscNumber, DISC_FOLDER_RE, isSectionFolder, parseSectionOrder } from "./mp3-sort.js";

// ─── parseTrackNumber ──────────────────────────────────────────────────────

describe("parseTrackNumber", () => {
  test("parses simple integer string", () => {
    expect(parseTrackNumber("3")).toBe(3);
  });

  test("parses track/total format and returns track", () => {
    expect(parseTrackNumber("3/12")).toBe(3);
  });

  test("returns null for null input", () => {
    expect(parseTrackNumber(null)).toBeNull();
  });

  test("returns null for undefined input", () => {
    expect(parseTrackNumber(undefined)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseTrackNumber("")).toBeNull();
  });

  test("returns null for non-numeric string", () => {
    expect(parseTrackNumber("abc")).toBeNull();
  });

  test("parses '1' correctly", () => {
    expect(parseTrackNumber("1")).toBe(1);
  });

  test("parses '10' correctly", () => {
    expect(parseTrackNumber("10")).toBe(10);
  });
});

// ─── sortTracks ────────────────────────────────────────────────────────────

describe("sortTracks", () => {
  test("sorts by TRCK numerically [3, 1, 2] -> [1, 2, 3]", () => {
    const input = [
      { filePath: "c.mp3", trackNumber: 3 },
      { filePath: "a.mp3", trackNumber: 1 },
      { filePath: "b.mp3", trackNumber: 2 },
    ];
    const result = sortTracks(input);
    expect(result.map((t) => t.trackNumber)).toEqual([1, 2, 3]);
  });

  test("sorts numerically, not lexicographically: [1, 10, 2] -> [1, 2, 10]", () => {
    const input = [
      { filePath: "a.mp3", trackNumber: 1 },
      { filePath: "c.mp3", trackNumber: 10 },
      { filePath: "b.mp3", trackNumber: 2 },
    ];
    const result = sortTracks(input);
    expect(result.map((t) => t.trackNumber)).toEqual([1, 2, 10]);
  });

  test("falls back to filename natural sort when all TRCK are null", () => {
    const input = [
      { filePath: "/audio/10-end.mp3", trackNumber: null },
      { filePath: "/audio/01-intro.mp3", trackNumber: null },
      { filePath: "/audio/02-middle.mp3", trackNumber: null },
    ];
    const result = sortTracks(input);
    expect(result.map((t) => t.filePath)).toEqual([
      "/audio/01-intro.mp3",
      "/audio/02-middle.mp3",
      "/audio/10-end.mp3",
    ]);
  });

  test("tiebreaks duplicate TRCK [1, 1] by filename natural sort", () => {
    const input = [
      { filePath: "/audio/b-track.mp3", trackNumber: 1 },
      { filePath: "/audio/a-track.mp3", trackNumber: 1 },
    ];
    const result = sortTracks(input);
    expect(result.map((t) => t.filePath)).toEqual([
      "/audio/a-track.mp3",
      "/audio/b-track.mp3",
    ]);
  });

  test("null TRCK sorts after non-null: [null, 2, null] -> [2, null, null]", () => {
    const input = [
      { filePath: "/audio/a.mp3", trackNumber: null },
      { filePath: "/audio/b.mp3", trackNumber: 2 },
      { filePath: "/audio/c.mp3", trackNumber: null },
    ];
    const result = sortTracks(input);
    expect(result[0].trackNumber).toBe(2);
    expect(result[1].trackNumber).toBeNull();
    expect(result[2].trackNumber).toBeNull();
  });

  test("null TRCK entries are tiebroken by filename natural sort", () => {
    const input = [
      { filePath: "/audio/z-last.mp3", trackNumber: null },
      { filePath: "/audio/a-first.mp3", trackNumber: null },
    ];
    const result = sortTracks(input);
    expect(result[0].filePath).toBe("/audio/a-first.mp3");
    expect(result[1].filePath).toBe("/audio/z-last.mp3");
  });

  test("does not mutate input array", () => {
    const input = [
      { filePath: "b.mp3", trackNumber: 2 },
      { filePath: "a.mp3", trackNumber: 1 },
    ];
    const original = [...input];
    sortTracks(input);
    expect(input[0].filePath).toBe(original[0].filePath);
    expect(input[1].filePath).toBe(original[1].filePath);
  });
});

// ─── parseDiscNumber ───────────────────────────────────────────────────────

describe("parseDiscNumber", () => {
  test("parses 'Disc 1'", () => {
    expect(parseDiscNumber("Disc 1")).toBe(1);
  });

  test("parses 'Disc1' (no space)", () => {
    expect(parseDiscNumber("Disc1")).toBe(1);
  });

  test("parses 'DISC 2' (uppercase)", () => {
    expect(parseDiscNumber("DISC 2")).toBe(2);
  });

  test("parses 'CD 3'", () => {
    expect(parseDiscNumber("CD 3")).toBe(3);
  });

  test("parses 'CD3' (no space)", () => {
    expect(parseDiscNumber("CD3")).toBe(3);
  });

  test("parses 'Part 1'", () => {
    expect(parseDiscNumber("Part 1")).toBe(1);
  });

  test("parses 'Disk 4'", () => {
    expect(parseDiscNumber("Disk 4")).toBe(4);
  });

  test("parses 'disc 10' (lowercase, multi-digit)", () => {
    expect(parseDiscNumber("disc 10")).toBe(10);
  });

  test("returns null for 'Chapter 1'", () => {
    expect(parseDiscNumber("Chapter 1")).toBeNull();
  });

  test("returns null for 'Random Folder'", () => {
    expect(parseDiscNumber("Random Folder")).toBeNull();
  });

  test("returns null for 'Disc' (no number)", () => {
    expect(parseDiscNumber("Disc")).toBeNull();
  });

  test("DISC_FOLDER_RE is exported and is a RegExp", () => {
    expect(DISC_FOLDER_RE).toBeInstanceOf(RegExp);
  });
});

// ─── isSectionFolder ─────────────────────────────────────────────────────────

describe("isSectionFolder", () => {
  test("strict disc/part patterns are sections", () => {
    expect(isSectionFolder("Disc 1")).toBe(true);
    expect(isSectionFolder("CD 2")).toBe(true);
    expect(isSectionFolder("Part 3")).toBe(true);
  });

  test("worded/decorated part folders are sections (Christine pattern)", () => {
    expect(isSectionFolder("1| Part One - Dennis - Teenage Car Songs")).toBe(true);
    expect(isSectionFolder("3| Part Three - Christine - Teenage Death Songs")).toBe(true);
    expect(isSectionFolder("Section 2")).toBe(true);
  });

  test("internal 'Book N' / 'Chapter N' divisions are sections (The Stand pattern)", () => {
    // A novel split into internal Books/Chapters is one work, not a series.
    expect(isSectionFolder("Book 1 - Captain Trips")).toBe(true);
    expect(isSectionFolder("2| Book I - Captain Trips")).toBe(true);
    expect(isSectionFolder("Chapter 1")).toBe(true);
  });

  test("series-entry folders are NOT sections", () => {
    // These are distinct books in a series (separate top-level folders), not parts of one book.
    expect(isSectionFolder("1. Ice Planet Barbarians")).toBe(false);
    expect(isSectionFolder("2. Barbarian Alien")).toBe(false);
    expect(isSectionFolder("The Fellowship of the Ring")).toBe(false);
  });
});

// ─── parseSectionOrder ───────────────────────────────────────────────────────

describe("parseSectionOrder", () => {
  test("uses disc number when present", () => {
    expect(parseSectionOrder("Disc 2")).toBe(2);
    expect(parseSectionOrder("Part 3")).toBe(3);
  });

  test("uses a leading integer prefix", () => {
    expect(parseSectionOrder("0| Prologue.mp3")).toBe(0);
    expect(parseSectionOrder("1| Part One - Dennis")).toBe(1);
    expect(parseSectionOrder("4| Epilogue.mp3")).toBe(4);
    expect(parseSectionOrder("01.mp3")).toBe(1);
  });

  test("returns null when there is no leading ordinal", () => {
    expect(parseSectionOrder("Prologue.mp3")).toBeNull();
    expect(parseSectionOrder("Part One")).toBeNull();
  });
});
