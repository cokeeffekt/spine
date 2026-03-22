import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { randomBytes } from 'node:crypto'
import { getDatabase } from '../db/index.js'

const auth = new Hono()

auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || !body.username || !body.password) {
    return c.json({ error: 'Missing username or password' }, 400)
  }
  const { username, password } = body

  const db = getDatabase()
  const user = db.query<{ id: number; password_hash: string; role: string }, [string]>(
    'SELECT id, password_hash, role FROM users WHERE username = ?'
  ).get(username)

  // Constant-time: always verify even if user not found (prevents timing-based user enumeration)
  const dummyHash = '$argon2id$v=19$m=65536,t=2,p=1$dummysaltdummysalt$dummyhashdummyhashdummyhash'
  const valid = user
    ? await Bun.password.verify(password, user.password_hash)
    : await Bun.password.verify(password, dummyHash).catch(() => false)

  if (!user || !valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  db.query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token, user.id, expiresAt.toISOString()
  )

  const isProduction = process.env['NODE_ENV'] === 'production'
  setCookie(c, 'session', token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: isProduction,
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  return c.json({ role: user.role })
})

auth.post('/logout', async (c) => {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const db = getDatabase()
  db.query('DELETE FROM sessions WHERE token = ?').run(token)

  deleteCookie(c, 'session', { path: '/' })
  return c.json({ success: true })
})

export default auth
