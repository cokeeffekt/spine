import { Database } from "bun:sqlite";
import { scanLibrary, isScanRunning } from "./index.js";

let _watcherInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start a periodic library re-scan watcher using setInterval.
 *
 * Design decision: uses setInterval polling instead of chokidar because:
 * - chokidar requires usePolling:true in Docker (functionally identical to setInterval)
 * - chokidar v5 ESM + Bun compatibility is unverified
 * - setInterval is zero-dependency and 100% reliable
 *
 * Interval defaults to 5 minutes; configurable via SCAN_INTERVAL_MS env var.
 *
 * Each tick calls scanLibrary, which handles adds, changes, and removals
 * because it walks the directory, diffs against DB, and marks missing files.
 */
export function startWatcher(db: Database, libraryRoot: string): void {
  const intervalMs = parseInt(process.env["SCAN_INTERVAL_MS"] ?? "300000", 10);

  _watcherInterval = setInterval(async () => {
    if (isScanRunning()) {
      console.log('[watcher] Skipping tick — manual scan in progress')
      return
    }
    console.log(`[watcher] Re-scanning library at ${new Date().toISOString()}`);
    try {
      await scanLibrary(db, libraryRoot);
    } catch (err) {
      console.error(`[watcher] Scan error: ${(err as Error).message}`);
    }
  }, intervalMs);

  console.log(`[watcher] Library watcher started (interval: ${intervalMs}ms)`);
}

/**
 * Stop the periodic watcher. Used for clean shutdown and testing.
 */
export function stopWatcher(): void {
  if (_watcherInterval !== null) {
    clearInterval(_watcherInterval);
    _watcherInterval = null;
  }
}
