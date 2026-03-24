import type { Database } from "bun:sqlite";

export function initializeDatabase(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path       TEXT    NOT NULL UNIQUE,
      file_mtime      REAL    NOT NULL,
      file_size       INTEGER NOT NULL,
      is_missing      INTEGER NOT NULL DEFAULT 0,
      title           TEXT,
      author          TEXT,
      narrator        TEXT,
      series_title    TEXT,
      series_position TEXT,
      description     TEXT,
      genre           TEXT,
      publisher       TEXT,
      year            TEXT,
      language        TEXT,
      duration_sec    REAL,
      codec           TEXT,
      cover_path      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      chapter_idx  INTEGER NOT NULL,
      title        TEXT,
      start_sec    REAL    NOT NULL,
      end_sec      REAL    NOT NULL,
      duration_sec REAL    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_books_file_path  ON books(file_path);
    CREATE INDEX IF NOT EXISTS idx_books_is_missing ON books(is_missing);
    CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token         TEXT    PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at    TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS progress (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      timestamp   REAL    NOT NULL,
      chapter_idx INTEGER NOT NULL,
      percentage  REAL    NOT NULL,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, book_id)
    );

    CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);
  `);

  // Migration: add last_login_at column to existing databases
  try {
    db.exec(`ALTER TABLE users ADD COLUMN last_login_at TEXT`)
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: add asin column to books table for Audnexus enrichment
  try {
    db.exec(`ALTER TABLE books ADD COLUMN asin TEXT`)
  } catch {
    // Column already exists — safe to ignore
  }
}
