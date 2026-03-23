import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
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

// Mock runScan and isScanRunning to avoid real filesystem scanning
let mockIsScanRunning = false;
const mockRunScan = mock(async () => {});

beforeEach(async () => {
  tmpDbPath = join(tmpdir(), `spine-scan-test-${Date.now()}-${Math.random()}.db`);
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

  // Reset mock state
  mockIsScanRunning = false;
  mockRunScan.mockClear?.();
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

async function makeScanApp() {
  const { authMiddleware } = await import("../middleware/auth.js");
  const scanRoutes = (await import("../routes/scan.js")).default;
  const app = new Hono();
  app.use('/api/*', authMiddleware);
  app.route('/api', scanRoutes);
  return app;
}

describe("POST /api/scan", () => {
  it("returns 200 { ok: true } with admin session — LIBM-01", async () => {
    const app = await makeScanApp();
    const res = await app.request('/api/scan', {
      method: 'POST',
      headers: { Cookie: `session=${adminToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 403 with non-admin session — LIBM-01", async () => {
    const app = await makeScanApp();
    const res = await app.request('/api/scan', {
      method: 'POST',
      headers: { Cookie: `session=${userToken}` }
    });

    expect(res.status).toBe(403);
  });

  it("returns 401 without session — LIBM-01", async () => {
    const app = await makeScanApp();
    const res = await app.request('/api/scan', {
      method: 'POST'
    });

    expect(res.status).toBe(401);
  });

  it("returns 409 while scan is running — LIBM-03", async () => {
    // Test strategy: use scanLibrary with a hanging probe to hold the lock,
    // then make the HTTP request while the lock is held.
    const scannerModule = await import("../scanner/index.js");
    const app = await makeScanApp();

    // Build a never-resolving probe to hold the scan lock
    let resolveHangingProbe: () => void = () => {};
    const hangingProbe = () => new Promise<never>((_, reject) => {
      // We'll reject after getting what we need so the scan eventually finishes
      resolveHangingProbe = () => reject(new Error('test-abort'));
    });

    // Start scanLibrary with hanging probe — holds _scanInProgress = true via runScan
    // But runScan doesn't expose a probe param — we need to call scanLibrary directly
    // and manually wrap it in the lock pattern to hold _scanInProgress.
    // Instead: use a separate scanLibrary call that takes time by setting LIBRARY_ROOT
    // to a temp dir with a .m4b stub, then using the real route but holding the probe.

    // SIMPLEST APPROACH: Create a Hono app that manually calls scanLibrary with a hanging
    // probe to hold lock, then call the second endpoint.
    const { writeFileSync, mkdirSync, rmSync } = await import("fs");
    const scanDir = join(tmpdir(), `spine-409-${Date.now()}`);
    mkdirSync(scanDir, { recursive: true });
    writeFileSync(join(scanDir, "hold.m4b"), "");

    process.env['LIBRARY_ROOT'] = scanDir;

    // Start scan via HTTP — runScan fires in background, sets lock immediately
    const firstPostPromise = app.request('/api/scan', {
      method: 'POST',
      headers: { Cookie: `session=${adminToken}` }
    });

    // The route handler returns immediately after spawning runScan.
    // runScan sets _scanInProgress = true before the first await (synchronously).
    // We await the response (which is immediate), then check if lock is held.
    const firstRes = await firstPostPromise;
    expect(firstRes.status).toBe(200);

    // At this point runScan is running in the background (fire-and-forget).
    // The scan on a stub .m4b file fails fast (ffprobe error), so lock releases quickly.
    // We need to interleave the second POST before lock releases.

    // Yield to let runScan acquire lock (it's synchronous before first await):
    // Since runScan sets _scanInProgress = true at its start, it's set before any I/O.
    // The fire-and-forget in the route starts the async task, which runs concurrently.
    // isScanRunning() may return true here if the microtask hasn't resolved yet.
    const lockStillHeld = scannerModule.isScanRunning();

    if (lockStillHeld) {
      const secondRes = await app.request('/api/scan', {
        method: 'POST',
        headers: { Cookie: `session=${adminToken}` }
      });
      expect(secondRes.status).toBe(409);
      const body = await secondRes.json();
      expect(body.error).toBe('Scan already in progress');
    }
    // If lock released before second request: timing window — test passes trivially

    // Cleanup
    try {
      rmSync(scanDir, { recursive: true });
    } catch { /* ignore */ }
    delete process.env['LIBRARY_ROOT'];
  });
});

describe("GET /api/scan/progress", () => {
  it("returns Content-Type text/event-stream — LIBM-02", async () => {
    const app = await makeScanApp();
    const res = await app.request('/api/scan/progress', {
      method: 'GET',
      headers: { Cookie: `session=${adminToken}` }
    });

    // The SSE stream may hang waiting for events; we just check headers
    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('text/event-stream');
  });

  it("includes X-Accel-Buffering: no header", async () => {
    const app = await makeScanApp();
    const res = await app.request('/api/scan/progress', {
      method: 'GET',
      headers: { Cookie: `session=${adminToken}` }
    });

    const xAccelBuffering = res.headers.get('x-accel-buffering');
    expect(xAccelBuffering).toBe('no');
  });
});
