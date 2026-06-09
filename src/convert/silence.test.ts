import { describe, test, expect } from "bun:test";
import { parseSilenceLog } from "./silence.js";

const log = `
[silencedetect @ 0x1] silence_start: 398.5
[silencedetect @ 0x1] silence_end: 401.5 | silence_duration: 3.0
[silencedetect @ 0x1] silence_start: 798.0
[silencedetect @ 0x1] silence_end: 802.0 | silence_duration: 4.0
`;

describe("parseSilenceLog", () => {
  test("derives chapters at silence midpoints", () => {
    const ch = parseSilenceLog(log, 1200, { minChapterSec: 60 });
    expect(ch).not.toBeNull();
    expect(ch!).toHaveLength(3);
    // midpoints: 400, 800
    expect(ch![0]).toMatchObject({ start_sec: 0, end_sec: 400 });
    expect(ch![1]).toMatchObject({ start_sec: 400, end_sec: 800 });
    expect(ch![2]).toMatchObject({ start_sec: 800, end_sec: 1200 });
  });

  test("merges segments shorter than minChapterSec", () => {
    // With a huge minChapterSec, both boundaries collapse → too few → null
    const ch = parseSilenceLog(log, 1200, { minChapterSec: 5000 });
    expect(ch).toBeNull();
  });

  test("returns null when no silences detected", () => {
    expect(parseSilenceLog("no silence here", 1200)).toBeNull();
  });

  test("returns null for zero/unknown duration", () => {
    expect(parseSilenceLog(log, 0)).toBeNull();
  });
});
