import { Hono } from 'hono'
import { getDatabase } from '../db/index.js'
import type { AuthVariables } from '../middleware/auth.js'

const cover = new Hono<{ Variables: AuthVariables }>()

// GET /api/books/:id/cover — serve cover art image (per D-15)
cover.get('/books/:id/cover', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDatabase()
  const book = db.query<{ cover_path: string | null }, [number]>(
    'SELECT cover_path FROM books WHERE id = ? AND is_missing = 0'
  ).get(id)

  if (!book || !book.cover_path) return c.json({ error: 'Not found' }, 404)

  const file = Bun.file(book.cover_path)
  if (!await file.exists()) return c.json({ error: 'Not found' }, 404)

  return new Response(file, {
    headers: {
      'Content-Type': file.type || 'image/jpeg', // Bun auto-detects MIME from extension
      'Cache-Control': 'private, max-age=86400',
    },
  })
})

export default cover
