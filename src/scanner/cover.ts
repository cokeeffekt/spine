import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/** Writable directory for extracted cover art — /data/covers/ is always writable in Docker. */
const COVERS_DIR = "/data/covers";

/**
 * Extract embedded cover art from an .m4b file using ffmpeg.
 * Writes to /data/covers/{bookId}.jpg so the books volume can remain read-only.
 * Returns the cover path on success, or null if extraction fails or no cover stream exists.
 */
export function extractCoverArt(
  m4bPath: string,
  hasAttachedPic: boolean,
  bookId: number | string
): Promise<string | null> {
  if (!hasAttachedPic) {
    return Promise.resolve(null);
  }

  // Ensure /data/covers/ exists (writable data volume)
  try {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  } catch {
    return Promise.resolve(null);
  }

  const coverPath = path.join(COVERS_DIR, `${bookId}.jpg`);

  return new Promise((resolve) => {
    const args = [
      "-y",
      "-i",
      m4bPath,
      "-map",
      "0:v",
      "-map",
      "-0:V",
      "-c",
      "copy",
      coverPath,
    ];

    const proc = spawn("ffmpeg", args);

    proc.on("close", (code: number | null) => {
      if (code === 0) {
        resolve(coverPath);
      } else {
        // Graceful — missing cover is not fatal
        resolve(null);
      }
    });

    proc.on("error", () => {
      resolve(null);
    });
  });
}

/**
 * Resolve the cover path for an .m4b file.
 * Checks /data/covers/{bookId}.jpg first (new writable location), then falls
 * back to a cover.jpg beside the .m4b (legacy path, read-only mount may block writes).
 */
export function resolveCoverPath(
  m4bPath: string,
  hasEmbeddedCover: boolean,
  bookId?: number | string
): string | null {
  // Embedded cover wins — extraction will overwrite any existing file per D-09
  if (hasEmbeddedCover) {
    return null;
  }

  // Check /data/covers/{bookId}.jpg (writable data volume)
  if (bookId !== undefined) {
    const dataCoverPath = path.join(COVERS_DIR, `${bookId}.jpg`);
    if (fs.existsSync(dataCoverPath)) {
      return dataCoverPath;
    }
  }

  // Legacy fallback: cover.jpg beside the .m4b (may exist from earlier scans)
  const legacyCoverPath = path.join(path.dirname(m4bPath), "cover.jpg");
  if (fs.existsSync(legacyCoverPath)) {
    return legacyCoverPath;
  }

  return null;
}
