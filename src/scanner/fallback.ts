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
 *   1. metadata.json in the same directory as the .m4b file
 *   2. Folder name used as title hint when all other title sources are empty
 *
 * Returns a new metadata object (mutates a shallow copy).
 */
export function applyFallbackMetadata(
  metadata: NormalizedMetadata,
  m4bPath: string
): NormalizedMetadata {
  const result = { ...metadata };
  const dir = path.dirname(m4bPath);

  // --- Step 1: Read metadata.json from the same directory ---
  const metaJsonPath = path.join(dir, "metadata.json");
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
    result.title = path.basename(dir);
  }

  return result;
}
