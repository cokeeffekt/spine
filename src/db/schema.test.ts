import { describe, it, expect, afterEach } from "bun:test";
import { openDatabase } from "./index.js";
import { rmSync } from "fs";

// WAL mode is only supported on file-based databases, not :memory:
const TMP_DB = "/tmp/spine-test-wal.db";

describe("SQLite schema", () => {
  afterEach(() => {
    // Clean up WAL test database files
    try {
      rmSync(TMP_DB, { force: true });
      rmSync(`${TMP_DB}-wal`, { force: true });
      rmSync(`${TMP_DB}-shm`, { force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("creates books table with all columns", () => {
    const db = openDatabase(":memory:");
    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(books)")
      .all();
    const columnNames = columns.map((col) => col.name);

    expect(columnNames).toContain("file_path");
    expect(columnNames).toContain("title");
    expect(columnNames).toContain("author");
    expect(columnNames).toContain("narrator");
    expect(columnNames).toContain("series_title");
    expect(columnNames).toContain("series_position");
    expect(columnNames).toContain("description");
    expect(columnNames).toContain("genre");
    expect(columnNames).toContain("publisher");
    expect(columnNames).toContain("year");
    expect(columnNames).toContain("language");
    expect(columnNames).toContain("duration_sec");
    expect(columnNames).toContain("codec");
    expect(columnNames).toContain("cover_path");
    expect(columnNames).toContain("is_missing");

    db.close();
  });

  it("creates chapters table with foreign key", () => {
    const db = openDatabase(":memory:");
    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(chapters)")
      .all();
    const columnNames = columns.map((col) => col.name);

    expect(columnNames).toContain("book_id");
    expect(columnNames).toContain("chapter_idx");
    expect(columnNames).toContain("title");
    expect(columnNames).toContain("start_sec");
    expect(columnNames).toContain("end_sec");
    expect(columnNames).toContain("duration_sec");

    db.close();
  });

  it("WAL mode is active on file-based database", () => {
    const db = openDatabase(TMP_DB);
    const result = db
      .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
      .get();
    expect(result?.journal_mode).toBe("wal");
    db.close();
  });

  it("foreign keys are enabled", () => {
    const db = openDatabase(":memory:");
    const result = db
      .query<{ foreign_keys: number }, []>("PRAGMA foreign_keys")
      .get();
    expect(result?.foreign_keys).toBe(1);
    db.close();
  });
});
