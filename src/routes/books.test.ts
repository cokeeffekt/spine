import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { openDatabase, _resetForTests } from "../db/index.js";
import type { Database } from "bun:sqlite";
import { rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let db: Database;
let tmpDbPath: string;
let sessionToken: string;
let tmpCoverPath: string;

beforeEach(() => {
  tmpDbPath = join(tmpdir(), `spine-books-test-${Date.now()}-${Math.random()}.db`);
  process.env['DB_PATH'] = tmpDbPath;
  _resetForTests();
  db = openDatabase(tmpDbPath);

  // Create a temporary cover image file (minimal JPEG bytes)
  tmpCoverPath = join(tmpdir(), `cover-${Date.now()}.jpg`);
  writeFileSync(tmpCoverPath, Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
  ]));

  // Seed test books
  db.query(
    `INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec, cover_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(1, '/books/book1.m4b', 1000, 50000, 0, 'The Great Book', 'Author One', 'Narrator A', 3600.0, tmpCoverPath);

  db.query(
    `INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec, cover_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(2, '/books/book2.m4b', 2000, 75000, 0, 'Another Story', 'Author Two', null, 7200.5, null);

  // Missing book — should not appear in results
  db.query(
    `INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec, cover_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(3, '/books/missing.m4b', 3000, 10000, 1, 'Missing Book', 'Author Three', null, 1800.0, null);

  // Seed chapters for book 1
  db.query(
    'INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(1, 0, 'Chapter 1', 0.0, 300.0, 300.0);
  db.query(
    'INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(1, 1, 'Chapter 2', 300.0, 600.0, 300.0);

  // Create authenticated session
  sessionToken = 'test-books-session-token';
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  db.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    10, 'testuser', '$argon2id$dummy', 'user'
  );
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    sessionToken, 10, futureDate
  );
});

afterEach(() => {
  db.close();
  _resetForTests();
  delete process.env['DB_PATH'];
  try {
    rmSync(tmpDbPath, { force: true });
    rmSync(`${tmpDbPath}-wal`, { force: true });
    rmSync(`${tmpDbPath}-shm`, { force: true });
    rmSync(tmpCoverPath, { force: true });
  } catch {
    // ignore
  }
});

async function makeBooksApp() {
  const { authMiddleware } = await import("../middleware/auth.js");
  const bookRoutes = (await import("../routes/books.js")).default;
  const coverRoutes = (await import("../routes/cover.js")).default;
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api', bookRoutes);
  app.route('/api', coverRoutes);
  return app;
}

describe("GET /api/books", () => {
  it("returns 401 without session", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books');
    expect(res.status).toBe(401);
  });

  it("returns JSON array of non-missing books", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(200);
    const books = await res.json() as any[];
    // Only 2 visible books (missing is excluded)
    expect(books.length).toBe(2);
  });

  it("excludes books where is_missing = 1", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    const books = await res.json() as any[];
    const titles = books.map((b: any) => b.title);
    expect(titles).not.toContain('Missing Book');
  });

  it("returns D-11 shape: id, title, author, narrator, duration_sec, cover_url, has_chapters", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    const books = await res.json() as any[];
    const book = books.find((b: any) => b.id === 1);
    expect(book).toBeDefined();
    expect(book.id).toBe(1);
    expect(book.title).toBe('The Great Book');
    expect(book.author).toBe('Author One');
    expect(book.narrator).toBe('Narrator A');
    expect(book.duration_sec).toBe(3600.0);
    expect(book.cover_url).toBe('/api/books/1/cover');
    expect(book.has_chapters).toBeTruthy(); // SQLite returns 1 for EXISTS true
  });

  it("sets cover_url to null when cover_path is null", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    const books = await res.json() as any[];
    const book = books.find((b: any) => b.id === 2);
    expect(book).toBeDefined();
    expect(book.cover_url).toBeNull();
  });

  it("sets has_chapters to false (0) when no chapters", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    const books = await res.json() as any[];
    const book = books.find((b: any) => b.id === 2);
    expect(book).toBeDefined();
    expect(book.has_chapters).toBeFalsy(); // 0 or false for no chapters
  });

  it("orders books by title case-insensitively", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    const books = await res.json() as any[];
    expect(books[0].title).toBe('Another Story'); // 'A' < 'T'
    expect(books[1].title).toBe('The Great Book');
  });
});

describe("GET /api/books/:id", () => {
  it("returns full book object plus chapters array", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/1', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(200);
    const book = await res.json() as any;
    expect(book.id).toBe(1);
    expect(book.title).toBe('The Great Book');
    expect(book.author).toBe('Author One');
    expect(book.cover_url).toBe('/api/books/1/cover');
    expect(Array.isArray(book.chapters)).toBe(true);
    expect(book.chapters.length).toBe(2);
    expect(book.chapters[0].chapter_idx).toBe(0);
    expect(book.chapters[0].title).toBe('Chapter 1');
    expect(book.chapters[1].chapter_idx).toBe(1);
  });

  it("includes all detail fields per D-12", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/1', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    const book = await res.json() as any;
    // Check extended fields present
    expect('series_title' in book).toBe(true);
    expect('series_position' in book).toBe(true);
    expect('description' in book).toBe(true);
    expect('genre' in book).toBe(true);
    expect('publisher' in book).toBe(true);
    expect('year' in book).toBe(true);
    expect('language' in book).toBe(true);
    expect('duration_sec' in book).toBe(true);
    expect('codec' in book).toBe(true);
  });

  it("returns 404 for nonexistent book", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/9999', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for missing book (is_missing = 1)", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/3', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(404);
  });

  it("returns empty chapters array for book with no chapters", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/2', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    const book = await res.json() as any;
    expect(Array.isArray(book.chapters)).toBe(true);
    expect(book.chapters.length).toBe(0);
  });
});

describe("GET /api/books/:id - format field", () => {
  let db2: Database;
  let tmpDbPath2: string;
  let sessionToken2: string;

  beforeEach(() => {
    tmpDbPath2 = join(tmpdir(), `spine-books-format-test-${Date.now()}-${Math.random()}.db`);
    process.env['DB_PATH'] = tmpDbPath2;
    _resetForTests();
    db2 = openDatabase(tmpDbPath2);

    sessionToken2 = 'test-format-session';
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    db2.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(10, 'testuser', '$argon2id$dummy', 'user');
    db2.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(sessionToken2, 10, futureDate);

    // Book 1: m4b book with chapters (file_path NULL)
    db2.query('INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(1, '/path/book.m4b', 1000, 5000, 0, 'M4B Book', 'Author A', null, 3600);
    db2.query('INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec) VALUES (?, ?, ?, ?, ?, ?)').run(1, 0, 'Ch 1', 0, 1800, 1800);

    // Book 2: MP3 book with chapters (file_path populated)
    db2.query('INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(2, '/path/mp3folder', 1000, 0, 0, 'MP3 Book', 'Author B', null, 7200);
    db2.query('INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)').run(2, 0, 'Track 1', 0, 3600, 3600, '/path/track01.mp3');
    db2.query('INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)').run(2, 1, 'Track 2', 3600, 7200, 3600, '/path/track02.mp3');

    // Book 3: book with no chapters
    db2.query('INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(3, '/path/nochapters.m4b', 1000, 1000, 0, 'No Chapters', 'Author C', null, 600);
  });

  afterEach(() => {
    db2.close();
    _resetForTests();
    delete process.env['DB_PATH'];
    try {
      rmSync(tmpDbPath2, { force: true });
      rmSync(`${tmpDbPath2}-wal`, { force: true });
      rmSync(`${tmpDbPath2}-shm`, { force: true });
    } catch { /* ignore */ }
  });

  async function makeBooksAppFresh() {
    const { authMiddleware } = await import("../middleware/auth.js");
    const booksRoutes = (await import("../routes/books.js")).default;
    const app = new Hono();
    app.use('/api/*', authMiddleware);
    app.route('/api', booksRoutes);
    return app;
  }

  it("returns format='m4b' for m4b book (chapters with file_path=NULL)", async () => {
    const app = await makeBooksAppFresh();
    const res = await app.request('/api/books/1', {
      headers: { Cookie: `session=${sessionToken2}` }
    });

    expect(res.status).toBe(200);
    const book = await res.json() as any;
    expect(book.format).toBe('m4b');
  });

  it("returns format='mp3' for MP3 book (chapters with file_path set)", async () => {
    const app = await makeBooksAppFresh();
    const res = await app.request('/api/books/2', {
      headers: { Cookie: `session=${sessionToken2}` }
    });

    expect(res.status).toBe(200);
    const book = await res.json() as any;
    expect(book.format).toBe('mp3');
  });

  it("returns format='m4b' (default) for book with no chapters", async () => {
    const app = await makeBooksAppFresh();
    const res = await app.request('/api/books/3', {
      headers: { Cookie: `session=${sessionToken2}` }
    });

    expect(res.status).toBe(200);
    const book = await res.json() as any;
    expect(book.format).toBe('m4b');
  });

  it("does NOT expose file_path in any chapter object (per D-05)", async () => {
    const app = await makeBooksAppFresh();
    const res = await app.request('/api/books/2', {
      headers: { Cookie: `session=${sessionToken2}` }
    });

    expect(res.status).toBe(200);
    const book = await res.json() as any;
    expect(Array.isArray(book.chapters)).toBe(true);
    expect(book.chapters.length).toBeGreaterThan(0);
    for (const chapter of book.chapters) {
      expect('file_path' in chapter).toBe(false);
    }
  });
});

describe("GET /api/books/:id/cover", () => {
  it("returns cover image with correct content type when cover_path exists", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/1/cover', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('image/');
  });

  it("returns 404 when no cover_path", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/2/cover', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for nonexistent book", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/9999/cover', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(404);
  });

  it("sets Cache-Control header", async () => {
    const app = await makeBooksApp();
    const res = await app.request('/api/books/1/cover', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(200);
    const cacheControl = res.headers.get('cache-control');
    expect(cacheControl).not.toBeNull();
  });
});
