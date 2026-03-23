import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { adminOnly } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { getDatabase } from '../db/index.js'
import { isScanRunning, runScan, scanEmitter } from '../scanner/index.js'
import type { ScanProgressEvent } from '../scanner/index.js'

const scan = new Hono<{ Variables: AuthVariables }>()

// All scan management is admin-only (per D-03, D-07, LIBM-01)
scan.use('/*', adminOnly)

// POST /api/scan — trigger manual rescan (per D-03, D-07, LIBM-01)
scan.post('/scan', async (c) => {
  if (isScanRunning()) {
    return c.json({ error: 'Scan already in progress' }, 409)
  }
  const db = getDatabase()
  const libraryRoot = process.env['LIBRARY_ROOT'] ?? '/books'
  // Fire-and-forget — SSE stream carries progress (anti-pattern: do NOT await)
  runScan(db, libraryRoot).catch((err) => {
    console.error('[scan] Manual scan failed:', err)
  })
  return c.json({ ok: true })
})

// GET /api/scan/progress — SSE stream (per D-04, D-05, LIBM-02)
scan.get('/scan/progress', (c) => {
  c.header('X-Accel-Buffering', 'no')  // Prevent nginx/Caddy buffering (Pitfall 1)
  return streamSSE(c, async (stream) => {
    const listener = async (event: ScanProgressEvent) => {
      await stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
      })
    }
    scanEmitter.on('progress', listener)
    stream.onAbort(() => scanEmitter.off('progress', listener))
    await new Promise<void>((resolve) => {
      const onDone = () => {
        scanEmitter.off('progress', listener)
        resolve()
      }
      scanEmitter.once('done', onDone)
      stream.onAbort(onDone)
    })
  })
})

export default scan
