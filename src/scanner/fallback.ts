import * as fs from "fs";
import * as path from "path";
import type { NormalizedMetadata } from "../types.js";

/**
 * Shape of a folder-level metadata.json fallback file.
 * All fields are optional — only non-empty strings override null metadata fields.
 */
export type FallbackMetadataJson = {
  title?: string;
  author?: string;
  narrator?: string;
  year?: string;
  description?: string;
  genre?: string;
  publisher?: string;
  language?: string;
  series_title?: string;
  series_position?: string;
};

/**
 * Apply folder-level fallback metadata to a NormalizedMetadata object.
 *
 * Priority (per D-07): embedded metadata always wins.
 * Fallback sources fill null fields only:
 *   1. metadata.json in the same directory as the .m4b file (or inside the folder when isFolder=true)
 *   2. Folder name used as title hint when all other title sources are empty
 *   3. (isFolder only) Grandparent folder name used as author hint — D-05
 *
 * When isFolder=true, the path is treated as a directory:
 *   - title fallback uses path.basename(normalized) (the folder name itself)
 *   - author fallback uses path.basename(path.dirname(normalized)) (grandparent = author)
 *   - metadata.json looked up at path.join(normalized, "metadata.json") (inside the folder)
 *
 * Returns a new metadata object (mutates a shallow copy).
 */
export function applyFallbackMetadata(
  metadata: NormalizedMetadata,
  filePath: string,
  isFolder?: boolean
): NormalizedMetadata {
  const result = { ...metadata };

  let dir: string;
  let metaJsonPath: string;
  let titleFallback: string;

  if (isFolder) {
    // Strip trailing slash before path operations
    const normalized = filePath.replace(/\/+$/, "");
    dir = normalized;
    metaJsonPath = path.join(normalized, "metadata.json");
    titleFallback = path.basename(normalized);
  } else {
    dir = path.dirname(filePath);
    metaJsonPath = path.join(dir, "metadata.json");
    titleFallback = path.basename(dir);
  }

  // --- Step 1: Read metadata.json ---
  if (fs.existsSync(metaJsonPath)) {
    let fallback: FallbackMetadataJson;
    try {
      const raw = fs.readFileSync(metaJsonPath, "utf-8");
      fallback = JSON.parse(raw) as FallbackMetadataJson;
    } catch {
      // Malformed JSON — skip silently
      fallback = {};
    }

    // Only fill fields that are currently null (embedded wins)
    if (result.title === null && fallback.title) result.title = fallback.title;
    if (result.author === null && fallback.author) result.author = fallback.author;
    if (result.narrator === null && fallback.narrator) result.narrator = fallback.narrator;
    if (result.year === null && fallback.year) result.year = fallback.year;
    if (result.description === null && fallback.description) result.description = fallback.description;
    if (result.genre === null && fallback.genre) result.genre = fallback.genre;
    if (result.publisher === null && fallback.publisher) result.publisher = fallback.publisher;
    if (result.language === null && fallback.language) result.language = fallback.language;
    if (result.series_title === null && fallback.series_title) result.series_title = fallback.series_title;
    if (result.series_position === null && fallback.series_position) result.series_position = fallback.series_position;
  }

  // --- Step 2: Use folder name as title hint when title is still null ---
  if (result.title === null) {
    result.title = titleFallback;
  }

  // --- Step 3: (isFolder only) Use grandparent folder name as author hint --- D-05
  if (isFolder && result.author === null) {
    const normalized = filePath.replace(/\/+$/, "");
    const grandparent = path.basename(path.dirname(normalized));
    if (grandparent && grandparent !== ".") {
      result.author = grandparent;
    }
  }

  return result;
}
