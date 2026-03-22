import type { Database } from "bun:sqlite";

export async function bootstrapAdmin(db: Database): Promise<void> {
  const username = process.env['ADMIN_USERNAME'];
  const password = process.env['ADMIN_PASSWORD'];
  const count = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM users').get()!.n;

  if (count > 0) return;

  if (!username || !password) {
    console.warn('[auth] No users exist. Set ADMIN_USERNAME + ADMIN_PASSWORD to create first admin.');
    return;
  }

  const hash = await Bun.password.hash(password);
  db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
    username, hash, 'admin'
  );
  console.log(`[auth] Admin account '${username}' created.`);
}
