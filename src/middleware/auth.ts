import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { getDatabase } from '../db/index.js'

export type AuthVariables = {
  userId: number
  role: 'admin' | 'user'
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = getCookie(c, 'session')
    if (!token) return c.json({ error: 'Unauthorized' }, 401)

    const db = getDatabase()
    const session = db.query<
      { user_id: number; role: string; expires_at: string },
      [string]
    >(
      `SELECT s.user_id, u.role, s.expires_at
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).get(token)

    if (!session) return c.json({ error: 'Unauthorized' }, 401)

    c.set('userId', session.user_id)
    c.set('role', session.role as 'admin' | 'user')
    await next()
  }
)

export const adminOnly = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    if (c.get('role') !== 'admin') return c.json({ error: 'Forbidden' }, 403)
    await next()
  }
)
