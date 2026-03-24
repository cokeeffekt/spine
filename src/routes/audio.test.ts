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
let tmpAudioPath: string;
const AUDIO_FILE_SIZE = 4096;

beforeEach(() => {
  tmpDbPath = join(tmpdir(), `spine-audio-test-${Date.now()}-${Math.random()}.db`);
  process.env['DB_PATH'] = tmpDbPath;
  _resetForTests();
  db = openDatabase(tmpDbPath);

  // Create a temporary binary file simulating an .m4b file (4096 bytes)
  tmpAudioPath = join(tmpdir(), `audio-${Date.now()}.m4b`);
  const audioData = Buffer.alloc(AUDIO_FILE_SIZE);
  for (let i = 0; i < AUDIO_FILE_SIZE; i++) audioData[i] = i % 256;
  writeFileSync(tmpAudioPath, audioData);

  // Seed a test book pointing to the temp file
  db.query(
    `INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(1, tmpAudioPath, 1000, AUDIO_FILE_SIZE, 0, 'Test Book', 'Author', null, 3600.0);

  // Seed a missing book (should 404)
  db.query(
    `INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(2, '/nonexistent/path/book.m4b', 1000, 1000, 0, 'Missing File Book', 'Author', null, 1000.0);

  // Create authenticated session
  sessionToken = 'test-audio-session-token';
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
    rmSync(tmpAudioPath, { force: true });
  } catch {
    // ignore
  }
});

async function makeAudioApp() {
  const { authMiddleware } = await import("../middleware/auth.js");
  const audioRoutes = (await import("../routes/audio.js")).default;
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api', audioRoutes);
  return app;
}

describe("GET /api/books/:id/audio - no Range header", () => {
  it("returns 200 with full file and correct headers", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe(String(AUDIO_FILE_SIZE));
  });

  it("includes Cache-Control header", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
  });

  it("returns 401 without session", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio');
    expect(res.status).toBe(401);
  });
});

describe("GET /api/books/:id/audio - with Range header", () => {
  it("returns 206 with correct Content-Range for bytes=0-1023", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: {
        Cookie: `session=${sessionToken}`,
        Range: 'bytes=0-1023'
      }
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-1023/${AUDIO_FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe('1024');
    expect(res.headers.get('content-type')).toBe('audio/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400');
  });

  it("returns 206 for open-ended range bytes=2048-", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: {
        Cookie: `session=${sessionToken}`,
        Range: 'bytes=2048-'
      }
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 2048-${AUDIO_FILE_SIZE - 1}/${AUDIO_FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe(String(AUDIO_FILE_SIZE - 2048));
  });

  it("returns 206 with correct body length for range request", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: {
        Cookie: `session=${sessionToken}`,
        Range: 'bytes=0-1023'
      }
    });

    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(1024);
  });

  it("returns 416 for out-of-range request (bytes=5000-6000)", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: {
        Cookie: `session=${sessionToken}`,
        Range: 'bytes=5000-6000'
      }
    });

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe(`bytes */${AUDIO_FILE_SIZE}`);
  });

  it("returns 416 for start > end", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: {
        Cookie: `session=${sessionToken}`,
        Range: 'bytes=1000-500'
      }
    });

    expect(res.status).toBe(416);
  });

  it("clamps end to totalSize - 1 when end exceeds file size", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: {
        Cookie: `session=${sessionToken}`,
        Range: `bytes=0-${AUDIO_FILE_SIZE + 1000}`
      }
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-${AUDIO_FILE_SIZE - 1}/${AUDIO_FILE_SIZE}`);
  });
});

describe("GET /api/books/:id/audio - error cases", () => {
  it("returns 404 for nonexistent book id", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/9999/audio', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when file does not exist on disk", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/2/audio', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(404);
  });
});

// ============================================================
// Per-track MP3 audio route: GET /api/books/:id/audio/:chapterIdx
// ============================================================

let tmpMp3Path: string;

// Extend beforeEach by re-using global db/sessionToken — add MP3 chapters after the base setup
// We patch a describe-scoped beforeEach below to seed the MP3 data.

describe("GET /api/books/:id/audio/:chapterIdx", () => {
  beforeEach(() => {
    // Create a temp .mp3 file for MP3 track test
    tmpMp3Path = join(tmpdir(), `track-${Date.now()}.mp3`);
    const mp3Data = Buffer.alloc(AUDIO_FILE_SIZE);
    for (let i = 0; i < AUDIO_FILE_SIZE; i++) mp3Data[i] = i % 256;
    writeFileSync(tmpMp3Path, mp3Data);

    // Seed chapters for book 1 (m4b — file_path NULL)
    db.query(
      'INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(1, 0, 'Chapter 1', 0, 1800, 1800);

    // Seed book 3 as MP3 book with chapters that have file_path
    db.query(
      'INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, narrator, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(3, '/fake/mp3folder', 1000, 0, 0, 'MP3 Book', 'Author', null, 3600.0);
    db.query(
      'INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(3, 0, 'Track 1', 0, 1800, 1800, tmpMp3Path);
    db.query(
      'INSERT INTO chapters (book_id, chapter_idx, title, start_sec, end_sec, duration_sec, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(3, 1, 'Track 2', 1800, 3600, 1800, tmpMp3Path);
  });

  afterEach(() => {
    try { rmSync(tmpMp3Path, { force: true }); } catch { /* ignore */ }
  });

  it("returns 200 with Content-Type audio/mpeg and Accept-Ranges bytes (no Range header)", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/3/audio/0', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe(String(AUDIO_FILE_SIZE));
  });

  it("returns 206 with correct Content-Range for bytes=0-1023", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/3/audio/0', {
      headers: {
        Cookie: `session=${sessionToken}`,
        Range: 'bytes=0-1023'
      }
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('content-range')).toBe(`bytes 0-1023/${AUDIO_FILE_SIZE}`);
    expect(res.headers.get('content-length')).toBe('1024');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
  });

  it("returns 404 for nonexistent chapter index (chapterIdx=99)", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/3/audio/99', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for m4b book chapter (file_path IS NULL)", async () => {
    const app = await makeAudioApp();
    // Book 1 chapter 0 has file_path=NULL (m4b chapter)
    const res = await app.request('/api/books/1/audio/0', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without session cookie", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/3/audio/0');

    expect(res.status).toBe(401);
  });

  it("regression: existing GET /api/books/:id/audio still works unchanged", async () => {
    const app = await makeAudioApp();
    const res = await app.request('/api/books/1/audio', {
      headers: { Cookie: `session=${sessionToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mp4');
  });
});
