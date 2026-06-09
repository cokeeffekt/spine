import { Hono } from 'hono'
import { adminOnly } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { getDatabase } from '../db/index.js'
import { runConverter, convertEmitter, isConvertRunning } from '../convert/index.js'
import type { ConvertProgressEvent } from '../convert/index.js'
import { getConvertOutputDir } from '../config.js'

const convert = new Hono<{ Variables: AuthVariables }>()

// All conversion management is admin-only (mirrors scan routes)
convert.use('/*', adminOnly)

// GET /api/conversions — list jobs joined to the source book's title/author
convert.get('/conversions', (c) => {
  const db = getDatabase()
  const rows = db.query(`
    SELECT j.id, j.source_path, j.source_kind, j.output_path, j.status,
           j.progress, j.chapter_source, j.asin, j.metadata_json, j.error,
           j.created_at, j.updated_at,
           b.title AS source_title, b.author AS source_author
    FROM conversion_jobs j
    LEFT JOIN books b ON b.file_path = j.source_path
    ORDER BY
      CASE j.status WHEN 'processing' THEN 0 WHEN 'pending' THEN 1
                    WHEN 'failed' THEN 2 ELSE 3 END,
      j.updated_at DESC
  `).all()
  return c.json(rows)
})

// PATCH /api/conversions/:id — save edited metadata and re-queue the job
convert.patch('/conversions/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const db = getDatabase()
  const job = db.query<{ id: number }, [number]>('SELECT id FROM conversion_jobs WHERE id = ?').get(id)
  if (!job) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid body' }, 400)

  // Whitelist editable metadata fields
  const allowed = ['title', 'author', 'narrator', 'series_title', 'series_position', 'year', 'genre', 'language', 'publisher', 'description', 'asin']
  const meta: Record<string, string> = {}
  for (const k of allowed) {
    if (typeof body[k] === 'string' && body[k].trim()) meta[k] = body[k].trim()
  }

  db.prepare(
    `UPDATE conversion_jobs SET metadata_json = ?, status = 'pending', progress = 0, error = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(meta), id)

  kickConverter(db)
  return c.json({ ok: true })
})

// POST /api/conversions/:id/retry — re-queue a failed job
convert.post('/conversions/:id/retry', (c) => {
  const id = Number(c.req.param('id'))
  const db = getDatabase()
  const res = db.prepare(
    `UPDATE conversion_jobs SET status = 'pending', progress = 0, error = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(id)
  if (res.changes === 0) return c.json({ error: 'Not found' }, 404)
  kickConverter(db)
  return c.json({ ok: true })
})

// GET /api/conversions/progress — SSE stream of conversion progress
convert.get('/conversions/progress', (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const write = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
      }

      const listener = (event: ConvertProgressEvent) => {
        try {
          write(event.type, JSON.stringify(event))
        } catch {
          cleanup()
        }
      }
      const onDone = () => {
        cleanup()
        try { controller.close() } catch { /* already closed */ }
      }
      const cleanup = () => {
        convertEmitter.off('progress', listener)
        convertEmitter.off('done', onDone)
      }

      convertEmitter.on('progress', listener)
      convertEmitter.once('done', onDone)
      controller.enqueue(encoder.encode(': connected\n\n'))
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})

function kickConverter(db: ReturnType<typeof getDatabase>): void {
  if (!isConvertRunning()) {
    runConverter(db, getConvertOutputDir()).catch((err) => {
      console.error('[convert-route] Converter run failed:', err)
    })
  }
}

export default convert
