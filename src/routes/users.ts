import { Hono } from 'hono'
import { getDatabase } from '../db/index.js'
import { adminOnly } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'

const users = new Hono<{ Variables: AuthVariables }>()

// All user management is admin-only per D-07
users.use('/*', adminOnly)

// POST /api/users — create a new user (per D-07, AUTH-01)
users.post('/users', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || !body.username || !body.password) {
    return c.json({ error: 'Missing username or password' }, 400)
  }

  const { username, password } = body
  const db = getDatabase()

  const existing = db.query<{ id: number }, [string]>(
    'SELECT id FROM users WHERE username = ?'
  ).get(username)
  if (existing) return c.json({ error: 'Username already exists' }, 409)

  const hash = await Bun.password.hash(password) // AUTH-04: Argon2id
  const role = body.role === 'admin' ? 'admin' : 'user' // per D-06: only admin or user

  const result = db.query(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(username, hash, role)

  // bun:sqlite .run() returns { changes, lastInsertRowid }
  return c.json({ id: Number(result.lastInsertRowid), username, role }, 201)
})

// DELETE /api/users/:id — delete a user (per D-07)
users.delete('/users/:id', (c) => {
  const id = Number(c.req.param('id'))
  const currentUserId = c.get('userId')
  if (id === currentUserId) {
    return c.json({ error: 'Cannot delete yourself' }, 400)
  }

  const db = getDatabase()
  const result = db.query('DELETE FROM users WHERE id = ?').run(id)
  if (result.changes === 0) return c.json({ error: 'User not found' }, 404)

  return c.json({ success: true })
})

// PATCH /api/users/:id/password — reset user password (per D-07, D-08)
users.patch('/users/:id/password', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  if (!body || !body.password) {
    return c.json({ error: 'Missing password' }, 400)
  }

  const db = getDatabase()
  const hash = await Bun.password.hash(body.password)
  const result = db.query('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
  if (result.changes === 0) return c.json({ error: 'User not found' }, 404)

  // Invalidate all sessions for this user (security: password changed)
  db.query('DELETE FROM sessions WHERE user_id = ?').run(id)

  return c.json({ success: true })
})

export default users
