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

beforeEach(async () => {
  tmpDbPath = join(tmpdir(), `spine-auth-routes-test-${Date.now()}-${Math.random()}.db`);
  process.env['DB_PATH'] = tmpDbPath;
  _resetForTests();
  db = openDatabase(tmpDbPath);

  // Seed a test user with known password
  const hash = await Bun.password.hash('testpass');
  db.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    1, 'testuser', hash, 'user'
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

async function makeAuthApp() {
  const authRoutes = (await import("../routes/auth.js")).default;
  const { authMiddleware } = await import("../middleware/auth.js");
  const app = new Hono();
  app.route('/auth', authRoutes);
  app.use('/api/*', authMiddleware);
  app.get('/api/test', (c) => c.json({ ok: true }));
  return app;
}

describe("POST /auth/login", () => {
  it("returns 200 and sets HttpOnly session cookie with valid credentials", async () => {
    const app = await makeAuthApp();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' })
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie?.toLowerCase()).toContain('samesite=strict');
  });

  it("returns 401 with wrong password", async () => {
    const app = await makeAuthApp();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'wrongpassword' })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid credentials' });
  });

  it("returns 401 for nonexistent username (no user enumeration)", async () => {
    const app = await makeAuthApp();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent', password: 'whatever' })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid credentials' });
  });

  it("returns 400 with missing fields", async () => {
    const app = await makeAuthApp();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser' })
    });

    expect(res.status).toBe(400);
  });

  it("stores session row with expires_at ~30 days in the future", async () => {
    const app = await makeAuthApp();
    const before = Date.now();
    await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' })
    });

    const session = db.query<{ expires_at: string }, []>(
      'SELECT expires_at FROM sessions WHERE user_id = 1'
    ).get();

    expect(session).not.toBeNull();
    const expiresAt = new Date(session!.expires_at).getTime();
    const expectedMin = before + 29 * 24 * 60 * 60 * 1000;
    const expectedMax = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);
  });
});

describe("POST /auth/logout", () => {
  it("deletes session row and clears cookie with valid session", async () => {
    const app = await makeAuthApp();

    // First log in to get a session
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' })
    });
    const setCookie = loginRes.headers.get('set-cookie')!;
    const tokenMatch = setCookie.match(/session=([^;]+)/);
    const token = tokenMatch![1];

    // Verify session exists
    const sessionsBefore = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM sessions').get()!.n;
    expect(sessionsBefore).toBe(1);

    // Logout
    const logoutRes = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Cookie: `session=${token}` }
    });
    expect(logoutRes.status).toBe(200);

    // Session should be deleted
    const sessionsAfter = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM sessions').get()!.n;
    expect(sessionsAfter).toBe(0);
  });

  it("returns 401 without session cookie", async () => {
    const app = await makeAuthApp();
    const res = await app.request('/auth/logout', {
      method: 'POST'
    });
    expect(res.status).toBe(401);
  });

  it("session token no longer authenticates after logout", async () => {
    const app = await makeAuthApp();

    // Log in
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' })
    });
    const setCookie = loginRes.headers.get('set-cookie')!;
    const tokenMatch = setCookie.match(/session=([^;]+)/);
    const token = tokenMatch![1];

    // Verify auth works before logout
    const authBefore = await app.request('/api/test', {
      headers: { Cookie: `session=${token}` }
    });
    expect(authBefore.status).toBe(200);

    // Logout
    await app.request('/auth/logout', {
      method: 'POST',
      headers: { Cookie: `session=${token}` }
    });

    // Auth should now fail
    const authAfter = await app.request('/api/test', {
      headers: { Cookie: `session=${token}` }
    });
    expect(authAfter.status).toBe(401);
  });
});
