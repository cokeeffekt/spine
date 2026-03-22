import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { openDatabase } from "../db/index.js";
import { _resetForTests } from "../db/index.js";
import type { Database } from "bun:sqlite";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let db: Database;
let tmpDbPath: string;

// Build test app after DB is set up
function makeTestApp(db: Database) {
  // We need to use auth middleware after resetting the singleton to our test db
  const { authMiddleware, adminOnly } = require("../middleware/auth.js");
  const app = new Hono();

  app.use('/api/*', authMiddleware);

  app.get('/api/test', (c) => {
    return c.json({ userId: c.get('userId'), role: c.get('role') });
  });

  app.use('/api/admin-test', adminOnly);
  app.get('/api/admin-test', (c) => {
    return c.json({ ok: true });
  });

  return app;
}

beforeEach(() => {
  tmpDbPath = join(tmpdir(), `spine-auth-test-${Date.now()}-${Math.random()}.db`);
  process.env['DB_PATH'] = tmpDbPath;
  _resetForTests();
  db = openDatabase(tmpDbPath);

  // Seed test users
  db.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    1, 'testuser', '$argon2id$dummy', 'user'
  );
  db.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    2, 'testadmin', '$argon2id$dummy', 'admin'
  );

  // Create sessions
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    'valid-user-token', 1, futureDate
  );
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    'valid-admin-token', 2, futureDate
  );

  // Expired session
  const pastDate = new Date(Date.now() - 86400000).toISOString();
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    'expired-token', 1, pastDate
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

describe("authMiddleware", () => {
  it("returns 401 with no session cookie", async () => {
    const { authMiddleware } = await import("../middleware/auth.js");
    const app = new Hono();
    app.use('/api/*', authMiddleware);
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it("returns 401 with invalid/nonexistent session token", async () => {
    const { authMiddleware } = await import("../middleware/auth.js");
    const app = new Hono();
    app.use('/api/*', authMiddleware);
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test', {
      headers: { Cookie: 'session=nonexistent-token' }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it("returns 401 with expired session token", async () => {
    const { authMiddleware } = await import("../middleware/auth.js");
    const app = new Hono();
    app.use('/api/*', authMiddleware);
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test', {
      headers: { Cookie: 'session=expired-token' }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it("passes through with valid session and sets userId and role", async () => {
    const { authMiddleware } = await import("../middleware/auth.js");
    const app = new Hono<{ Variables: { userId: number; role: string } }>();
    app.use('/api/*', authMiddleware);
    app.get('/api/test', (c) => c.json({ userId: c.get('userId'), role: c.get('role') }));

    const res = await app.request('/api/test', {
      headers: { Cookie: 'session=valid-user-token' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(1);
    expect(body.role).toBe('user');
  });
});

describe("adminOnly middleware", () => {
  it("returns 403 with role=user", async () => {
    const { authMiddleware, adminOnly } = await import("../middleware/auth.js");
    const app = new Hono();
    app.use('/api/*', authMiddleware);
    app.use('/api/admin-test', adminOnly);
    app.get('/api/admin-test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/admin-test', {
      headers: { Cookie: 'session=valid-user-token' }
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it("passes through for role=admin", async () => {
    const { authMiddleware, adminOnly } = await import("../middleware/auth.js");
    const app = new Hono();
    app.use('/api/*', authMiddleware);
    app.use('/api/admin-test', adminOnly);
    app.get('/api/admin-test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/admin-test', {
      headers: { Cookie: 'session=valid-admin-token' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
