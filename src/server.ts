import { Hono } from "hono";
import { getDatabase } from "./db/index.js";
import { scanLibrary } from "./scanner/index.js";
import { startWatcher } from "./scanner/watcher.js";

export const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Only start the server when not in test mode
if (process.env["NODE_ENV"] !== "test") {
  const port = parseInt(process.env["PORT"] ?? "3000", 10);
  const libraryRoot = process.env["LIBRARY_ROOT"] ?? "/books";

  // Initialize database
  const db = getDatabase();

  console.log(`Spine server listening on port ${port}`);
  Bun.serve({
    fetch: app.fetch,
    port,
  });

  // Run initial library scan on startup (D-01)
  // Wrapped in try/catch — missing LIBRARY_ROOT should not crash server (e.g. first run, no books yet)
  (async () => {
    try {
      await scanLibrary(db, libraryRoot);
    } catch (err) {
      console.warn(
        `[server] Initial scan failed (library root may not exist yet): ${(err as Error).message}`
      );
    }

    // Start periodic re-scan watcher (D-01)
    startWatcher(db, libraryRoot);
    const intervalMs = parseInt(process.env["SCAN_INTERVAL_MS"] ?? "300000", 10);
    console.log(`Library watcher started (interval: ${intervalMs}ms)`);
  })();
}
