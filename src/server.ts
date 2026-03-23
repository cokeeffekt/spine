import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getDatabase } from "./db/index.js";
import { scanLibrary } from "./scanner/index.js";
import { startWatcher } from "./scanner/watcher.js";
import { authMiddleware } from "./middleware/auth.js";
import { bootstrapAdmin } from "./db/bootstrap.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import bookRoutes from "./routes/books.js";
import audioRoutes from "./routes/audio.js";
import coverRoutes from "./routes/cover.js";
import scanRoutes from "./routes/scan.js";

export const app = new Hono();

// Unauthenticated routes (/health remains open per D-13)
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes — outside /api/* so they are NOT behind authMiddleware
app.route("/auth", authRoutes);

// Protected API routes — middleware registered before route handlers
app.use("/api/*", authMiddleware);

// Mount all API routes after auth middleware (per D-13, Pitfall 2)
app.route("/api", userRoutes);
app.route("/api", bookRoutes);
app.route("/api", audioRoutes);
app.route("/api", coverRoutes);
app.route("/api", scanRoutes);

// Static files — must come AFTER all API/auth routes (per D-20, Pitfall 2)
app.use("/*", serveStatic({ root: "./public" }));
app.get("/*", serveStatic({ path: "./public/index.html" }));

// Only start the server when not in test mode
if (process.env["NODE_ENV"] !== "test") {
  const port = parseInt(process.env["PORT"] ?? "3000", 10);
  const libraryRoot = process.env["LIBRARY_ROOT"] ?? "/books";

  const db = getDatabase();

  console.log(`Spine server listening on port ${port}`);
  Bun.serve({
    fetch: app.fetch,
    port,
    idleTimeout: 255,
  });

  (async () => {
    // Bootstrap admin account from env vars on empty DB (AUTH-06)
    await bootstrapAdmin(db);

    console.log(`[server] Starting initial library scan...`);
    try {
      await scanLibrary(db, libraryRoot);
      console.log(`[server] Initial library scan complete`);
    } catch (err) {
      console.warn(
        `[server] Initial scan failed (library root may not exist yet): ${(err as Error).message}`
      );
    }

    startWatcher(db, libraryRoot);
    const intervalMs = parseInt(process.env["SCAN_INTERVAL_MS"] ?? "300000", 10);
    console.log(`Library watcher started (interval: ${intervalMs}ms)`);
  })();
}
