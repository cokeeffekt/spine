import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { openDatabase, _resetForTests } from "../db/index.js";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { enqueueUnmaterialized } from "./index.js";

let db: Database;
let dbPath: string;

function addBook(file_path: string): void {
  db.query(
    `INSERT INTO books (file_path, file_mtime, file_size, is_missing) VALUES (?, 0, 0, 0)`
  ).run(file_path);
}

beforeEach(() => {
  dbPath = join(tmpdir(), `spine-enqueue-${Date.now()}-${Math.random()}.db`);
  db = openDatabase(dbPath);
});

afterEach(() => {
  db.close();
  for (const ext of ["", "-wal", "-shm"]) {
    try { rmSync(dbPath + ext, { force: true }); } catch { /* ignore */ }
  }
  _resetForTests();
});

describe("enqueueUnmaterialized", () => {
  test("creates one job per source book with correct source_kind", () => {
    addBook("/books/SomeBook.m4b");
    addBook("/books/Charles Stross-Accelerando");

    const n = enqueueUnmaterialized(db, "/converted");
    expect(n).toBe(2);

    const jobs = db.query<{ source_path: string; source_kind: string; status: string }, []>(
      `SELECT source_path, source_kind, status FROM conversion_jobs ORDER BY source_path`
    ).all();
    expect(jobs).toEqual([
      { source_path: "/books/Charles Stross-Accelerando", source_kind: "mp3folder", status: "pending" },
      { source_path: "/books/SomeBook.m4b", source_kind: "m4b", status: "pending" },
    ]);
  });

  test("never enqueues books that live under the output dir", () => {
    addBook("/converted/Author/Title.m4b");
    const n = enqueueUnmaterialized(db, "/converted");
    expect(n).toBe(0);
  });

  test("is idempotent — re-running adds no duplicates", () => {
    addBook("/books/A.m4b");
    expect(enqueueUnmaterialized(db, "/converted")).toBe(1);
    expect(enqueueUnmaterialized(db, "/converted")).toBe(0);
    const count = db.query<{ c: number }, []>(`SELECT COUNT(*) AS c FROM conversion_jobs`).get();
    expect(count?.c).toBe(1);
  });

  test("skips books that already have a job in any state", () => {
    addBook("/books/A.m4b");
    db.query(`INSERT INTO conversion_jobs (source_path, source_kind, status) VALUES ('/books/A.m4b', 'm4b', 'failed')`).run();
    const n = enqueueUnmaterialized(db, "/converted");
    expect(n).toBe(0);
  });
});
