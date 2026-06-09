/**
 * Parse an audiobook folder/file name into author + title hints.
 *
 * Many libraries name folders like "Author - Title", "Author-Title", or just
 * "Title". Ripped books often have junk embedded tags (filenames), so the folder
 * name is frequently the best author/title signal we have.
 *
 * Rules:
 * - Whitespace runs are collapsed to a single space and the value trimmed
 *   (handles `Charles  Stross-Accelerando` → `Charles Stross` / `Accelerando`).
 * - A leading `YYYY - ` / `YYYY-` date prefix is stripped: a publication year is not an
 *   author (handles `1983 - Christine` → title `Christine`, author null → falls back to the
 *   grandparent/library author rather than the literal string "1983").
 * - A spaced separator " - " takes precedence over a bare "-", because titles
 *   often contain hyphens but rarely " - ".
 * - With no separator, author is null and the whole string is the title.
 */
export interface ParsedName {
  author: string | null;
  title: string;
}

export function parseFolderName(name: string): ParsedName {
  let normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized) return { author: null, title: "" };

  // Strip a leading 4-digit year prefix ("1983 - Christine", "1982-The Talisman"). The year is
  // a date, not an author; the real author comes from the library's grandparent-dir fallback.
  normalized = normalized.replace(/^\d{4}\s*-\s*/, "").trim();
  if (!normalized) return { author: null, title: "" };

  // Mask parenthetical/bracketed groups (same length) so a "-" inside them — e.g.
  // "The Gunslinger (DT1 - revised edition - read by George Guidall)" — isn't mistaken for the
  // author/title separator. Indices in the mask line up with the original string.
  const masked = normalized.replace(/[([{][^)\]}]*[)\]}]/g, (m) => " ".repeat(m.length));

  // Prefer the unambiguous spaced separator.
  const spaced = masked.indexOf(" - ");
  if (spaced !== -1) {
    const author = normalized.slice(0, spaced).trim();
    const title = normalized.slice(spaced + 3).trim();
    if (author && title) return { author, title };
    return { author: null, title: title || author || normalized };
  }

  // Fall back to the first bare hyphen.
  const hyphen = masked.indexOf("-");
  if (hyphen !== -1) {
    const author = normalized.slice(0, hyphen).trim();
    const title = normalized.slice(hyphen + 1).trim();
    if (author && title) return { author, title };
    return { author: null, title: title || author || normalized };
  }

  return { author: null, title: normalized };
}

/**
 * Strip cataloguing cruft from a title before using it to search Audible: parenthetical/bracketed
 * notes (reader, edition), trailing "read by …" clauses, and dangling separators. Keeps the core
 * title so a folder like "The Gunslinger (DT1 - revised edition - read by George Guidall)" searches
 * (and matches) as "The Gunslinger". Returns the trimmed input if cleaning would empty it.
 */
export function cleanSearchTitle(title: string | null | undefined): string {
  let t = (title ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.replace(/[([{][^)\]}]*[)\]}]/g, " "); // drop (...) [...] {...} groups
  t = t.replace(/\bread by\b.*$/i, " "); // drop a trailing "read by …" clause
  t = t.replace(/\s+/g, " ").replace(/[\s\-–—:]+$/g, "").trim();
  return t || (title ?? "").trim();
}
