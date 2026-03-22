import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { openDatabase } from "./index.js";
import type { Database } from "bun:sqlite";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let db: Database;
let tmpDbPath: string;

beforeEach(() => {
  tmpDbPath = join(tmpdir(), `spine-bootstrap-test-${Date.now()}-${Math.random()}.db`);
  db = openDatabase(tmpDbPath);
});

afterEach(() => {
  db.close();
  try {
    rmSync(tmpDbPath, { force: true });
    rmSync(`${tmpDbPath}-wal`, { force: true });
    rmSync(`${tmpDbPath}-shm`, { force: true });
  } catch {
    // ignore
  }
  // Clean up env vars
  delete process.env['ADMIN_USERNAME'];
  delete process.env['ADMIN_PASSWORD'];
});

describe("bootstrapAdmin", () => {
  it("creates admin when users table is empty and env vars are set", async () => {
    const { bootstrapAdmin } = await import("./bootstrap.js");
    process.env['ADMIN_USERNAME'] = 'testadmin';
    process.env['ADMIN_PASSWORD'] = 'testpassword123';

    await bootstrapAdmin(db);

    const user = db.query<{ username: string; role: string }, []>(
      'SELECT username, role FROM users'
    ).get();

    expect(user).not.toBeNull();
    expect(user!.username).toBe('testadmin');
    expect(user!.role).toBe('admin');
  });

  it("stores password as Argon2id hash", async () => {
    const { bootstrapAdmin } = await import("./bootstrap.js");
    process.env['ADMIN_USERNAME'] = 'testadmin';
    process.env['ADMIN_PASSWORD'] = 'testpassword123';

    await bootstrapAdmin(db);

    const user = db.query<{ password_hash: string }, []>(
      'SELECT password_hash FROM users'
    ).get();

    expect(user).not.toBeNull();
    expect(user!.password_hash).toMatch(/^\$argon2id\$/);
  });

  it("skips when users already exist", async () => {
    const { bootstrapAdmin } = await import("./bootstrap.js");
    process.env['ADMIN_USERNAME'] = 'testadmin';
    process.env['ADMIN_PASSWORD'] = 'testpassword123';

    // Pre-seed a user
    db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
      'existinguser', '$argon2id$dummy', 'user'
    );

    await bootstrapAdmin(db);

    // Should still be only one user
    const count = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM users').get()!.n;
    expect(count).toBe(1);

    // The existing user should still be there
    const user = db.query<{ username: string }, []>('SELECT username FROM users').get();
    expect(user!.username).toBe('existinguser');
  });

  it("logs warning when no users exist and env vars are missing", async () => {
    const { bootstrapAdmin } = await import("./bootstrap.js");
    // No env vars set
    delete process.env['ADMIN_USERNAME'];
    delete process.env['ADMIN_PASSWORD'];

    // Should not throw
    await expect(bootstrapAdmin(db)).resolves.toBeUndefined();

    const count = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM users').get()!.n;
    expect(count).toBe(0);
  });

  it("users table has correct columns", () => {
    const columns = db.query<{ name: string }, []>('PRAGMA table_info(users)').all();
    const names = columns.map((c) => c.name);
    expect(names).toContain('id');
    expect(names).toContain('username');
    expect(names).toContain('password_hash');
    expect(names).toContain('role');
    expect(names).toContain('created_at');
  });

  it("sessions table has correct columns", () => {
    const columns = db.query<{ name: string }, []>('PRAGMA table_info(sessions)').all();
    const names = columns.map((c) => c.name);
    expect(names).toContain('token');
    expect(names).toContain('user_id');
    expect(names).toContain('expires_at');
    expect(names).toContain('created_at');
  });

  it("deleting a user cascades to delete their sessions", () => {
    // Insert a user
    db.query('INSERT INTO users (id, username, password_hash, role) VALUES (1, ?, ?, ?)').run(
      'cascadeuser', '$argon2id$dummy', 'user'
    );

    // Insert a session for that user
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      'test-token-abc123', 1, futureDate
    );

    // Verify session exists
    const sessionsBefore = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM sessions').get()!.n;
    expect(sessionsBefore).toBe(1);

    // Delete the user
    db.query('DELETE FROM users WHERE id = 1').run();

    // Sessions should be gone
    const sessionsAfter = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM sessions').get()!.n;
    expect(sessionsAfter).toBe(0);
  });
});
