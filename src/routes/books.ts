import { Hono } from 'hono'
import { getDatabase } from '../db/index.js'
import type { AuthVariables } from '../middleware/auth.js'

const books = new Hono<{ Variables: AuthVariables }>()

// GET /api/books — list all books (per D-10: flat array, no pagination; per D-11: specific fields)
books.get('/books', (c) => {
  const db = getDatabase()
  const rows = db.query(`
    SELECT id, title, author, narrator, duration_sec,
           CASE WHEN cover_path IS NOT NULL
                THEN '/api/books/' || id || '/cover'
                ELSE NULL END AS cover_url,
           EXISTS(SELECT 1 FROM chapters WHERE book_id = books.id) AS has_chapters
    FROM books
    WHERE is_missing = 0
    ORDER BY title COLLATE NOCASE
  `).all()

  return c.json(rows) // per D-09: no envelope wrapper, direct array
})

// GET /api/books/:id — book detail with chapters (per D-12)
books.get('/books/:id', (c) => {
  const id = Number(c.req.param('id'))
  const db = getDatabase()

  const book = db.query<any, [number]>(`
    SELECT id, title, author, narrator, series_title, series_position,
           description, genre, publisher, year, language,
           duration_sec, codec,
           CASE WHEN cover_path IS NOT NULL
                THEN '/api/books/' || id || '/cover'
                ELSE NULL END AS cover_url
    FROM books
    WHERE id = ? AND is_missing = 0
  `).get(id)

  if (!book) return c.json({ error: 'Not found' }, 404)

  const chapters = db.query<any, [number]>(`
    SELECT id, chapter_idx, title, start_sec, end_sec, duration_sec
    FROM chapters
    WHERE book_id = ?
    ORDER BY chapter_idx
  `).all(id)

  return c.json({ ...book, chapters }) // per D-12
})

export default books
