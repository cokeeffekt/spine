import { Hono } from 'hono'
import { adminOnly } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { getDatabase } from '../db/index.js'
import { isScanRunning, runScan, scanEmitter } from '../scanner/index.js'
import type { ScanProgressEvent } from '../scanner/index.js'

const scan = new Hono<{ Variables: AuthVariables }>()

// All scan management is admin-only (per D-03, D-07, LIBM-01)
scan.use('/*', adminOnly)

// POST /api/scan — trigger manual rescan (per D-03, D-07, LIBM-01)
// ?force=true resets all file_mtime values so every book gets re-probed
scan.post('/scan', async (c) => {
  console.log(`[scan-route] POST /api/scan hit — isScanRunning=${isScanRunning()}`)
  if (isScanRunning()) {
    console.log(`[scan-route] Returning 409 — scan already in progress`)
    return c.json({ error: 'Scan already in progress' }, 409)
  }
  const db = getDatabase()
  const force = c.req.query('force') === 'true'
  if (force) {
    const result = db.prepare("UPDATE books SET file_mtime = 0").run()
    console.log(`[scan-route] Force rescan — reset file_mtime for ${result.changes} books`)
  }
  const libraryRoot = process.env['LIBRARY_ROOT'] ?? '/books'
  console.log(`[scan-route] Starting runScan, libraryRoot=${libraryRoot}`)
  console.log(`[scan-route] scanEmitter listener counts BEFORE runScan: progress=${scanEmitter.listenerCount('progress')}, done=${scanEmitter.listenerCount('done')}`)
  // Fire-and-forget — SSE stream carries progress (anti-pattern: do NOT await)
  runScan(db, libraryRoot).catch((err) => {
    console.error('[scan-route] Manual scan failed:', err)
  })
  console.log(`[scan-route] runScan fired (async), returning 200`)
  return c.json({ ok: true })
})

// GET /api/scan/progress — SSE stream using raw ReadableStream for Bun compatibility
scan.get('/scan/progress', (c) => {
  console.log(`[sse] GET /api/scan/progress hit`)
  console.log(`[sse] scanEmitter listener counts BEFORE attach: progress=${scanEmitter.listenerCount('progress')}, done=${scanEmitter.listenerCount('done')}`)
  const stream = new ReadableStream({
    start(controller) {
      console.log(`[sse] ReadableStream start() called — attaching listeners`)
      const encoder = new TextEncoder()
      const write = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
      }

      const listener = (event: ScanProgressEvent) => {
        console.log(`[sse] Received event: ${event.type}${event.type === 'file' ? ` (${event.scanned}/${event.total})` : ''}`)
        try {
          write(event.type, JSON.stringify(event))
        } catch (err) {
          console.log(`[sse] Write failed — client disconnected:`, err)
          cleanup()
        }
      }

      const onDone = () => {
        console.log(`[sse] Scan done — closing SSE stream`)
        cleanup()
        try { controller.close() } catch { /* already closed */ }
      }

      const cleanup = () => {
        scanEmitter.off('progress', listener)
        scanEmitter.off('done', onDone)
      }

      scanEmitter.on('progress', listener)
      scanEmitter.once('done', onDone)
      console.log(`[sse] Listeners attached. progress=${scanEmitter.listenerCount('progress')}, done=${scanEmitter.listenerCount('done')}`)

      // Send initial comment to flush the connection — triggers EventSource onopen
      controller.enqueue(encoder.encode(': connected\n\n'))
      console.log(`[sse] Sent initial flush comment`)
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

export default scan
