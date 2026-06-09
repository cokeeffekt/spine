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
 * Words that mark a subfolder as a *section of one book* (a part/disc/book/chapter), as opposed
 * to a separate book in a series. "part", "disc", "disk", "cd", "section", "chapter" are
 * unambiguous slices of one work. "book" is included too: in practice a folder of sibling
 * "Book N — …" subfolders is one novel split internally (e.g. The Stand → Book I/II/III), not a
 * series — series entries live in separate top-level folders ("1. Ice Planet Barbarians"), not
 * nested "Book N" subfolders. Trade-off: a box set laid out as "Series/Book 1/, Book 2/" with
 * NO loose files would merge into one m4b; that layout doesn't occur in this library and an
 * admin can split it if it ever does.
 *
 * A keyword only counts when paired with an ordinal — a leading number ("1| Part One"),
 * or the keyword directly followed by a number, roman numeral, or number-word ("Book 1",
 * "Book III", "Part One"). A bare "Book" or "Part" folder is NOT treated as a section.
 */
const SECTION_KEYWORD_RE = /\b(?:part|disc|disk|cd|section|book|chapter)\b/i;
const NUMBER_WORD =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen";
const KEYWORD_WITH_ORDINAL_RE = new RegExp(
  `\\b(?:part|disc|disk|cd|section|book|chapter)\\s+(?:\\d+|[ivxl]+|${NUMBER_WORD})\\b`,
  "i"
);

/**
 * Whether a subfolder name looks like a *section* of a single audiobook
 * (e.g. "Disc 1", "Part 2", "1| Part One - Dennis", "Book III - Captain Trips"),
 * rather than a distinct book in a series (e.g. "1. Ice Planet Barbarians").
 */
export function isSectionFolder(name: string): boolean {
  if (parseDiscNumber(name) !== null) return true; // Disc 1 / CD 2 / Part 3 (strict)
  if (!SECTION_KEYWORD_RE.test(name)) return false; // no section keyword at all
  // Keyword present — require an ordinal: a leading number, or keyword + number/roman/word.
  if (/^\s*\d+/.test(name)) return true;
  return KEYWORD_WITH_ORDINAL_RE.test(name);
}

/**
 * Extract a leading integer from an item name, e.g.
 * "0| Prologue.mp3" → 0, "3 - Part Three" → 3, "01.mp3" → 1, "Disc 2" → 2.
 * Tries the strict disc pattern first, then a leading-number prefix.
 * Returns null when no leading ordinal is present.
 */
export function parseSectionOrder(name: string): number | null {
  const disc = parseDiscNumber(name);
  if (disc !== null) return disc;
  const match = /^\s*(\d+)/.exec(name);
  return match ? parseInt(match[1], 10) : null;
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
