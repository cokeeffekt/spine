import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getCoverSize } from "../config.js";

/** Writable directory for extracted cover art — /data/covers/ is always writable in Docker. */
export const COVERS_DIR = "/data/covers";

/**
 * Rewrite an Amazon media-CDN image URL to request a smaller, properly-encoded image.
 * Audnexus returns bare full-size URLs (e.g. .../91eSLstxHiL.jpg → 2400px). Amazon's CDN
 * supports a size modifier inserted before the extension (._SL500_ = scale longest side to
 * 500px). Any existing modifier is replaced. Non-Amazon URLs are returned unchanged.
 */
export function resizeAmazonImageUrl(url: string, maxPx: number): string {
  if (!Number.isFinite(maxPx) || maxPx <= 0) return url;
  return url.replace(
    /(:\/\/[^/]*amazon\.com\/images\/[^?]+?)(\._[A-Za-z0-9,]+_)?(\.(?:jpg|jpeg|png|gif))(\?|$)/i,
    (_m, base, _mod, ext, tail) => `${base}._SL${maxPx}_${ext}${tail}`
  );
}

/**
 * Download a remote cover image (e.g. an Audnexus image URL) to
 * /data/covers/{bookId}.jpg and return the local path, or null on failure.
 * Amazon CDN URLs are downscaled to COVER_SIZE (default 500px) before download.
 *
 * Fixes the bug where a remote URL was stored directly in books.cover_path —
 * the cover route serves files via Bun.file(), which cannot serve a URL.
 */
export async function downloadCover(
  url: string,
  bookId: number | string
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  url = resizeAmazonImageUrl(url, getCoverSize());
  try {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  } catch {
    return null;
  }
  const coverPath = path.join(COVERS_DIR, `${bookId}.jpg`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "spine/1.0" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    fs.writeFileSync(coverPath, buf);
    return coverPath;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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

  // Fallback: look for an image file in the same folder as the .m4b
  const dir = path.dirname(m4bPath);
  const imageNames = ["cover.jpg", "cover.jpeg", "cover.png", "folder.jpg", "folder.png"];
  for (const name of imageNames) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }

  // Last resort: any .jpg/.jpeg/.png in the folder
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (/\.(jpe?g|png)$/i.test(f)) {
        return path.join(dir, f);
      }
    }
  } catch {}

  return null;
}
