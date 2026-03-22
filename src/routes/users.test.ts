import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { openDatabase, _resetForTests } from "../db/index.js";
import type { Database } from "bun:sqlite";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let db: Database;
let tmpDbPath: string;
let adminToken: string;
let userToken: string;

beforeEach(async () => {
  tmpDbPath = join(tmpdir(), `spine-users-test-${Date.now()}-${Math.random()}.db`);
  process.env['DB_PATH'] = tmpDbPath;
  _resetForTests();
  db = openDatabase(tmpDbPath);

  // Seed admin user
  const adminHash = await Bun.password.hash('adminpass');
  db.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    1, 'admin', adminHash, 'admin'
  );

  // Seed regular user
  const userHash = await Bun.password.hash('userpass');
  db.query('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    2, 'regularuser', userHash, 'user'
  );

  // Create sessions
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  adminToken = 'admin-session-token';
  userToken = 'user-session-token';
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    adminToken, 1, futureDate
  );
  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    userToken, 2, futureDate
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

async function makeUsersApp() {
  const { authMiddleware } = await import("../middleware/auth.js");
  const userRoutes = (await import("../routes/users.js")).default;
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api', userRoutes);
  return app;
}

describe("POST /api/users", () => {
  it("creates user with admin session, returns 201 with id, username, role", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ username: 'newuser', password: 'newpass123' })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeGreaterThan(0);
    expect(body.username).toBe('newuser');
    expect(body.role).toBe('user');
  });

  it("returns 403 with non-admin session", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${userToken}`
      },
      body: JSON.stringify({ username: 'anotheruser', password: 'pass123' })
    });

    expect(res.status).toBe(403);
  });

  it("returns 401 without session", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anotheruser', password: 'pass123' })
    });

    expect(res.status).toBe(401);
  });

  it("returns 409 with duplicate username", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ username: 'admin', password: 'pass123' })
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Username already exists');
  });

  it("returns 400 with missing username", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ password: 'pass123' })
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 with missing password", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ username: 'newuser' })
    });

    expect(res.status).toBe(400);
  });

  it("stores password as argon2id hash, not plaintext", async () => {
    const app = await makeUsersApp();
    await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ username: 'hashtest', password: 'myplainpassword' })
    });

    const user = db.query<{ password_hash: string }, [string]>(
      'SELECT password_hash FROM users WHERE username = ?'
    ).get('hashtest');

    expect(user).not.toBeNull();
    expect(user!.password_hash).toStartWith('$argon2id$');
    expect(user!.password_hash).not.toBe('myplainpassword');
  });

  it("creates admin-role user when role=admin is specified", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ username: 'newadmin', password: 'adminpass', role: 'admin' })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe('admin');
  });
});

describe("DELETE /api/users/:id", () => {
  it("deletes user with admin session, returns 200", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users/2', {
      method: 'DELETE',
      headers: { Cookie: `session=${adminToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify user is gone
    const user = db.query<{ id: number }, [number]>('SELECT id FROM users WHERE id = ?').get(2);
    expect(user).toBeNull();
  });

  it("returns 404 for nonexistent user", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users/9999', {
      method: 'DELETE',
      headers: { Cookie: `session=${adminToken}` }
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 when admin tries to delete themselves", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users/1', {
      method: 'DELETE',
      headers: { Cookie: `session=${adminToken}` }
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Cannot delete yourself');
  });

  it("returns 403 for non-admin", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users/1', {
      method: 'DELETE',
      headers: { Cookie: `session=${userToken}` }
    });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/users/:id/password", () => {
  it("updates password hash with admin session, returns 200", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users/2/password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ password: 'newpassword123' })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify password was updated and is argon2id
    const user = db.query<{ password_hash: string }, [number]>(
      'SELECT password_hash FROM users WHERE id = ?'
    ).get(2);
    expect(user!.password_hash).toStartWith('$argon2id$');
  });

  it("invalidates sessions when password is changed", async () => {
    const app = await makeUsersApp();

    // Verify user has a session
    const sessionsBefore = db.query<{ n: number }, [number]>(
      'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?'
    ).get(2)!.n;
    expect(sessionsBefore).toBeGreaterThan(0);

    await app.request('/api/users/2/password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ password: 'newpassword123' })
    });

    // Sessions should be cleared
    const sessionsAfter = db.query<{ n: number }, [number]>(
      'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?'
    ).get(2)!.n;
    expect(sessionsAfter).toBe(0);
  });

  it("returns 404 for nonexistent user", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users/9999/password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({ password: 'newpass' })
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users/1/password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${userToken}`
      },
      body: JSON.stringify({ password: 'newpass' })
    });

    expect(res.status).toBe(403);
  });

  it("returns 400 with missing password", async () => {
    const app = await makeUsersApp();
    const res = await app.request('/api/users/2/password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${adminToken}`
      },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
  });
});
