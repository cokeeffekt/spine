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
 * - A spaced separator " - " takes precedence over a bare "-", because titles
 *   often contain hyphens but rarely " - ".
 * - With no separator, author is null and the whole string is the title.
 */
export interface ParsedName {
  author: string | null;
  title: string;
}

export function parseFolderName(name: string): ParsedName {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized) return { author: null, title: "" };

  // Prefer the unambiguous spaced separator.
  const spaced = normalized.indexOf(" - ");
  if (spaced !== -1) {
    const author = normalized.slice(0, spaced).trim();
    const title = normalized.slice(spaced + 3).trim();
    if (author && title) return { author, title };
    return { author: null, title: title || author || normalized };
  }

  // Fall back to the first bare hyphen.
  const hyphen = normalized.indexOf("-");
  if (hyphen !== -1) {
    const author = normalized.slice(0, hyphen).trim();
    const title = normalized.slice(hyphen + 1).trim();
    if (author && title) return { author, title };
    return { author: null, title: title || author || normalized };
  }

  return { author: null, title: normalized };
}
