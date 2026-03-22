import { Hono } from 'hono'
import { getDatabase } from '../db/index.js'
import type { AuthVariables } from '../middleware/auth.js'

const audio = new Hono<{ Variables: AuthVariables }>()

// GET /api/books/:id/audio — stream .m4b with HTTP 206 range support (per D-14, D-16)
audio.get('/books/:id/audio', async (c) => {
  const bookId = Number(c.req.param('id'))
  const db = getDatabase()
  const book = db.query<{ file_path: string }, [number]>(
    'SELECT file_path FROM books WHERE id = ? AND is_missing = 0'
  ).get(bookId)

  if (!book) return c.json({ error: 'Not found' }, 404)

  const file = Bun.file(book.file_path)
  // Pitfall 6: check file exists before using .size
  if (!await file.exists()) return c.json({ error: 'Not found' }, 404)

  const totalSize = file.size

  const rangeHeader = c.req.header('Range')
  if (!rangeHeader) {
    // No Range — serve full file with 200
    return new Response(file, {
      headers: {
        'Content-Type': 'audio/mp4',        // per D-16
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=86400', // per D-16
        'Content-Length': String(totalSize),
      },
    })
  }

  // Parse "bytes=start-end" (per Pattern 4 from RESEARCH)
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${totalSize}` },
    })
  }

  // Pitfall 5: handle open-ended range (bytes=1024-)
  const start = match[1] ? parseInt(match[1], 10) : 0
  const end = match[2] ? parseInt(match[2], 10) : totalSize - 1

  if (start > end || start >= totalSize) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${totalSize}` },
    })
  }

  // Clamp end to totalSize - 1
  const clampedEnd = Math.min(end, totalSize - 1)
  const chunkSize = clampedEnd - start + 1
  // Bun.file().slice() is [start, end) exclusive — so end+1
  const slice = file.slice(start, clampedEnd + 1)

  return new Response(slice, {
    status: 206,
    headers: {
      'Content-Type': 'audio/mp4',
      'Content-Range': `bytes ${start}-${clampedEnd}/${totalSize}`,
      'Content-Length': String(chunkSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=86400',
    },
  })
})

export default audio
