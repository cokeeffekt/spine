import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Extract embedded cover art from an .m4b file using ffmpeg.
 * Returns the cover.jpg path on success, or null if extraction fails or no cover stream exists.
 */
export function extractCoverArt(
  m4bPath: string,
  hasAttachedPic: boolean
): Promise<string | null> {
  if (!hasAttachedPic) {
    return Promise.resolve(null);
  }

  const coverPath = path.join(path.dirname(m4bPath), "cover.jpg");

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
 * If hasEmbeddedCover is true, returns null — extraction will handle writing/overwriting.
 * If hasEmbeddedCover is false, returns existing cover.jpg path as fallback (D-10), or null.
 */
export function resolveCoverPath(
  m4bPath: string,
  hasEmbeddedCover: boolean
): string | null {
  // Embedded cover wins — extraction will overwrite any existing file per D-09
  if (hasEmbeddedCover) {
    return null;
  }

  const coverPath = path.join(path.dirname(m4bPath), "cover.jpg");
  if (fs.existsSync(coverPath)) {
    return coverPath;
  }

  return null;
}
