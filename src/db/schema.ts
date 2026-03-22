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
  `);
}
