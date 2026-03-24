import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Database } from "bun:sqlite";
import { openDatabase } from "../db/index.js";
import { applyFallbackMetadata } from "./fallback.js";
import { scanLibrary, scanFile, scanFolder } from "./index.js";
import { walkLibrary } from "./walk.js";
import type { NormalizedMetadata } from "../types.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spine-test-"));
}

function touch(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

function touchMp3(filePath: string): void {
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

/**
 * Factory that returns a ProbeFn which looks up the file path in the map
 * and returns the corresponding metadata. For unknown paths, returns a default
 * metadata with the filename as title.
 */
function makeFakeProbeFnMap(map: Map<string, NormalizedMetadata>) {
  return async (filePath: string): Promise<NormalizedMetadata> => {
    const meta = map.get(filePath);
    if (meta) return { ...meta };
    // Default: use filename as title
    return makeMetadata({
      title: path.basename(filePath, path.extname(filePath)),
      author: null,
      series_position: null,
    });
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

  test("mixed library (.m4b + mp3 folders) scans both types", async () => {
    // m4b book
    const m4bPath = path.join(tmpDir, "book.m4b");
    touch(m4bPath);

    // MP3 folder book
    const mp3Dir = path.join(tmpDir, "Author Name", "My MP3 Book");
    touchMp3(path.join(mp3Dir, "01-track.mp3"));
    touchMp3(path.join(mp3Dir, "02-track.mp3"));

    const metaMap = new Map<string, NormalizedMetadata>([
      [m4bPath, makeMetadata({ title: "M4B Book", author: "M4B Author" })],
      [path.join(mp3Dir, "01-track.mp3"), makeMetadata({ title: "Track 1", author: "MP3 Author", duration_sec: 100, series_position: "1" })],
      [path.join(mp3Dir, "02-track.mp3"), makeMetadata({ title: "Track 2", author: "MP3 Author", duration_sec: 100, series_position: "2" })],
    ]);

    await scanLibrary(db, tmpDir, makeFakeProbeFnMap(metaMap));

    const books = db.query("SELECT title FROM books ORDER BY title").all() as Array<{ title: string }>;
    expect(books.length).toBe(2);
    const titles = books.map((b) => b.title);
    expect(titles).toContain("M4B Book");
    // MP3 book gets title from first track or folder name
    expect(titles.some((t) => t === "My MP3 Book" || t === "Track 1")).toBe(true);
  });

  test("missing books marked correctly for both .m4b and mp3 folder books", async () => {
    // m4b book
    const m4bPath = path.join(tmpDir, "book.m4b");
    touch(m4bPath);

    // MP3 folder book
    const mp3Dir = path.join(tmpDir, "Author Name", "My MP3 Book");
    const mp3Track1 = path.join(mp3Dir, "01-track.mp3");
    const mp3Track2 = path.join(mp3Dir, "02-track.mp3");
    touchMp3(mp3Track1);
    touchMp3(mp3Track2);

    const metaMap = new Map<string, NormalizedMetadata>([
      [m4bPath, makeMetadata({ title: "M4B Book" })],
      [mp3Track1, makeMetadata({ title: "Track 1", duration_sec: 100, series_position: "1" })],
      [mp3Track2, makeMetadata({ title: "Track 2", duration_sec: 100, series_position: "2" })],
    ]);

    await scanLibrary(db, tmpDir, makeFakeProbeFnMap(metaMap));

    // Verify both books are in DB
    const books = db.query("SELECT COUNT(*) as cnt FROM books").get() as { cnt: number };
    expect(books.cnt).toBe(2);

    // Remove the mp3 folder
    fs.rmSync(mp3Dir, { recursive: true, force: true });

    await scanLibrary(db, tmpDir, makeFakeProbeFnMap(metaMap));

    // m4b book should still be present and not missing
    const m4bBook = db.query("SELECT is_missing FROM books WHERE file_path = ?").get(m4bPath) as { is_missing: number };
    expect(m4bBook.is_missing).toBe(0);

    // MP3 folder book should be marked missing
    const mp3Book = db.query("SELECT is_missing FROM books WHERE file_path = ?").get(mp3Dir) as { is_missing: number };
    expect(mp3Book.is_missing).toBe(1);
  });
});

// ─── scanFolder tests ──────────────────────────────────────────────────────

describe("scanFolder", () => {
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

  test("basic 3-track book: one book row, 3 chapters with file_path", async () => {
    // Structure: /Author Name/Book Title/
    const folderPath = path.join(tmpDir, "Author Name", "Book Title");
    const t1 = path.join(folderPath, "01-intro.mp3");
    const t2 = path.join(folderPath, "02-middle.mp3");
    const t3 = path.join(folderPath, "03-end.mp3");
    touchMp3(t1);
    touchMp3(t2);
    touchMp3(t3);

    const metaMap = new Map<string, NormalizedMetadata>([
      [t1, makeMetadata({ title: "Intro", author: "Author Name", duration_sec: 100, series_position: "1" })],
      [t2, makeMetadata({ title: "Middle", author: "Author Name", duration_sec: 100, series_position: "2" })],
      [t3, makeMetadata({ title: "End", author: "Author Name", duration_sec: 100, series_position: "3" })],
    ]);

    await scanFolder(db, folderPath, makeFakeProbeFnMap(metaMap));

    // One book row
    const book = db.query("SELECT * FROM books WHERE file_path = ?").get(folderPath) as {
      id: number; duration_sec: number; title: string; author: string;
    };
    expect(book).toBeTruthy();
    expect(book.duration_sec).toBe(300);
    expect(book.author).toBe("Author Name");

    // 3 chapters in correct order
    const chapters = db.query(
      "SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_idx"
    ).all(book.id) as Array<{ chapter_idx: number; start_sec: number; end_sec: number; file_path: string }>;

    expect(chapters.length).toBe(3);

    // Cumulative timestamps
    expect(chapters[0].start_sec).toBe(0);
    expect(chapters[0].end_sec).toBe(100);
    expect(chapters[1].start_sec).toBe(100);
    expect(chapters[1].end_sec).toBe(200);
    expect(chapters[2].start_sec).toBe(200);
    expect(chapters[2].end_sec).toBe(300);

    // file_path set on each chapter
    expect(chapters[0].file_path).toBeTruthy();
    expect(chapters[0].file_path).toContain("01-intro.mp3");
    expect(chapters[1].file_path).toContain("02-middle.mp3");
    expect(chapters[2].file_path).toContain("03-end.mp3");
  });

  test("TRCK sort order beats filename order", async () => {
    const folderPath = path.join(tmpDir, "Author", "Book");
    const tA = path.join(folderPath, "a.mp3");
    const tB = path.join(folderPath, "b.mp3");
    const tC = path.join(folderPath, "c.mp3");
    touchMp3(tA);
    touchMp3(tB);
    touchMp3(tC);

    // a.mp3 = TRCK 3, b.mp3 = TRCK 1, c.mp3 = TRCK 2
    const metaMap = new Map<string, NormalizedMetadata>([
      [tA, makeMetadata({ title: "Track A", duration_sec: 100, series_position: "3" })],
      [tB, makeMetadata({ title: "Track B", duration_sec: 100, series_position: "1" })],
      [tC, makeMetadata({ title: "Track C", duration_sec: 100, series_position: "2" })],
    ]);

    await scanFolder(db, folderPath, makeFakeProbeFnMap(metaMap));

    const book = db.query("SELECT id FROM books WHERE file_path = ?").get(folderPath) as { id: number };
    const chapters = db.query(
      "SELECT file_path FROM chapters WHERE book_id = ? ORDER BY chapter_idx"
    ).all(book.id) as Array<{ file_path: string }>;

    expect(chapters.length).toBe(3);
    // b.mp3 (TRCK=1) first, c.mp3 (TRCK=2) second, a.mp3 (TRCK=3) third
    expect(chapters[0].file_path).toContain("b.mp3");
    expect(chapters[1].file_path).toContain("c.mp3");
    expect(chapters[2].file_path).toContain("a.mp3");
  });

  test("fallback: null ID3 title falls back to folder name", async () => {
    const folderPath = path.join(tmpDir, "Grandparent Author", "Folder Title");
    const t1 = path.join(folderPath, "t1.mp3");
    const t2 = path.join(folderPath, "t2.mp3");
    touchMp3(t1);
    touchMp3(t2);

    // Both tracks have null title and null author
    const metaMap = new Map<string, NormalizedMetadata>([
      [t1, makeMetadata({ title: null, author: null, series_position: null, duration_sec: 100 })],
      [t2, makeMetadata({ title: null, author: null, series_position: null, duration_sec: 100 })],
    ]);

    await scanFolder(db, folderPath, makeFakeProbeFnMap(metaMap));

    const book = db.query("SELECT title, author FROM books WHERE file_path = ?").get(folderPath) as {
      title: string; author: string;
    };
    expect(book.title).toBe("Folder Title");
    expect(book.author).toBe("Grandparent Author");
  });

  test("series_position is NOT set to TRCK-like values (Pitfall 5)", async () => {
    const folderPath = path.join(tmpDir, "Author", "Series Book");
    const t1 = path.join(folderPath, "t1.mp3");
    const t2 = path.join(folderPath, "t2.mp3");
    touchMp3(t1);
    touchMp3(t2);

    // series_position "3/12" looks like a TRCK value — should be nulled out
    const metaMap = new Map<string, NormalizedMetadata>([
      [t1, makeMetadata({ title: "Track 1", author: "Author", duration_sec: 100, series_position: "1/12" })],
      [t2, makeMetadata({ title: "Track 2", author: "Author", duration_sec: 100, series_position: "2/12" })],
    ]);

    await scanFolder(db, folderPath, makeFakeProbeFnMap(metaMap));

    const book = db.query("SELECT series_position FROM books WHERE file_path = ?").get(folderPath) as {
      series_position: string | null;
    };
    expect(book.series_position).toBeNull();
  });

  test("incremental scan skips unchanged folder (same mtime + sizeSum)", async () => {
    const folderPath = path.join(tmpDir, "Author", "Book");
    const t1 = path.join(folderPath, "t1.mp3");
    const t2 = path.join(folderPath, "t2.mp3");
    touchMp3(t1);
    touchMp3(t2);

    let probeCount = 0;
    const countingProbeFn = async (filePath: string): Promise<NormalizedMetadata> => {
      probeCount++;
      return makeMetadata({ title: path.basename(filePath), duration_sec: 100, series_position: null });
    };

    await scanFolder(db, folderPath, countingProbeFn);
    const firstCount = probeCount;
    expect(firstCount).toBeGreaterThan(0);

    // Second scan — same mtime + sizeSum → should skip all probes
    await scanFolder(db, folderPath, countingProbeFn);
    expect(probeCount).toBe(firstCount); // no new probes
  });

  test("multi-disc layout: one book with tracks in disc order", async () => {
    // /Book/Disc 1/01.mp3, /Book/Disc 1/02.mp3, /Book/Disc 2/01.mp3
    const folderPath = path.join(tmpDir, "Book");
    const disc1 = path.join(folderPath, "Disc 1");
    const disc2 = path.join(folderPath, "Disc 2");
    const d1t1 = path.join(disc1, "01.mp3");
    const d1t2 = path.join(disc1, "02.mp3");
    const d2t1 = path.join(disc2, "01.mp3");
    touchMp3(d1t1);
    touchMp3(d1t2);
    touchMp3(d2t1);

    const metaMap = new Map<string, NormalizedMetadata>([
      [d1t1, makeMetadata({ title: "D1T1", duration_sec: 100, series_position: "1" })],
      [d1t2, makeMetadata({ title: "D1T2", duration_sec: 100, series_position: "2" })],
      [d2t1, makeMetadata({ title: "D2T1", duration_sec: 100, series_position: "1" })],
    ]);

    await scanFolder(db, folderPath, makeFakeProbeFnMap(metaMap));

    const book = db.query("SELECT id, duration_sec FROM books WHERE file_path = ?").get(folderPath) as {
      id: number; duration_sec: number;
    };
    expect(book).toBeTruthy();
    expect(book.duration_sec).toBe(300);

    const chapters = db.query(
      "SELECT file_path, start_sec, end_sec FROM chapters WHERE book_id = ? ORDER BY chapter_idx"
    ).all(book.id) as Array<{ file_path: string; start_sec: number; end_sec: number }>;

    expect(chapters.length).toBe(3);

    // Disc 1 tracks come before Disc 2 tracks
    expect(chapters[0].file_path).toContain("Disc 1");
    expect(chapters[1].file_path).toContain("Disc 1");
    expect(chapters[2].file_path).toContain("Disc 2");

    // Cumulative timestamps
    expect(chapters[0].start_sec).toBe(0);
    expect(chapters[0].end_sec).toBe(100);
    expect(chapters[1].start_sec).toBe(100);
    expect(chapters[1].end_sec).toBe(200);
    expect(chapters[2].start_sec).toBe(200);
    expect(chapters[2].end_sec).toBe(300);
  });

  test("D-14: loose files ignored when disc subfolders present", async () => {
    // /Book/loose.mp3, /Book/Disc 1/track.mp3
    const folderPath = path.join(tmpDir, "Book");
    const looseMp3 = path.join(folderPath, "loose.mp3");
    const discTrack = path.join(folderPath, "Disc 1", "track.mp3");
    touchMp3(looseMp3);
    touchMp3(discTrack);

    const metaMap = new Map<string, NormalizedMetadata>([
      [looseMp3, makeMetadata({ title: "Loose", duration_sec: 200, series_position: null })],
      [discTrack, makeMetadata({ title: "Disc Track", duration_sec: 100, series_position: null })],
    ]);

    await scanFolder(db, folderPath, makeFakeProbeFnMap(metaMap));

    const book = db.query("SELECT id FROM books WHERE file_path = ?").get(folderPath) as { id: number };
    const chapters = db.query("SELECT file_path FROM chapters WHERE book_id = ?").all(book.id) as Array<{
      file_path: string;
    }>;

    // Only disc track should be included
    expect(chapters.length).toBe(1);
    expect(chapters[0].file_path).toContain("Disc 1");
    expect(chapters[0].file_path).not.toContain("loose.mp3");
  });
});

// ─── walkLibrary tests ─────────────────────────────────────────────────────

describe("walkLibrary", () => {
  test(".m4b files produce kind='file' items", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-walk-test-"));
    try {
      touch(path.join(tmpDir, "book.m4b"));
      const result = walkLibrary(tmpDir);
      const fileItems = result.filter((i) => i.kind === "file");
      expect(fileItems.length).toBe(1);
      expect(fileItems[0].kind).toBe("file");
      if (fileItems[0].kind === "file") {
        expect(fileItems[0].path).toContain("book.m4b");
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("folder with .mp3 files produces kind='mp3folder' item", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-walk-test-"));
    try {
      const bookDir = path.join(tmpDir, "Author", "Title");
      touchMp3(path.join(bookDir, "01.mp3"));
      touchMp3(path.join(bookDir, "02.mp3"));

      const result = walkLibrary(tmpDir);
      const mp3Items = result.filter((i) => i.kind === "mp3folder");
      expect(mp3Items.length).toBe(1);
      expect(mp3Items[0].kind).toBe("mp3folder");
      if (mp3Items[0].kind === "mp3folder") {
        expect(mp3Items[0].folderPath).toBe(bookDir);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("mixed format: .m4b + .mp3 in same folder — m4b wins (D-03)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-walk-test-"));
    try {
      // A folder with both .m4b and .mp3 files — m4b wins
      const bookDir = path.join(tmpDir, "Book");
      touch(path.join(bookDir, "book.m4b"));
      touchMp3(path.join(bookDir, "track.mp3"));

      const result = walkLibrary(tmpDir);

      // Should have the .m4b file item
      const fileItems = result.filter((i) => i.kind === "file");
      expect(fileItems.length).toBe(1);
      if (fileItems[0].kind === "file") {
        expect(fileItems[0].path).toContain("book.m4b");
      }

      // Should NOT have an mp3folder item for that directory
      const mp3Items = result.filter((i) => i.kind === "mp3folder");
      expect(mp3Items.length).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("disc subfolder is NOT listed as separate mp3folder", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-walk-test-"));
    try {
      // /Author/Title/Disc 1/track.mp3, /Author/Title/Disc 2/track.mp3
      const titleDir = path.join(tmpDir, "Author", "Title");
      touchMp3(path.join(titleDir, "Disc 1", "01.mp3"));
      touchMp3(path.join(titleDir, "Disc 1", "02.mp3"));
      touchMp3(path.join(titleDir, "Disc 2", "01.mp3"));

      const result = walkLibrary(tmpDir);
      const mp3Items = result.filter((i) => i.kind === "mp3folder");

      // Should have exactly ONE mp3folder — the parent /Author/Title/
      expect(mp3Items.length).toBe(1);
      if (mp3Items[0].kind === "mp3folder") {
        expect(mp3Items[0].folderPath).toBe(titleDir);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("mixed library: .m4b + mp3 folder produces both kinds", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-walk-test-"));
    try {
      // .m4b book at root level
      touch(path.join(tmpDir, "book.m4b"));

      // MP3 folder book in subdirectory
      const mp3Dir = path.join(tmpDir, "Author", "Title");
      touchMp3(path.join(mp3Dir, "01.mp3"));
      touchMp3(path.join(mp3Dir, "02.mp3"));

      const result = walkLibrary(tmpDir);

      expect(result.length).toBe(2);
      const fileItems = result.filter((i) => i.kind === "file");
      const mp3Items = result.filter((i) => i.kind === "mp3folder");

      expect(fileItems.length).toBe(1);
      expect(mp3Items.length).toBe(1);

      if (fileItems[0].kind === "file") {
        expect(fileItems[0].path).toContain("book.m4b");
      }
      if (mp3Items[0].kind === "mp3folder") {
        expect(mp3Items[0].folderPath).toBe(mp3Dir);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
