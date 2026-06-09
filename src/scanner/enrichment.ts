import { Database } from 'bun:sqlite'

export interface AudnexusBook {
  description?: string
  image?: string
  narrators?: { name: string }[]
  series?: { asin: string; name: string; position?: string }
  genres?: { name: string; type?: string }[]
  releaseDate?: string
  language?: string
  publisherName?: string
}

/** Comma-joined genre names (type='genre' preferred), or null. */
export function audnexusGenre(data: AudnexusBook): string | null {
  if (!Array.isArray(data.genres) || data.genres.length === 0) return null
  const typed = data.genres.filter((g) => g.type === 'genre')
  const names = (typed.length > 0 ? typed : data.genres)
    .map((g) => g.name?.trim())
    .filter((n): n is string => !!n)
  return names.length > 0 ? names.join(', ') : null
}

/** Four-digit year extracted from releaseDate (e.g. "2005-07-01" → "2005"), or null. */
export function audnexusYear(data: AudnexusBook): string | null {
  const m = data.releaseDate?.match(/^(\d{4})/)
  return m ? m[1] : null
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

export interface AudnexusChapter {
  title?: string
  startOffsetMs?: number
  startOffsetSec?: number
  lengthMs?: number
}

export interface AudnexusChapters {
  asin?: string
  runtimeLengthSec?: number
  runtimeLengthMs?: number
  isAccurate?: boolean
  chapters: AudnexusChapter[]
}

/**
 * Fetch authoritative chapter markers from Audnexus by ASIN.
 * Returns null on any failure (network error, 404, timeout) — same contract as
 * fetchAudnexusBook. Used to chapterize monolithic (1–2 file) audiobooks.
 */
export async function fetchAudnexusChapters(asin: string): Promise<AudnexusChapters | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`https://api.audnex.us/books/${asin}/chapters`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'spine/1.0' },
    })
    if (!res.ok) return null
    const data = await res.json() as AudnexusChapters
    if (!Array.isArray(data?.chapters) || data.chapters.length === 0) return null
    return data
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
    narrator: string | null; series_title: string | null;
    series_position: string | null; year: string | null;
    genre: string | null; language: string | null; publisher: string | null
  }, [number]>(
    'SELECT description, cover_path, narrator, series_title, series_position, year, genre, language, publisher FROM books WHERE id = ?'
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
  if (!book.series_position && data.series?.position) {
    updates.push('series_position = ?'); params.push(data.series.position)
  }
  if (!book.cover_path && data.image) {
    updates.push('cover_path = ?'); params.push(data.image)
  }
  const genre = audnexusGenre(data)
  if (!book.genre && genre) {
    updates.push('genre = ?'); params.push(genre)
  }
  const year = audnexusYear(data)
  if (!book.year && year) {
    updates.push('year = ?'); params.push(year)
  }
  if (!book.language && data.language) {
    updates.push('language = ?'); params.push(data.language)
  }
  if (!book.publisher && data.publisherName) {
    updates.push('publisher = ?'); params.push(data.publisherName)
  }

  if (updates.length === 0) return false
  db.prepare(`UPDATE books SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...params, bookId)
  return true
}
