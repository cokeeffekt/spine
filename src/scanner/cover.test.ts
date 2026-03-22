import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { extractCoverArt, resolveCoverPath } from "./cover";
import { walkLibrary } from "./walk";

describe("extractCoverArt", () => {
  test("returns null immediately when hasAttachedPic is false", async () => {
    const result = await extractCoverArt("/fake/path/book.m4b", false);
    expect(result).toBeNull();
  });
});

describe("resolveCoverPath", () => {
  test("returns null when no cover.jpg exists", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-test-"));
    try {
      const result = resolveCoverPath(path.join(tmpDir, "book.m4b"), false);
      expect(result).toBeNull();
    } finally {
      fs.rmdirSync(tmpDir, { recursive: true });
    }
  });

  test("returns existing cover.jpg as fallback (D-10) when hasEmbedded is false", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-test-"));
    try {
      const coverPath = path.join(tmpDir, "cover.jpg");
      fs.writeFileSync(coverPath, "dummy cover data");
      const result = resolveCoverPath(path.join(tmpDir, "book.m4b"), false);
      expect(result).toBe(coverPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("returns null when cover.jpg exists but hasEmbedded is true (D-09 — embedded wins)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-test-"));
    try {
      const coverPath = path.join(tmpDir, "cover.jpg");
      fs.writeFileSync(coverPath, "dummy cover data");
      const result = resolveCoverPath(path.join(tmpDir, "book.m4b"), true);
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("walkLibrary", () => {
  test("finds .m4b files recursively", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-walk-test-"));
    try {
      // Create nested directory structure
      const subDir1 = path.join(tmpDir, "author1");
      const subDir2 = path.join(tmpDir, "author2", "series");
      fs.mkdirSync(subDir1, { recursive: true });
      fs.mkdirSync(subDir2, { recursive: true });

      // Create .m4b files and some non-.m4b files
      fs.writeFileSync(path.join(tmpDir, "root-book.m4b"), "");
      fs.writeFileSync(path.join(subDir1, "book1.m4b"), "");
      fs.writeFileSync(path.join(subDir2, "book2.m4b"), "");
      fs.writeFileSync(path.join(subDir1, "notes.txt"), "");
      fs.writeFileSync(path.join(tmpDir, "cover.jpg"), "");

      const result = walkLibrary(tmpDir);

      expect(result).toHaveLength(3);
      expect(result.every((p) => p.endsWith(".m4b"))).toBe(true);
      expect(result).toContain(path.join(tmpDir, "root-book.m4b"));
      expect(result).toContain(path.join(subDir1, "book1.m4b"));
      expect(result).toContain(path.join(subDir2, "book2.m4b"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("returns empty array for empty directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-walk-test-"));
    try {
      const result = walkLibrary(tmpDir);
      expect(result).toHaveLength(0);
    } finally {
      fs.rmdirSync(tmpDir);
    }
  });

  test("ignores non-.m4b files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-walk-test-"));
    try {
      fs.writeFileSync(path.join(tmpDir, "cover.jpg"), "");
      fs.writeFileSync(path.join(tmpDir, "metadata.xml"), "");
      fs.writeFileSync(path.join(tmpDir, "book.mp3"), "");

      const result = walkLibrary(tmpDir);
      expect(result).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
