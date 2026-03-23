import { Database } from 'bun:sqlite'

export interface AudnexusBook {
  description?: string
  image?: string
  narrators?: { name: string }[]
  series?: { asin: string; name: string; position?: string }
}

/**
 * Fetch book metadata from Audnexus API by ASIN.
 * Returns null on any failure (network error, 404, timeout) — LIBM-09.
 *
 * Uses AbortController with 5s timeout to prevent hanging scans.
 */
export async function fetchAudnexusBook(asin: string): Promise<AudnexusBook | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`https://api.audnex.us/books/${asin}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'spine/1.0' },
    })
    if (!res.ok) return null
    return await res.json() as AudnexusBook
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Apply Audnexus enrichment to a book in the database.
 *
 * Only fills NULL fields — never overwrites existing non-null data (D-11).
 * Returns true if any updates were applied, false if nothing changed.
 */
export function applyEnrichment(db: Database, bookId: number, data: AudnexusBook): boolean {
  const book = db.query<{
    description: string | null; cover_path: string | null;
    narrator: string | null; series_title: string | null
  }, [number]>(
    'SELECT description, cover_path, narrator, series_title FROM books WHERE id = ?'
  ).get(bookId)
  if (!book) return false

  const updates: string[] = []
  const params: unknown[] = []

  if (!book.description && data.description) {
    updates.push('description = ?'); params.push(data.description)
  }
  if (!book.narrator && data.narrators?.[0]?.name) {
    updates.push('narrator = ?'); params.push(data.narrators[0].name)
  }
  if (!book.series_title && data.series?.name) {
    updates.push('series_title = ?'); params.push(data.series.name)
  }
  if (!book.cover_path && data.image) {
    updates.push('cover_path = ?'); params.push(data.image)
  }

  if (updates.length === 0) return false
  db.prepare(`UPDATE books SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...params, bookId)
  return true
}
