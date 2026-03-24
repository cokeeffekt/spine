import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { openDatabase, _resetForTests } from "../db/index.js";
import type { Database } from "bun:sqlite";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let db: Database;
let tmpDbPath: string;
let sessionToken: string;
let otherSessionToken: string;

beforeEach(() => {
  tmpDbPath = join(tmpdir(), `spine-progress-test-${Date.now()}-${Math.random()}.db`);
  process.env['DB_PATH'] = tmpDbPath;
  _resetForTests();
  db = openDatabase(tmpDbPath);

  // Seed primary test user (id=10)
  db.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    10, 'testuser', '$argon2id$dummy', 'user'
  );

  // Seed second user for isolation tests (id=20)
  db.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    20, 'otheruser', '$argon2id$dummy', 'user'
  );

  // Seed a book (id=1)
  db.query(
    `INSERT INTO books (id, file_path, file_mtime, file_size, is_missing, title, author, duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(1, '/books/book1.m4b', 1000, 50000, 0, 'The Great Book', 'Author One', 3600.0);

  // Create sessions
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  sessionToken = 'test-progress-session-token';
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    sessionToken, 10, futureDate
  );

  otherSessionToken = 'test-progress-other-session-token';
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    otherSessionToken, 20, futureDate
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
  } catch {
    // ignore
  }
});

async function makeProgressApp() {
  const { authMiddleware } = await import("../middleware/auth.js");
  const progressRoutes = (await import("../routes/progress.js")).default;
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api', progressRoutes);
  return app;
}

describe("PUT /api/progress/:bookId", () => {
  it("returns 401 without session", async () => {
    const app = await makeProgressApp();
    const res = await app.request('/api/progress/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: 1234.5, chapterIdx: 2, percentage: 0.34 })
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid session and body", async () => {
    const app = await makeProgressApp();
    const res = await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 1234.5, chapterIdx: 2, percentage: 0.34 })
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
  });

  it("stores position data in the database", async () => {
    const app = await makeProgressApp();
    await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 1234.5, chapterIdx: 2, percentage: 0.34 })
    });

    const row = db.query<any, [number, number]>(
      'SELECT * FROM progress WHERE user_id = ? AND book_id = ?'
    ).get(10, 1);
    expect(row).not.toBeNull();
    expect(row.timestamp).toBe(1234.5);
    expect(row.chapter_idx).toBe(2);
    expect(row.percentage).toBe(0.34);
  });

  it("upserts: second call updates, does not duplicate (per D-06)", async () => {
    const app = await makeProgressApp();

    // First PUT
    await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 1000.0, chapterIdx: 1, percentage: 0.25 })
    });

    // Second PUT — should update, not create duplicate
    await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 2000.0, chapterIdx: 3, percentage: 0.55 })
    });

    const rows = db.query<any, [number, number]>(
      'SELECT * FROM progress WHERE user_id = ? AND book_id = ?'
    ).all(10, 1);
    expect(rows.length).toBe(1);
    expect(rows[0].timestamp).toBe(2000.0);
    expect(rows[0].chapter_idx).toBe(3);
    expect(rows[0].percentage).toBe(0.55);
  });

  it("stores lower timestamp without server-side MAX guard (per D-06)", async () => {
    const app = await makeProgressApp();

    // First PUT with higher timestamp
    await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 3000.0, chapterIdx: 5, percentage: 0.80 })
    });

    // Second PUT with lower timestamp — should still overwrite (no server MAX guard)
    await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 500.0, chapterIdx: 0, percentage: 0.10 })
    });

    const row = db.query<any, [number, number]>(
      'SELECT * FROM progress WHERE user_id = ? AND book_id = ?'
    ).get(10, 1);
    expect(row.timestamp).toBe(500.0);
  });

  it("stores percentage as 0-1 float (Pitfall 6)", async () => {
    const app = await makeProgressApp();
    await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 100.0, chapterIdx: 0, percentage: 0.75 })
    });

    const row = db.query<any, [number, number]>(
      'SELECT percentage FROM progress WHERE user_id = ? AND book_id = ?'
    ).get(10, 1);
    expect(row.percentage).toBe(0.75);
    expect(row.percentage).toBeLessThanOrEqual(1.0);
    expect(row.percentage).toBeGreaterThanOrEqual(0.0);
  });
});

describe("GET /api/progress", () => {
  it("returns 401 without session", async () => {
    const app = await makeProgressApp();
    const res = await app.request('/api/progress');
    expect(res.status).toBe(401);
  });

  it("returns empty object when user has no progress", async () => {
    const app = await makeProgressApp();
    const res = await app.request('/api/progress', {
      headers: { Cookie: `session=${sessionToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toEqual({});
  });

  it("returns map keyed by book_id string after saving progress", async () => {
    const app = await makeProgressApp();

    // Save progress first
    await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 1234.5, chapterIdx: 2, percentage: 0.34 })
    });

    // Get progress
    const res = await app.request('/api/progress', {
      headers: { Cookie: `session=${sessionToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body['1']).toBeDefined();
    expect(body['1'].timestamp).toBe(1234.5);
    expect(body['1'].chapterIdx).toBe(2);
    expect(body['1'].percentage).toBe(0.34);
  });

  it("does not return another user's progress (user isolation)", async () => {
    const app = await makeProgressApp();

    // Save progress as user 10
    await app.request('/api/progress/1', {
      method: 'PUT',
      headers: {
        Cookie: `session=${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timestamp: 9999.0, chapterIdx: 5, percentage: 0.99 })
    });

    // Fetch progress as user 20 — should NOT see user 10's progress
    const res = await app.request('/api/progress', {
      headers: { Cookie: `session=${otherSessionToken}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toEqual({});
  });
});
