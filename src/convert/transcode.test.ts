import { describe, test, expect } from "bun:test";
import {
  sanitizePathSegment,
  buildOutputPath,
  buildConcatList,
  buildFfmpegArgs,
} from "./transcode.js";

describe("sanitizePathSegment", () => {
  test("strips path separators and illegal chars", () => {
    expect(sanitizePathSegment("a/b:c*?", "fallback")).toBe("a b c");
  });
  test("falls back when empty", () => {
    expect(sanitizePathSegment("   ", "Unknown")).toBe("Unknown");
    expect(sanitizePathSegment(null, "Unknown")).toBe("Unknown");
  });
});

describe("buildOutputPath", () => {
  test("composes <dir>/<author>/<title>.m4b", () => {
    expect(buildOutputPath("/converted", "Charles Stross", "Accelerando")).toBe(
      "/converted/Charles Stross/Accelerando.m4b"
    );
  });
  test("uses fallbacks for missing author/title", () => {
    expect(buildOutputPath("/converted", null, null)).toBe(
      "/converted/Unknown Author/Unknown Title.m4b"
    );
  });
});

describe("buildConcatList", () => {
  test("emits file lines and escapes single quotes", () => {
    const list = buildConcatList(["/a/b.mp3", "/a/o'clock.mp3"]);
    expect(list).toBe("file '/a/b.mp3'\nfile '/a/o'\\''clock.mp3'\n");
  });
});

describe("buildFfmpegArgs", () => {
  test("mp3folder: concat input, AAC transcode, chapters from ffmeta", () => {
    const args = buildFfmpegArgs({
      kind: "mp3folder",
      concatListPath: "/tmp/list.txt",
      ffmetaPath: "/tmp/meta.txt",
      outPath: "/converted/A/T.m4b",
      totalDurationSec: 1000,
      bitrate: "64k",
      channels: 1,
    });
    expect(args).toContain("concat");
    expect(args.join(" ")).toContain("-i /tmp/list.txt");
    expect(args.join(" ")).toContain("-c:a aac -b:a 64k -ac 1");
    expect(args.join(" ")).toContain("-map_metadata 1 -map_chapters 1");
    expect(args.join(" ")).toContain("-movflags +faststart");
    // no cover → no video mapping
    expect(args.join(" ")).not.toContain("attached_pic");
  });

  test("m4b: copy audio (lossless), no concat", () => {
    const args = buildFfmpegArgs({
      kind: "m4b",
      sourceFile: "/books/x.m4b",
      ffmetaPath: "/tmp/meta.txt",
      outPath: "/converted/A/T.m4b",
      totalDurationSec: 1000,
    });
    expect(args.join(" ")).toContain("-i /books/x.m4b");
    expect(args.join(" ")).toContain("-c:a copy");
    expect(args).not.toContain("concat");
  });

  test("cover present: adds third input and attached_pic mapping", () => {
    const args = buildFfmpegArgs({
      kind: "m4b",
      sourceFile: "/books/x.m4b",
      ffmetaPath: "/tmp/meta.txt",
      coverPath: "/data/covers/1.jpg",
      outPath: "/converted/A/T.m4b",
      totalDurationSec: 1000,
    });
    const s = args.join(" ");
    expect(s).toContain("-i /data/covers/1.jpg");
    expect(s).toContain("-map 2:v");
    expect(s).toContain("-c:v mjpeg -disposition:v attached_pic");
  });
});
