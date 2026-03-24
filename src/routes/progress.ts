import { Hono } from 'hono'
import { getDatabase } from '../db/index.js'
import type { AuthVariables } from '../middleware/auth.js'

const progress = new Hono<{ Variables: AuthVariables }>()

// PUT /api/progress/:bookId — push current position (D-14, D-06, D-16)
progress.put('/progress/:bookId', async (c) => {
  const bookId = Number(c.req.param('bookId'))
  const userId = c.get('userId')
  const body = await c.req.json<{ timestamp: number; chapterIdx: number; percentage: number }>()
  const db = getDatabase()

  db.query(`
    INSERT INTO progress (user_id, book_id, timestamp, chapter_idx, percentage, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, book_id) DO UPDATE SET
      timestamp   = excluded.timestamp,
      chapter_idx = excluded.chapter_idx,
      percentage  = excluded.percentage,
      updated_at  = datetime('now')
  `).run(userId, bookId, body.timestamp, body.chapterIdx, body.percentage)

  return c.json({ ok: true })
})

// GET /api/progress — bulk fetch all progress for authenticated user (D-13, D-14)
progress.get('/progress', (c) => {
  const userId = c.get('userId')
  const db = getDatabase()

  const rows = db.query<
    { book_id: number; timestamp: number; chapter_idx: number; percentage: number },
    [number]
  >(`SELECT book_id, timestamp, chapter_idx, percentage FROM progress WHERE user_id = ?`)
    .all(userId)

  const map: Record<string, { timestamp: number; chapterIdx: number; percentage: number }> = {}
  for (const row of rows) {
    map[String(row.book_id)] = {
      timestamp: row.timestamp,
      chapterIdx: row.chapter_idx,
      percentage: row.percentage
    }
  }
  return c.json(map)
})

export default progress
