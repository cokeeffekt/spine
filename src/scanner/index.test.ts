import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Database } from "bun:sqlite";
import { openDatabase } from "../db/index.js";
import { applyFallbackMetadata } from "./fallback.js";
import { scanLibrary, scanFile } from "./index.js";
import type { NormalizedMetadata } from "../types.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spine-test-"));
}

function touch(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

function makeMetadata(overrides: Partial<NormalizedMetadata> = {}): NormalizedMetadata {
  return {
    title: "Test Book",
    author: "Test Author",
    narrator: null,
    series_title: null,
    series_position: null,
    description: null,
    genre: null,
    publisher: null,
    year: null,
    language: null,
    duration_sec: 3600,
    codec: "aac",
    has_cover_stream: false,
    chapters: [
      { chapter_idx: 0, title: "Chapter 1", start_sec: 0, end_sec: 3600, duration_sec: 3600 },
    ],
    ...overrides,
  };
}

function makeDb(): Database {
  return openDatabase(":memory:");
}

// A fake probeFile that returns fixture metadata
function makeFakeProbeFn(meta: NormalizedMetadata) {
  return async (_filePath: string): Promise<NormalizedMetadata> => {
    return meta;
  };
}

// ─── applyFallbackMetadata tests ───────────────────────────────────────────

describe("applyFallbackMetadata", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("fills null author from metadata.json", () => {
    const m4bPath = path.join(tmpDir, "mybook.m4b");
    touch(m4bPath);
    fs.writeFileSync(
      path.join(tmpDir, "metadata.json"),
      JSON.stringify({ author: "Fallback Author" })
    );

    const meta = makeMetadata({ author: null });
    const result = applyFallbackMetadata(meta, m4bPath);
    expect(result.author).toBe("Fallback Author");
  });

  test("does not overwrite existing author (D-07)", () => {
    const m4bPath = path.join(tmpDir, "mybook.m4b");
    touch(m4bPath);
    fs.writeFileSync(
      path.join(tmpDir, "metadata.json"),
      JSON.stringify({ author: "Fallback Author" })
    );

    const meta = makeMetadata({ author: "Embedded Author" });
    const result = applyFallbackMetadata(meta, m4bPath);
    expect(result.author).toBe("Embedded Author");
  });

  test("uses folder name as title fallback when title is null and no metadata.json", () => {
    const bookDir = path.join(tmpDir, "My Audiobook");
    fs.mkdirSync(bookDir, { recursive: true });
    const m4bPath = path.join(bookDir, "book.m4b");
    touch(m4bPath);

    const meta = makeMetadata({ title: null });
    const result = applyFallbackMetadata(meta, m4bPath);
    expect(result.title).toBe("My Audiobook");
  });

  test("fills multiple null fields from metadata.json", () => {
    const m4bPath = path.join(tmpDir, "mybook.m4b");
    touch(m4bPath);
    fs.writeFileSync(
      path.join(tmpDir, "metadata.json"),
      JSON.stringify({
        author: "FB Author",
        narrator: "FB Narrator",
        genre: "Fiction",
        year: "2023",
      })
    );

    const meta = makeMetadata({ author: null, narrator: null, genre: null, year: null });
    const result = applyFallbackMetadata(meta, m4bPath);
    expect(result.author).toBe("FB Author");
    expect(result.narrator).toBe("FB Narrator");
    expect(result.genre).toBe("Fiction");
    expect(result.year).toBe("2023");
  });

  test("handles missing metadata.json gracefully", () => {
    const m4bPath = path.join(tmpDir, "mybook.m4b");
    touch(m4bPath);

    const meta = makeMetadata({ author: null });
    const result = applyFallbackMetadata(meta, m4bPath);
    // author stays null, title falls back to dir name
    expect(result.author).toBeNull();
    expect(result.title).toBe("Test Book"); // title was set in original
  });
});

// ─── scanFile / scanLibrary integration tests ─────────────────────────────

describe("scanLibrary", () => {
  let tmpDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    db = makeDb();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("populates books table with correct titles", async () => {
    const book1 = path.join(tmpDir, "book1.m4b");
    const book2 = path.join(tmpDir, "book2.m4b");
    touch(book1);
    touch(book2);

    let callCount = 0;
    const fakeProbeFn = async (filePath: string): Promise<NormalizedMetadata> => {
      callCount++;
      const title = path.basename(filePath, ".m4b");
      return makeMetadata({ title });
    };

    await scanLibrary(db, tmpDir, fakeProbeFn);

    const books = db.query("SELECT * FROM books ORDER BY file_path").all() as Array<{ title: string }>;
    expect(books.length).toBe(2);
    expect(books.map((b) => b.title).sort()).toEqual(["book1", "book2"]);
    expect(callCount).toBe(2);
  });

  test("incremental scan skips unchanged files (D-02)", async () => {
    const book1 = path.join(tmpDir, "book1.m4b");
    touch(book1);

    let callCount = 0;
    const fakeProbeFn = async (_filePath: string): Promise<NormalizedMetadata> => {
      callCount++;
      return makeMetadata({ title: "Book 1" });
    };

    await scanLibrary(db, tmpDir, fakeProbeFn);
    expect(callCount).toBe(1);

    // Second scan — same file, same mtime+size → should skip
    await scanLibrary(db, tmpDir, fakeProbeFn);
    expect(callCount).toBe(1); // still 1 — ffprobe not called again
  });

  test("marks deleted files as is_missing=1 (D-03)", async () => {
    const book1 = path.join(tmpDir, "book1.m4b");
    const book2 = path.join(tmpDir, "book2.m4b");
    touch(book1);
    touch(book2);

    const fakeProbeFn = async (_filePath: string): Promise<NormalizedMetadata> => makeMetadata();

    await scanLibrary(db, tmpDir, fakeProbeFn);

    // Delete book2
    fs.unlinkSync(book2);

    await scanLibrary(db, tmpDir, fakeProbeFn);

    const missing = db
      .query("SELECT file_path, is_missing FROM books WHERE file_path = ?")
      .get(book2) as { file_path: string; is_missing: number };

    expect(missing).toBeTruthy();
    expect(missing.is_missing).toBe(1);

    // book1 should still be present and not missing
    const present = db
      .query("SELECT file_path, is_missing FROM books WHERE file_path = ?")
      .get(book1) as { is_missing: number };
    expect(present.is_missing).toBe(0);
  });

  test("reappearing files are unflagged to is_missing=0 (D-04)", async () => {
    const book1 = path.join(tmpDir, "book1.m4b");
    touch(book1);

    const fakeProbeFn = async (_filePath: string): Promise<NormalizedMetadata> => makeMetadata();

    // First scan — catalogued
    await scanLibrary(db, tmpDir, fakeProbeFn);

    // Remove
    fs.unlinkSync(book1);
    await scanLibrary(db, tmpDir, fakeProbeFn);

    // Verify missing
    let row = db
      .query("SELECT is_missing FROM books WHERE file_path = ?")
      .get(book1) as { is_missing: number };
    expect(row.is_missing).toBe(1);

    // Reappear — recreate with same path but new content to force re-probe
    touch(book1);
    await scanLibrary(db, tmpDir, fakeProbeFn);

    row = db
      .query("SELECT is_missing FROM books WHERE file_path = ?")
      .get(book1) as { is_missing: number };
    expect(row.is_missing).toBe(0);
  });

  test("chapters are inserted for each book", async () => {
    const book1 = path.join(tmpDir, "book1.m4b");
    touch(book1);

    const fakeProbeFn = async (_filePath: string): Promise<NormalizedMetadata> =>
      makeMetadata({
        chapters: [
          { chapter_idx: 0, title: "Intro", start_sec: 0, end_sec: 100, duration_sec: 100 },
          { chapter_idx: 1, title: "Part 1", start_sec: 100, end_sec: 200, duration_sec: 100 },
        ],
      });

    await scanLibrary(db, tmpDir, fakeProbeFn);

    const book = db.query("SELECT id FROM books WHERE file_path = ?").get(book1) as { id: number };
    const chapters = db
      .query("SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_idx")
      .all(book.id) as Array<{ title: string }>;

    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toBe("Intro");
    expect(chapters[1].title).toBe("Part 1");
  });

  test("handles empty library directory gracefully", async () => {
    const fakeProbeFn = async (_filePath: string): Promise<NormalizedMetadata> => makeMetadata();

    // Should not throw
    await scanLibrary(db, tmpDir, fakeProbeFn);

    const books = db.query("SELECT * FROM books").all();
    expect(books.length).toBe(0);
  });
});
