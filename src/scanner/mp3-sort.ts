import * as path from "path";

/**
 * Regex that matches disc subfolder names like:
 * "Disc 1", "Disc1", "DISC 2", "CD 3", "CD3", "Part 1", "Disk 4", "disc 10"
 */
export const DISC_FOLDER_RE = /^(?:disc|disk|cd|part)\s*(\d+)$/i;

/**
 * Parse a TRCK (track number) ID3 tag value to an integer.
 *
 * Handles:
 * - "3"    → 3
 * - "3/12" → 3  (track/total format)
 * - null / undefined / "" / "abc" → null
 */
export function parseTrackNumber(trck: string | null | undefined): number | null {
  if (!trck) return null;
  const segment = trck.split("/")[0];
  const parsed = parseInt(segment, 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse a folder name to a disc number.
 *
 * Returns the disc number if the folder name matches DISC_FOLDER_RE,
 * or null if the name is not a recognized disc subfolder pattern.
 */
export function parseDiscNumber(folderName: string): number | null {
  const match = DISC_FOLDER_RE.exec(folderName);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Sort an array of tracks by track number, falling back to filename natural sort.
 *
 * Sort rules:
 * - Both have trackNumber: compare numerically. If equal, tiebreak by basename natural sort.
 * - One null trackNumber: null sorts AFTER non-null.
 * - Both null: natural sort by basename using localeCompare with numeric sensitivity.
 *
 * Returns a NEW sorted array — does not mutate input.
 */
export function sortTracks<T extends { filePath: string; trackNumber: number | null }>(
  tracks: T[]
): T[] {
  return [...tracks].sort((a, b) => {
    const aNum = a.trackNumber;
    const bNum = b.trackNumber;

    // Both have track numbers — compare numerically, tiebreak by filename
    if (aNum !== null && bNum !== null) {
      if (aNum !== bNum) return aNum - bNum;
      return naturalCompareBasename(a.filePath, b.filePath);
    }

    // null sorts after non-null
    if (aNum !== null && bNum === null) return -1;
    if (aNum === null && bNum !== null) return 1;

    // Both null — natural sort by basename
    return naturalCompareBasename(a.filePath, b.filePath);
  });
}

function naturalCompareBasename(filePathA: string, filePathB: string): number {
  const a = path.basename(filePathA);
  const b = path.basename(filePathB);
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
